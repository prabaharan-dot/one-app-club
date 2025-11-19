const {google} = require('googleapis')
const db = require('../../db')
const actions = require('./actions')
const llmProcessor = require('../../llm/processor')

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

async function getUserLLMKey(userId){
  try{
    const r = await db.query('SELECT llm_key_encrypted, llm_model FROM user_settings WHERE user_id=$1', [userId])
    if(r.rowCount===0) return null
    return {key: r.rows[0].llm_key_encrypted.toString(), model: r.rows[0].llm_model}
  }catch(e){return null}
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

async function storeActions(messageId, userId, actionsList){
  await db.query('INSERT INTO message_actions (message_id, user_id, suggested_actions, created_at, acted) VALUES ($1,$2,$3,now(),false)', [messageId, userId, JSON.stringify(actionsList)])
  await db.query('UPDATE messages SET action_required=true, action_suggested=$1 WHERE id=$2', [JSON.stringify(actionsList), messageId])
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
      
      // store all messages first, then process
      const storedMessages = []
      for(const m of messages){
        try{
          const full = await gmail.users.messages.get({userId:'me', id:m.id, format:'full'})
          const body = extractPlainText(full.data)
          const receivedDate = parseHeader(full.data, 'Date')
          const receivedAt = receivedDate ? new Date(receivedDate).toISOString() : new Date().toISOString()
          
          // save message to DB first
          const msgId = await upsertMessage(row.user_id, 'gmail', m.id, {
            sender: parseFrom(full.data), 
            recipient: null, 
            subject: parseHeader(full.data,'Subject'), 
            body: full.data.snippet, 
            body_plain: body, 
            attachments: null, 
            received_at: receivedAt, 
            metadata: {}
          })
          
          storedMessages.push({
            msgId,
            email: {
              id: m.id, 
              from: parseFrom(full.data), 
              subject: parseHeader(full.data,'Subject'), 
              snippet: full.data.snippet, 
              body
            }
          })

        }catch(e){ console.error('message fetch fail', e.message || e) }
      }
      
      // now process stored messages for LLM suggestions
      for(const stored of storedMessages){
        try{
          const userLLM = await getUserLLMKey(row.user_id)
          const opts = userLLM ? {apiKey: userLLM.key, model: userLLM.model} : {}
          
          // run LLM processor to get suggested actions
          const result = await llmProcessor.processEmail({id:row.user_id, preferences:{}}, stored.email, opts)
          const acts = (result && result.actions) || []
          if(acts.length>0){
            await storeActions(stored.msgId, row.user_id, acts)
          }
        }catch(e){ console.error('message process fail', e.message || e) }
      }
      
      // update last poll time for this user
      await updateLastPollTime(row.user_id)
      
    }catch(e){ console.error('poll row fail', e.message || e) }
  }
}

function extractPlainText(message){
  try{
    const parts = message.payload && message.payload.parts
    if(!parts) return ''
    const p = parts.find(pp=>pp.mimeType==='text/plain')
    if(p && p.body && p.body.data) return Buffer.from(p.body.data, 'base64').toString('utf8')
    return ''
  }catch(e){return ''}
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
