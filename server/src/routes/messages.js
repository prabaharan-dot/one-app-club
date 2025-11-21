const express = require('express')
const router = express.Router()
const db = require('../db')
const {google} = require('googleapis')
const llmProcessor = require('../llm/processor')

// GET /api/messages/pending
// Returns counts and a list of messages that require action for the current user
router.get('/pending', async (req, res) => {
  try{
    const userId = req.session && req.session.userId
    if(!userId) return res.status(401).json({error:'not_logged_in'})

    const unreadRes = await db.query('SELECT count(*) FROM messages WHERE user_id=$1 AND is_read=false', [userId])
    const actionRes = await db.query("SELECT count(*) FROM messages WHERE user_id=$1 AND action_required=true AND (actioned IS NULL OR actioned = false)",[userId])

    const itemsQ = `
      SELECT m.id, m.external_message_id, m.sender, m.subject, m.body_plain, m.received_at, m.action_suggested,
        ma.suggested_actions as latest_suggested, ma.created_at as suggested_at
      FROM messages m
      LEFT JOIN LATERAL (
        SELECT suggested_actions, created_at FROM message_actions ma WHERE ma.message_id = m.id ORDER BY created_at DESC LIMIT 1
      ) ma ON true
      WHERE m.user_id = $1 AND m.action_required = true AND (m.actioned IS NULL OR m.actioned = false)
      ORDER BY m.received_at DESC
      LIMIT 50
    `

    const itemsRes = await db.query(itemsQ, [userId])

    const items = itemsRes.rows.map(r=>{
      // Parse the enhanced analysis data
      let analysisData = null
      let suggestedActions = []
      
      try {
        const rawSuggested = r.latest_suggested || r.action_suggested || null
        if (rawSuggested) {
          analysisData = typeof rawSuggested === 'string' ? JSON.parse(rawSuggested) : rawSuggested
          
          // Handle both old and new data formats
          if (analysisData.suggested_actions) {
            // New enhanced format
            suggestedActions = analysisData.suggested_actions
          } else if (Array.isArray(analysisData)) {
            // Old format - direct array of actions
            suggestedActions = analysisData
          }
        }
      } catch (err) {
        console.error('Error parsing suggested actions for message', r.id, err)
      }
      
      return {
        id: r.id,
        external_message_id: r.external_message_id,
        sender: r.sender,
        subject: r.subject,
        snippet: (r.body_plain && r.body_plain.substring(0,200)) || '',
        received_at: r.received_at,
        // Enhanced analysis data
        summary: analysisData?.summary || null,
        priority_level: analysisData?.priority_level || 'medium',
        category: analysisData?.category || 'general',
        sentiment: analysisData?.sentiment || 'neutral',
        suggested: suggestedActions, // Array of action objects
        suggested_at: r.suggested_at,
        analysis_timestamp: analysisData?.analysis_timestamp || null
      }
    })

    // Compute immediate action count using enhanced confidence scores
    let immediateCount = 0
    for(const item of items){
      const actions = item.suggested || []
      if(Array.isArray(actions)){
        // Count high-confidence or high-priority actions as immediate
        const hasImmediate = actions.some(action => 
          action.confidence > 0.7 || 
          ['create_task', 'create_event', 'draft_reply', 'mark_as_priority'].includes(action.type) ||
          item.priority_level === 'high'
        )
        if (hasImmediate) immediateCount++
      }
    }

    res.json({ total_unread: parseInt(unreadRes.rows[0].count,10), total_action_required: parseInt(actionRes.rows[0].count,10), immediate_action: immediateCount, items })
  }catch(e){
    console.error('pending messages error', e)
    res.status(500).json({error:'server_error'})
  }
})

// POST /api/messages/:id/prepare
// Run LLM on the message and return suggested actions (do not execute)
router.post('/:id/prepare', async (req,res)=>{
  try{
    const userId = req.session && req.session.userId
    if(!userId) return res.status(401).json({error:'not_logged_in'})
    const msgId = req.params.id

    const mres = await db.query('SELECT * FROM messages WHERE id=$1 AND user_id=$2', [msgId, userId])
    if(mres.rowCount===0) return res.status(404).json({error:'not_found'})
    const msg = mres.rows[0]

    // client may send selectedAction when user picked one of the earlier suggestions
    // e.g. { type: 'create_event', payload: { duration: 60, preferred_time: 'afternoon' } }
    const selectedAction = req.body && req.body.selectedAction ? req.body.selectedAction : null

    // get user-specific llm key
    const ures = await db.query('SELECT llm_key_encrypted, llm_model FROM user_settings WHERE user_id=$1', [userId])
    const opts = (ures.rowCount>0) ? {apiKey: ures.rows[0].llm_key_encrypted.toString(), model: ures.rows[0].llm_model} : {}

    const email = {id: msg.external_message_id, from: msg.sender, subject: msg.subject, snippet: (msg.body_plain||'').slice(0,200), body: msg.body_plain || msg.body}

    // If the selected action requires calendar analysis, try to gather calendar free/busy info
    let calendarBusy = null
    if(selectedAction && selectedAction.type === 'create_event'){
      try{
        const ires = await db.query("SELECT * FROM integrations WHERE user_id=$1 AND platform='gmail' AND enabled=true LIMIT 1", [userId])
        if(ires.rowCount>0){
          const integration = ires.rows[0]
          const tokens = JSON.parse(integration.oauth_token_encrypted.toString())
          const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
          o.setCredentials(tokens)
          const calendar = google.calendar({version:'v3', auth:o})
          const now = new Date()
          const timeMin = now.toISOString()
          const timeMax = new Date(now.getTime() + (3*24*60*60*1000)).toISOString() // next 3 days
          const fbRes = await calendar.freebusy.query({requestBody: {timeMin, timeMax, items: [{id:'primary'}]}})
          calendarBusy = (fbRes && fbRes.data && fbRes.data.calendars && fbRes.data.calendars.primary && fbRes.data.calendars.primary.busy) ? fbRes.data.calendars.primary.busy : []
        }
      }catch(err){
        console.warn('calendar freebusy failed', err.message || err)
        // proceed without calendar context
        calendarBusy = null
      }
    }

    // pass selectedAction and calendarBusy as additional context to the LLM processor
    // The processor should inspect these fields and produce follow-up questions or refined payload suggestions
    let result
    if(typeof llmProcessor.followupActionOnEmail === 'function'){
      result = await llmProcessor.followupActionOnEmail({id: userId, preferences:{}}, email, opts, {selectedAction, calendarBusy})
    } else {
      // fallback for older processor implementations: include context in email object
      email.followupContext = {selectedAction, calendarBusy}
      if(typeof llmProcessor.processEmail === 'function'){
        result = await llmProcessor.processEmail({id: userId, preferences:{}}, email, opts)
      } else {
        result = {actions: []}
      }
    }

    // Expect the processor to return { actions: [...], followups?: [...] }
    res.json({actions: result.actions || [], followups: result.followups || []})
  }catch(e){
    console.error('prepare error', e)
    res.status(500).json({error:'server_error'})
  }
})

