const {google} = require('googleapis')
const db = require('../../db')
const actions = require('./actions')
const { convert } = require('html-to-text')
const striptags = require('striptags')

const POLL_INTERVAL = parseInt(process.env.GOOGLE_POLL_INTERVAL || '300000') // 5 minutes

async function getIntegrations(){
  const res = await db.query("SELECT * FROM integrations WHERE platform='gmail' AND enabled = true")
  return res.rows
}

function oauthClientFromTokens(tokens){
  const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  o.setCredentials(JSON.parse(tokens))
  return o
}



async function getLastPollTime(userId){
  try{
    const r = await db.query('SELECT last_gmail_poll FROM users WHERE id=$1', [userId])
    if(r.rowCount===0) return null
    return r.rows[0].last_gmail_poll
  }catch(e){return null}
}

async function updateLastPollTime(userId){
  try{
    await db.query('UPDATE users SET last_gmail_poll=now() WHERE id=$1', [userId])
  }catch(e){console.error('update poll time fail', e)}
}

async function upsertMessage(userId, platform, externalId, meta){
  // insert or update message, return id
  const q = `INSERT INTO messages (user_id, platform, external_message_id, sender, recipient, subject, body, body_plain, attachments, received_at, metadata, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
    ON CONFLICT (platform, external_message_id, user_id) DO UPDATE SET sender=EXCLUDED.sender, recipient=EXCLUDED.recipient, subject=EXCLUDED.subject, body=EXCLUDED.body, body_plain=EXCLUDED.body_plain, attachments=EXCLUDED.attachments, received_at=EXCLUDED.received_at, metadata=EXCLUDED.metadata RETURNING id`;
  const vals = [userId, platform, externalId, meta.sender, JSON.stringify(meta.recipient||{}), meta.subject, meta.body, meta.body_plain, JSON.stringify(meta.attachments||{}), meta.received_at, JSON.stringify(meta.metadata||{})]
  const r = await db.query(q, vals)
  return r.rows[0].id
}



async function poll(){
  console.log('google poller running')
  const rows = await getIntegrations()
  for(const row of rows){
    try{
      const o = oauthClientFromTokens(row.oauth_token_encrypted.toString())
      const gmail = google.gmail({version:'v1', auth:o})
      
      // get last poll time for this user
      const lastPoll = await getLastPollTime(row.user_id)
      let query = 'is:unread'
      if(lastPoll){
        // format date for gmail search: after:2023/11/19
        const afterDate = new Date(lastPoll).toISOString().split('T')[0].replace(/-/g,'/')
        query += ` after:${afterDate}`
      }
      
      // list recent messages since last poll
      const r = await gmail.users.messages.list({userId:'me', maxResults:50, q:query})
      const messages = r.data.messages || []
      
      console.log(`Found ${messages.length} messages for user ${row.user_id}`)
      
      // Store messages only - LLM processing happens in separate job
      for(const m of messages){
        try{
          const full = await gmail.users.messages.get({userId:'me', id:m.id, format:'full'})
          const body = extractPlainText(full.data)
          const receivedDate = parseHeader(full.data, 'Date')
          const receivedAt = receivedDate ? new Date(receivedDate).toISOString() : new Date().toISOString()
          
          // Save message to DB - LLM processing job will handle the rest
          await upsertMessage(row.user_id, 'gmail', m.id, {
            sender: parseFrom(full.data), 
            recipient: null, 
            subject: parseHeader(full.data,'Subject'), 
            body: full.data.snippet, 
            body_plain: body, 
            attachments: null, 
            received_at: receivedAt, 
            metadata: {}
          })

        }catch(e){ console.error('message fetch fail', e.message || e) }
      }
      
      // update last poll time for this user
      await updateLastPollTime(row.user_id)
      
    }catch(e){ console.error('poll row fail', e.message || e) }
  }
}

