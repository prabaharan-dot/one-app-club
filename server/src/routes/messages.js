const express = require('express')
const router = express.Router()
const db = require('../db')
const {google} = require('googleapis')
const llmProcessor = require('../llm/processor')
const integrationsService = require('../services/integrations')
const integrationUtils = require('../utils/integrations')
const { createDefaultMeetingTimes, parseUserTimeInput, formatTimeForUser } = require('../utils/timezone')

// Helper function to handle permission errors
function handlePermissionError(actionType, error) {
  console.error(`Permission error for ${actionType}:`, error.message)
  
  const permissionRequiredMap = {
    'mark_read': 'gmail.modify',
    'delete': 'gmail.modify', 
    'reply': 'gmail.send',
    'draft_reply': 'gmail.send',
    'create_event': 'calendar',
    'create_meeting': 'calendar',
    'create_task': 'tasks'
  }
  
  const requiredPermission = permissionRequiredMap[actionType] || 'unknown'
  
  return {
    error: 'insufficient_permissions',
    actionType,
    requiredPermission,
    message: `This action requires additional Google permissions. Please grant ${requiredPermission} access.`,
    reauthUrl: '/api/auth/reauth',
    errorCode: error.code || 403
  }
}

// Helper function to build Google Calendar recurrence rules
function buildRecurrenceRule(recurringData) {
  if (!recurringData || !recurringData.enabled) return null
  
  try {
    const { frequency, interval = 1, end_date, occurrences } = recurringData
    
    let rule = 'RRULE:'
    
    // Set frequency
    switch (frequency?.toLowerCase()) {
      case 'daily':
        rule += 'FREQ=DAILY'
        break
      case 'weekly':
        rule += 'FREQ=WEEKLY'
        break
      case 'monthly':
        rule += 'FREQ=MONTHLY'
        break
      case 'yearly':
        rule += 'FREQ=YEARLY'
        break
      default:
        return null
    }
    
    // Set interval if not 1
    if (interval > 1) {
      rule += `;INTERVAL=${interval}`
    }
    
    // Set end condition (either end date or count)
    if (end_date) {
      const endDate = new Date(end_date)
      const utcEndDate = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
      rule += `;UNTIL=${utcEndDate}`
    } else if (occurrences && occurrences > 0) {
      rule += `;COUNT=${occurrences}`
    }
    
    console.log(`🔄 Generated recurrence rule: ${rule}`)
    return [rule]
  } catch (error) {
    console.error('Error building recurrence rule:', error)
    return null
  }
}