// POST /api/messages/:id/action
router.post('/:id/action', async (req, res) => {
  try{
    const userId = req.session && req.session.userId
    if(!userId) return res.status(401).json({error:'not_logged_in'})
    const msgId = req.params.id
    const {actionType, payload} = req.body
    if(!actionType) return res.status(400).json({error:'missing_actionType'})

    // fetch message
    const mres = await db.query('SELECT * FROM messages WHERE id=$1 AND user_id=$2', [msgId, userId])
    if(mres.rowCount===0) return res.status(404).json({error:'not_found'})
    const msg = mres.rows[0]

    // fetch gmail integration for user
    const ires = await db.query("SELECT * FROM integrations WHERE user_id=$1 AND platform='gmail' AND enabled=true LIMIT 1", [userId])
    if(ires.rowCount===0) return res.status(400).json({error:'no_integration'})
    const integration = ires.rows[0]
    const tokens = JSON.parse(integration.oauth_token_encrypted.toString())

    const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    o.setCredentials(tokens)
    const gmail = google.gmail({version:'v1', auth:o})
    const calendar = google.calendar({version:'v3', auth:o})
    const tasks = google.tasks({version:'v1', auth:o})

    // perform action
    let result = null
    switch(actionType){
      case 'mark_read':
        result = await gmail.users.messages.modify({userId:'me', id: msg.external_message_id, requestBody:{removeLabelIds:['UNREAD']}})
        break
      case 'delete':
        // move to trash
        result = await gmail.users.messages.trash({userId:'me', id: msg.external_message_id})
        break
      case 'create_task':
        if(!payload || !payload.title) return res.status(400).json({error:'missing_task'})
        result = await tasks.tasks.insert({tasklist:'@default', requestBody: {title: payload.title, notes: payload.notes || ''}})
        break
      case 'create_event':
        if(!payload || !payload.start || !payload.end) return res.status(400).json({error:'missing_event_times'})
        result = await calendar.events.insert({calendarId:'primary', requestBody: {summary: payload.title || payload.summary, description: payload.description || '', start: {dateTime: payload.start}, end: {dateTime: payload.end}}})
        break
      case 'reply':
        if(!payload || !payload.body) return res.status(400).json({error:'missing_body'})
        const fromHeader = (msg.sender || '')
        const to = (fromHeader.match(/<(.+)>/) || [null, fromHeader])[1] || fromHeader
        const raw = `To: ${to}\r\nSubject: Re: ${msg.subject || ''}\r\n\r\n${payload.body}`
        const rawEncoded = Buffer.from(raw).toString('base64')
        result = await gmail.users.messages.send({userId:'me', requestBody:{raw: rawEncoded}})
        break
      case 'forward':
        if(!payload || !payload.to) return res.status(400).json({error:'missing_to'})
        const toAddr = payload.to
        const fraw = `To: ${toAddr}\r\nSubject: Fwd: ${msg.subject || ''}\r\n\r\nForwarded message:\n\n${msg.body_plain || msg.body || ''}`
        result = await gmail.users.messages.send({userId:'me', requestBody:{raw: Buffer.from(fraw).toString('base64')}})
        break
      default:
        return res.status(400).json({error:'unknown_action'})
    }

    // mark message as actioned
    await db.query('UPDATE messages SET actioned=true WHERE id=$1', [msgId])
    // insert audit log (user-scoped schema)
    await db.query('INSERT INTO audit_logs (user_id, action, payload, created_at) VALUES ($1,$2,$3,now())', [userId, actionType, JSON.stringify({payload, result: result && result.data ? result.data : result})])

    res.json({ok:true, result: result && result.data ? result.data : result})
  }catch(e){
    console.error('action exec error', e)
    res.status(500).json({error:'server_error', detail: e.message})
  }
})

module.exports = router