function extractPlainText(message){
  try{
    let textContent = ''
    
    // First try to extract from message parts
    if(message.payload && message.payload.parts && message.payload.parts.length > 0){
      textContent = extractFromParts(message.payload.parts)
    } 
    // If no parts, try direct body
    else if(message.payload && message.payload.body && message.payload.body.data){
      const mimeType = message.payload.mimeType || 'text/plain'
      const rawContent = Buffer.from(message.payload.body.data, 'base64').toString('utf8')
      textContent = processContentByMimeType(rawContent, mimeType)
    }
    
    // Fallback to snippet if no content found
    if(!textContent && message.snippet){
      textContent = message.snippet
    }
    
    // Clean and normalize the text
    return cleanEmailText(textContent)
    
  }catch(e){
    console.error('extractPlainText error:', e.message)
    return message.snippet || ''
  }
}

function extractFromParts(parts, depth = 0){
  if(depth > 3) return '' // Prevent infinite recursion
  
  let textContent = ''
  
  for(const part of parts){
    // Handle nested parts recursively
    if(part.parts && part.parts.length > 0){
      textContent += extractFromParts(part.parts, depth + 1)
    }
    // Extract content from this part
    else if(part.body && part.body.data){
      const mimeType = part.mimeType || 'text/plain'
      const rawContent = Buffer.from(part.body.data, 'base64').toString('utf8')
      const processedContent = processContentByMimeType(rawContent, mimeType)
      
      if(processedContent){
        textContent += processedContent + '\n'
      }
    }
  }
  
  return textContent
}

function processContentByMimeType(content, mimeType){
  try{
    switch(mimeType.toLowerCase()){
      case 'text/plain':
        return content
        
      case 'text/html':
        // Convert HTML to clean text
        return convert(content, {
          wordwrap: false,
          selectors: [
            // Remove common email signatures and footers
            { selector: 'div[class*="signature"]', format: 'skip' },
            { selector: 'div[class*="footer"]', format: 'skip' },
            { selector: '.gmail_signature', format: 'skip' },
            { selector: '.outlook_signature', format: 'skip' },
            // Remove tracking pixels and images
            { selector: 'img[width="1"]', format: 'skip' },
            { selector: 'img[height="1"]', format: 'skip' },
            // Clean up links
            { selector: 'a', options: { ignoreHref: true } },
            // Handle lists properly
            { selector: 'ul', options: { uppercase: false } },
            { selector: 'ol', options: { uppercase: false } }
          ]
        })
        
      default:
        // For other mime types, try to strip HTML tags if present
        return striptags(content)
    }
  }catch(e){
    console.error('processContentByMimeType error:', e.message)
    return striptags(content) // Fallback to simple tag stripping
  }
}