// GET /api/messages/unread
// Returns all unread messages for the current user
router.get('/unread', async (req, res) => {
  try{
    if(!req.user) return res.status(401).json({error:'not_logged_in'})
    const userId = req.user.id

    const unreadRes = await db.query('SELECT count(*) FROM messages WHERE user_id=$1 AND is_read=false', [userId])
    const actionRes = await db.query("SELECT count(*) FROM messages WHERE user_id=$1 AND action_required=true AND (actioned IS NULL OR actioned = false)",[userId])

    const itemsQ = `
      SELECT m.id, m.external_message_id, m.sender, m.subject, m.body_plain, m.received_at, m.action_suggested,
        ma.suggested_actions as latest_suggested, ma.created_at as suggested_at
      FROM messages m
      LEFT JOIN LATERAL (
        SELECT suggested_actions, created_at FROM message_actions ma WHERE ma.message_id = m.id ORDER BY created_at DESC LIMIT 1
      ) ma ON true
      WHERE m.user_id = $1 AND m.is_read = false
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
    console.error('unread messages error', e)
    res.status(500).json({error:'server_error'})
  }
})

// GET /api/messages/pending
// Returns counts and a list of messages that require action for the current user
router.get('/pending', async (req, res) => {
  try{
    if(!req.user) return res.status(401).json({error:'not_logged_in'})
    const userId = req.user.id

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
    if(!req.user) return res.status(401).json({error:'user_context_required'})
    const userId = req.user.id
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
        const integration = await integrationUtils.getUserIntegration(userId, 'gmail', true)
        if(integration && integration.tokens){
          const tokens = integration.tokens
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
      result = await llmProcessor.followupActionOnEmail(req.user, email, opts, {selectedAction, calendarBusy})
    } else {
      // fallback for older processor implementations: include context in email object
      email.followupContext = {selectedAction, calendarBusy}
      if(typeof llmProcessor.processEmail === 'function'){
        result = await llmProcessor.processEmail(req.user, email, opts)
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
    if(!req.user) return res.status(401).json({error:'user_context_required'})
    const userId = req.user.id
    const user = req.user
    const msgId = req.params.id
    const {actionType, payload} = req.body
    if(!actionType) return res.status(400).json({error:'missing_actionType'})

    // fetch message
    const mres = await db.query('SELECT * FROM messages WHERE id=$1 AND user_id=$2', [msgId, userId])
    if(mres.rowCount===0) return res.status(404).json({error:'not_found'})
    const msg = mres.rows[0]

    // fetch gmail integration for user using centralized utility
    const integration = await integrationUtils.getUserIntegration(userId, 'gmail', true)
    if(!integration || !integration.tokens) return res.status(400).json({error:'no_integration'})
    const tokens = integration.tokens

    const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    o.setCredentials(tokens)
    const gmail = google.gmail({version:'v1', auth:o})
    const calendar = google.calendar({version:'v3', auth:o})
    const tasks = google.tasks({version:'v1', auth:o})

    // perform action with permission error handling
    let result = null
    try {
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
          
          console.log(`📅 Creating calendar event for user ${req.user.email} (${req.user.timezone})`)
          
          // Ensure timezone is set for Google Calendar API
          const eventStart = payload.start.includes('T') && !payload.start.includes('+') && !payload.start.endsWith('Z')
            ? { dateTime: payload.start, timeZone: req.user.timezone || 'UTC' }
            : { dateTime: payload.start }
          
          const eventEnd = payload.end.includes('T') && !payload.end.includes('+') && !payload.end.endsWith('Z')
            ? { dateTime: payload.end, timeZone: req.user.timezone || 'UTC' }
            : { dateTime: payload.end }
          
          console.log(`📋 Event details:`, {
            title: payload.title || payload.summary,
            start: eventStart,
            end: eventEnd,
            timezone: req.user.timezone
          })
          
          result = await calendar.events.insert({
            calendarId: 'primary', 
            requestBody: {
              summary: payload.title || payload.summary,
              description: payload.description || '',
              start: eventStart,
              end: eventEnd
            }
          })
          console.log(`✅ Calendar event created successfully - Event ID: ${result.data?.id}`)
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
        case 'draft_reply':
          // Same as reply but the LLM should have generated the content
          if(!payload || !payload.body) return res.status(400).json({error:'missing_body'})
          const draftFromHeader = (msg.sender || '')
          const draftTo = (draftFromHeader.match(/<(.+)>/) || [null, draftFromHeader])[1] || draftFromHeader
          const draftRaw = `To: ${draftTo}\r\nSubject: Re: ${msg.subject || ''}\r\n\r\n${payload.body}`
          const draftRawEncoded = Buffer.from(draftRaw).toString('base64')
          result = await gmail.users.messages.send({userId:'me', requestBody:{raw: draftRawEncoded}})
          break
        case 'create_meeting':
          // Handle meeting creation with flexible input
          if(!payload) return res.status(400).json({error:'missing_payload'})
          
          console.log(`📅 Creating meeting for user ${req.user.email} (${req.user.timezone})`)
          
          // If user provided meeting details as text, try to parse or use defaults
          let meetingTitle = payload.title || payload.summary || `Meeting with ${msg.sender}`
          let meetingDescription = payload.description || payload.notes || `Meeting regarding: ${msg.subject || 'Email discussion'}`
          
          // Use LLM to intelligently parse meeting requirements
          let userProvidedTime = false
          let llmParsedMeeting = null
          
          if(payload.userInput || payload.meetingDetails) {
            const userText = payload.userInput || payload.meetingDetails || ''
            meetingDescription += `\n\nUser requirements: ${userText}`
            console.log(`📝 User provided meeting details: ${userText}`)
            
            try {
              // Use LLM to parse complex meeting requirements
              console.log(`🤖 Using LLM to parse meeting requirements...`)
              const llmKey = await db.query('SELECT llm_key_encrypted FROM user_settings WHERE user_id = $1', [req.user.id])
              
              if (llmKey.rows[0]?.llm_key_encrypted) {
                const apiKey = llmKey.rows[0].llm_key_encrypted.toString() // Decrypt if needed
                llmParsedMeeting = await llmProcessor.parseMeetingRequirements(req.user, userText, { apiKey })
                
                if (llmParsedMeeting && llmParsedMeeting.success) {
                  console.log(`✅ LLM parsed meeting:`, llmParsedMeeting)
                  
                  // Use LLM-parsed details
                  if (llmParsedMeeting.title) meetingTitle = llmParsedMeeting.title
                  if (llmParsedMeeting.description) meetingDescription = llmParsedMeeting.description
                  if (llmParsedMeeting.start_time) {
                    payload.start = llmParsedMeeting.start_time
                    payload.end = llmParsedMeeting.end_time || new Date(new Date(llmParsedMeeting.start_time).getTime() + (llmParsedMeeting.duration_minutes || 60) * 60 * 1000).toISOString()
                    userProvidedTime = true
                  }
                } else {
                  console.log(`⚠️ LLM parsing failed, falling back to basic parsing`)
                }
              }
            } catch (llmError) {
              console.error('LLM parsing error:', llmError)
            }
            
            // Fallback to basic time parsing if LLM didn't work
            if (!userProvidedTime) {
              console.log(`🔍 Attempting basic time parsing from: "${userText}"`)
              const parsedTime = parseUserTimeInput(userText, req.user.timezone)
              console.log(`🔍 Parse result: ${parsedTime}`)
              if(parsedTime) {
                payload.start = parsedTime
                // Default to 1 hour meeting
                const startDate = new Date(parsedTime)
                const endDate = new Date(startDate.getTime() + 60 * 60 * 1000) // Add 1 hour
                payload.end = endDate.toISOString()
                userProvidedTime = true
                console.log(`⏰ Parsed time from user input: ${parsedTime}`)
              } else {
                console.log(`❌ Failed to parse time from user input: "${userText}"`)
              }
            }
          }
          
          // Use provided times or defaults
          let startTime = payload.start
          let endTime = payload.end
          
          if(!startTime || !endTime) {
            console.log(`⏰ No specific time provided, using default 2 PM - 3 PM tomorrow in ${req.user.timezone}`)
            // Use timezone utility for consistent handling
            const defaultTimes = createDefaultMeetingTimes(req.user.timezone)
            startTime = defaultTimes.startTime
            endTime = defaultTimes.endTime
            
            const formattedTime = formatTimeForUser(startTime, req.user.timezone)
            console.log(`🕐 Default meeting scheduled: ${formattedTime} (${req.user.timezone})`)
            console.log(`📅 ISO times - Start: ${startTime}, End: ${endTime}`)
            meetingDescription += `\n\nNote: Default time scheduled for ${formattedTime}. Please adjust as needed.`
          } else {
            const formattedTime = formatTimeForUser(startTime, req.user.timezone)
            console.log(`🕐 Using ${userProvidedTime ? 'parsed' : 'provided'} times: ${formattedTime} (${req.user.timezone})`)
            console.log(`📅 ISO times - Start: ${startTime}, End: ${endTime}`)
          }
          
          // Prepare attendees list
          let attendees = []
          
          // Add sender email as primary attendee
          const senderEmail = (msg.sender.match(/<(.+)>/) || [null, msg.sender])[1] || msg.sender
          attendees.push({ email: senderEmail })
          
          // Add additional attendees from LLM parsing
          if (llmParsedMeeting?.attendees && Array.isArray(llmParsedMeeting.attendees)) {
            llmParsedMeeting.attendees.forEach(email => {
              if (email && email !== senderEmail) {
                attendees.push({ email: email.trim() })
              }
            })
          }
          
          console.log(`👥 Meeting attendees: ${attendees.map(a => a.email).join(', ')}`)
          
          // Build event payload with enhanced features
          const eventPayload = {
            summary: meetingTitle,
            description: meetingDescription,
            start: { 
              dateTime: startTime,
              timeZone: req.user.timezone || 'UTC'
            },
            end: { 
              dateTime: endTime,
              timeZone: req.user.timezone || 'UTC'  
            },
            attendees: attendees
          }
          
          // Add location if provided by LLM
          if (llmParsedMeeting?.location) {
            eventPayload.location = llmParsedMeeting.location
            console.log(`📍 Meeting location: ${llmParsedMeeting.location}`)
          }
          
          // Add recurrence if specified by LLM
          if (llmParsedMeeting?.recurring?.enabled) {
            const recurrence = buildRecurrenceRule(llmParsedMeeting.recurring)
            if (recurrence) {
              eventPayload.recurrence = recurrence
              console.log(`🔄 Recurring meeting: ${JSON.stringify(llmParsedMeeting.recurring)}`)
            }
          }
          
          // Add reminders if specified by LLM
          if (llmParsedMeeting?.reminders && Array.isArray(llmParsedMeeting.reminders)) {
            eventPayload.reminders = {
              useDefault: false,
              overrides: llmParsedMeeting.reminders.map(reminder => ({
                method: reminder.method || 'popup',
                minutes: reminder.minutes || 15
              }))
            }
            console.log(`⏰ Custom reminders: ${llmParsedMeeting.reminders.length} reminders set`)
          }
          
          // Set visibility if specified
          if (llmParsedMeeting?.visibility) {
            eventPayload.visibility = llmParsedMeeting.visibility
            console.log(`👁️ Meeting visibility: ${llmParsedMeeting.visibility}`)
          }
          
          console.log(`📋 Enhanced meeting payload:`, {
            title: meetingTitle,
            startTime: startTime,
            endTime: endTime,
            timezone: req.user.timezone,
            attendees: attendees.length,
            hasLocation: !!llmParsedMeeting?.location,
            isRecurring: !!llmParsedMeeting?.recurring?.enabled,
            hasCustomReminders: !!llmParsedMeeting?.reminders
          })
          
          result = await calendar.events.insert({calendarId:'primary', requestBody: eventPayload})
          console.log(`✅ Meeting created successfully - Event ID: ${result.data?.id}`)
          console.log(`🔗 Meeting link: ${result.data?.htmlLink}`)
          break
        default:
          return res.status(400).json({error:'unknown_action'})
      }
    } catch(apiError) {
      // Handle Google API permission errors
      if (apiError.code === 403 || apiError.status === 403) {
        return res.status(403).json(handlePermissionError(actionType, apiError))
      }
      // Handle token expiration or other auth errors
      if (apiError.code === 401 || apiError.status === 401) {
        return res.status(401).json({
          error: 'token_expired',
          message: 'Your Google authentication has expired. Please re-authenticate.',
          reauthUrl: '/api/auth/reauth'
        })
      }
      // Re-throw other errors to be handled by the outer catch block
      throw apiError
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

// GET /api/messages/debug - Debug endpoint to check message states
router.get('/debug', async (req, res) => {
  try{
    if(!req.user) return res.status(401).json({error:'not_logged_in'})
    const userId = req.user.id

    // Get various counts and sample messages
    const totalRes = await db.query('SELECT count(*) as total FROM messages WHERE user_id=$1', [userId])
    const unreadRes = await db.query('SELECT count(*) as unread FROM messages WHERE user_id=$1 AND is_read=false', [userId])
    const actionReqRes = await db.query('SELECT count(*) as action_req FROM messages WHERE user_id=$1 AND action_required=true', [userId])
    const actionedRes = await db.query('SELECT count(*) as actioned FROM messages WHERE user_id=$1 AND actioned=true', [userId])
    
    // Get sample unread messages
    const sampleUnreadRes = await db.query(
      'SELECT id, sender, subject, is_read, action_required, actioned, received_at FROM messages WHERE user_id=$1 AND is_read=false ORDER BY received_at DESC LIMIT 5',
      [userId]
    )
    
    // Get sample messages that require action
    const sampleActionRes = await db.query(
      'SELECT id, sender, subject, is_read, action_required, actioned, received_at FROM messages WHERE user_id=$1 AND action_required=true ORDER BY received_at DESC LIMIT 5',
      [userId]
    )

    res.json({
      user_id: userId,
      counts: {
        total: parseInt(totalRes.rows[0].total, 10),
        unread: parseInt(unreadRes.rows[0].unread, 10),
        action_required: parseInt(actionReqRes.rows[0].action_req, 10),
        actioned: parseInt(actionedRes.rows[0].actioned, 10)
      },
      sample_unread: sampleUnreadRes.rows,
      sample_action_required: sampleActionRes.rows
    })
  }catch(e){
    console.error('debug messages error', e)
    res.status(500).json({error:'server_error', detail: e.message})
  }
})

module.exports = router
