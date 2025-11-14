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

async function poll(){
  console.log('google poller running')
  const rows = await getIntegrations()
  for(const row of rows){
    try{
      const o = oauthClientFromTokens(row.oauth_token_encrypted.toString())
      const gmail = google.gmail({version:'v1', auth:o})
      // list recent messages
      const r = await gmail.users.messages.list({userId:'me', maxResults:10, q:'is:unread'})
      const messages = r.data.messages || []
      for(const m of messages){
        try{
          const full = await gmail.users.messages.get({userId:'me', id:m.id, format:'full'})
          const body = extractPlainText(full.data)
          const email = {id:m.id, from: parseFrom(full.data), subject: parseHeader(full.data,'Subject'), snippet: full.data.snippet, body}
          // get user-specific llm key
          const userLLM = await getUserLLMKey(row.tenant_id)
          const opts = userLLM ? {apiKey: userLLM.key, model: userLLM.model} : {}
          // run LLM processor
          const result = await llmProcessor.processEmail({id:row.tenant_id, preferences:{}}, email, opts)
          const acts = (result && result.actions) || []
          for(const act of acts){
            try{
              switch(act.type){
                case 'flag':
                  await actions.modifyMessage(o, m.id, act)
                  break
                case 'create_task':
                  await actions.createTask(o, {title:act.title, notes:act.notes})
                  break
                case 'create_event':
                  await actions.createCalendarEvent(o, {summary: act.title, description: act.notes, start: {dateTime:act.start}, end:{dateTime:act.end}})
                  break
                case 'reply':
                  if(act.send) await actions.sendGmail(o, makeRawReply(full.data, act.body))
                  break
                case 'mark_read':
                  await actions.modifyMessage(o, m.id, {removeLabelIds:['UNREAD']})
                  break
                default:
                  console.log('unknown act', act)
              }
            }catch(e){ console.error('action fail', e.message || e) }
          }
        }catch(e){ console.error('message fetch fail', e.message || e) }
      }
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