function cleanEmailText(text){
  if(!text) return ''
  
  // Remove excessive whitespace and normalize line breaks
  let cleaned = text
    .replace(/\r\n/g, '\n')           // Normalize line endings
    .replace(/\r/g, '\n')             // Handle old Mac line endings
    .replace(/\u00A0/g, ' ')          // Replace non-breaking spaces with regular spaces
    .replace(/\u2028/g, '\n')         // Replace line separator with newline
    .replace(/\u2029/g, '\n')         // Replace paragraph separator with newline
    .replace(/[\t\v\f\r ]+/g, ' ')    // Replace multiple whitespace chars with single space
    .replace(/\n{3,}/g, '\n\n')       // Limit consecutive line breaks to 2
    .replace(/^\s+|\s+$/gm, '')       // Trim whitespace from each line
    .replace(/\n\s*\n/g, '\n\n')      // Clean up lines with only whitespace
  
  // Remove common email artifacts and fix spacing issues
  cleaned = cleaned
    .replace(/^>.*$/gm, '')           // Remove quoted text lines
    .replace(/^From:.*$/gim, '')      // Remove forwarded email headers
    .replace(/^To:.*$/gim, '')
    .replace(/^Cc:.*$/gim, '')
    .replace(/^Subject:.*$/gim, '')
    .replace(/^Date:.*$/gim, '')
    .replace(/^Sent:.*$/gim, '')
    .replace(/^Reply-To:.*$/gim, '')
    .replace(/\s+,/g, ',')            // Remove spaces before commas
    .replace(/,(\S)/g, ', $1')        // Ensure space after commas
    .replace(/\s+\./g, '.')           // Remove spaces before periods
    .replace(/\.(\w)/g, '. $1')       // Ensure space after periods (if followed by word)
    .replace(/\s+:/g, ':')            // Remove spaces before colons
    .replace(/:(\S)/g, ': $1')        // Ensure space after colons (if followed by non-space)
    
  // Remove common signature separators
  cleaned = cleaned
    .replace(/^--\s*$/gm, '')         // Standard signature separator
    .replace(/^_{5,}$/gm, '')         // Underscore separators
    .replace(/^-{5,}$/gm, '')         // Dash separators
    .replace(/^={5,}$/gm, '')         // Equal sign separators
    
  // Remove email client footers
  cleaned = cleaned
    .replace(/Sent from my iPhone/gi, '')
    .replace(/Sent from my iPad/gi, '')
    .replace(/Sent from my Android/gi, '')
    .replace(/Sent from Outlook/gi, '')
    .replace(/Get Outlook for \w+/gi, '')
    
  // Remove tracking and unsubscribe text
  cleaned = cleaned
    .replace(/This email was sent to.*$/gim, '')
    .replace(/If you no longer wish to receive.*$/gim, '')
    .replace(/To unsubscribe.*$/gim, '')
    .replace(/Click here to unsubscribe.*$/gim, '')
    .replace(/View this email in your browser.*$/gim, '')
    
  // Remove excessive punctuation
  cleaned = cleaned
    .replace(/[!]{2,}/g, '!')         // Multiple exclamation marks
    .replace(/[?]{2,}/g, '?')         // Multiple question marks
    .replace(/[.]{3,}/g, '...')       // Multiple dots to ellipsis
    
  // Final cleanup - aggressive whitespace and newline removal
  cleaned = cleaned
    .replace(/\s+([.!?])/g, '$1')     // Remove spaces before punctuation
    .replace(/([.!?])\s+/g, '$1 ')    // Ensure single space after punctuation
    .replace(/[ \t]+\n/g, '\n')       // Remove trailing spaces before newlines
    .replace(/\n[ \t]+/g, '\n')       // Remove leading spaces after newlines  
    .replace(/\n{3,}/g, '\n\n')       // Again limit line breaks to max 2
    .replace(/^\s+|\s+$/g, '')        // Trim start and end whitespace
    .replace(/[ \t]{2,}/g, ' ')       // Final pass on multiple spaces
    
  // Remove lines that are just punctuation, very short, or only whitespace
  const lines = cleaned.split('\n').filter(line => {
    const trimmed = line.trim()
    // Keep lines that are at least 3 chars and contain word characters
    return trimmed.length > 2 && /\w/.test(trimmed) && !/^[^\w]*$/.test(trimmed)
  })
  
  // Join lines and do final whitespace cleanup
  let result = lines.join('\n')
    .replace(/\n{2,}/g, '\n\n')       // Ensure max 2 consecutive newlines
    .replace(/^\n+|\n+$/g, '')        // Remove leading/trailing newlines
    .trim()                           // Final trim
  
  return result
}

function parseHeader(message, name){
  try{ const h = message.payload.headers.find(h=>h.name===name); return h && h.value }catch(e){return null}
}

function parseFrom(message){
  return parseHeader(message,'From')
}

function makeRawReply(message, body){
  // naive raw reply builder - for demo only
  const from = parseHeader(message,'From') || ''
  const subject = parseHeader(message,'Subject') || ''
  const to = from.match(/<(.+)>/i) ? from.match(/<(.+)>/i)[1] : from
  const raw = `To: ${to}\r\nSubject: Re: ${subject}\r\n\r\n${body}`
  return Buffer.from(raw).toString('base64')
}

let timer = null
module.exports = { start: ()=>{ if(timer) return; timer = setInterval(poll, POLL_INTERVAL); poll().catch(e=>console.error(e)) }, stop: ()=>{ if(timer) clearInterval(timer); timer=null } }
