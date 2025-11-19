const llm = require('./llmClient')
const db = require('../db')

/*
 Generic LLM Processor for One App Club
 Supports multiple processor types:
 - email_actions: Suggest actions for emails
 - email_summary: Summarize emails for a time period
 - daily_briefing: Complete daily overview
 - meeting_notes: Process meeting transcripts
 - chat_response: General chat interactions
*/

// Processor registry
const processors = {
  'email_actions': processEmailActions,
  'email_summary': processEmailSummary, 
  'daily_briefing': processDailyBriefing,
  'meeting_notes': processMeetingNotes,
  'chat_response': processChatResponse
}

// Context collectors for different processor types
const contextCollectors = {
  'email_actions': async (user, params) => {
    const email = params.email
    return { user, email, type: 'single_email' }
  },
  
  'email_summary': async (user, params) => {
    const { timeframe = 'today', limit = 50 } = params
    const emails = await getEmailsForTimeframe(user.id, timeframe, limit)
    return { user, emails, timeframe, type: 'email_list' }
  },
  
  'daily_briefing': async (user, params) => {
    const today = new Date().toISOString().split('T')[0]
    const [emails, calendar, tasks, teams, slack, github] = await Promise.allSettled([
      getEmailsForTimeframe(user.id, 'today', 20),
      getCalendarEvents(user.id, today),
      getTasks(user.id, 'pending'),
      getTeamsMessages(user.id, 'today'), // placeholder
      getSlackMessages(user.id, 'today'), // placeholder  
      getGithubActivity(user.id, 'today') // placeholder
    ])
    
    return {
      user,
      emails: emails.status === 'fulfilled' ? emails.value : [],
      calendar: calendar.status === 'fulfilled' ? calendar.value : [],
      tasks: tasks.status === 'fulfilled' ? tasks.value : [],
      teams: teams.status === 'fulfilled' ? teams.value : [],
      slack: slack.status === 'fulfilled' ? slack.value : [],
      github: github.status === 'fulfilled' ? github.value : [],
      type: 'daily_overview'
    }
  },
  
  'meeting_notes': async (user, params) => {
    const { meetingId, transcript } = params
    return { user, meetingId, transcript, type: 'meeting_transcript' }
  },
  
  'chat_response': async (user, params) => {
    const { message, context = {} } = params
    return { user, message, context, type: 'chat_interaction' }
  }
}

// Main processor entry point
async function processLLMRequest(processorType, user, params = {}, opts = {}) {
  try {
    // Get the processor function
    const processor = processors[processorType]
    if (!processor) {
      throw new Error(`Unknown processor type: ${processorType}`)
    }
    
    // Check cache for daily briefing
    if (processorType === 'daily_briefing') {
      const cached = await getCachedBriefing(user.id)
      if (cached) return cached
    }
    
    // Collect context data
    const contextCollector = contextCollectors[processorType]
    const context = await contextCollector(user, params)
    
    // Process with LLM
    const result = await processor(context, opts)
    
    // Cache daily briefing results
    if (processorType === 'daily_briefing' && result) {
      await cacheBriefing(user.id, result)
    }
    
    return result
    
  } catch (err) {
    console.error(`LLM processing failed for ${processorType}:`, err.message || err)
    return { type: 'error', error: err.message || 'Processing failed' }
  }
}

// Legacy function - kept for backwards compatibility
async function processEmail(user = {}, email = {}, opts = {}) {
  return await processLLMRequest('email_actions', user, { email }, opts)
}

// ============= PROCESSOR IMPLEMENTATIONS =============

async function processEmailActions(context, opts) {
  const { user, email } = context
  const prefs = user.preferences || {}
  
  const sys = `You are an assistant that decides programmatic actions for incoming emails based on a user's preferences.
Return a JSON object with an "actions" array. Allowed action types: flag, create_task, create_event, reply, mark_read, set_priority.
Do not include explanation or text outside the JSON. Each action should include only fields necessary for execution.`

  const userMessage = `
User preferences: ${JSON.stringify(prefs)}
Email:
- id: ${email.id || ''}
- from: ${email.from || ''}
- subject: ${email.subject || ''}
- snippet: ${email.snippet || ''}
- body: ${email.body ? email.body.slice(0, 4000) : ''}
Decide what automated actions should be taken now. Consider:
- If sender is in high_priority_senders list mark priority.
- If content implies an immediate task create_task with title and notes.
- If content implies scheduling create_event with approximate times (ISO).
- If reply is simple canned ack include reply action.
Return strict JSON only.`

  const raw = await llm.chat([
    {role: 'system', content: sys},
    {role: 'user', content: userMessage}
  ], {temperature: 0, apiKey: opts.apiKey, model: opts.model})

  const jsonText = extractJson(raw)
  const parsed = JSON.parse(jsonText)
  
  return {
    type: 'actions',
    actions: parsed.actions || [],
    email_id: email.id
  }
}

async function processEmailSummary(context, opts) {
  const { user, emails, timeframe } = context
  
  const sys = `You are an assistant that creates concise, actionable email summaries.
Return a JSON object with summary information including key themes, urgent items, and statistics.`

  const emailList = emails.map(e => ({
    from: e.sender,
    subject: e.subject,
    received: e.received_at,
    priority: e.importance || 'normal'
  }))

  const userMessage = `
Summarize these ${emails.length} emails from ${timeframe}:
${JSON.stringify(emailList, null, 2)}

Provide a JSON response with:
- total_count: number of emails
- urgent_count: emails needing immediate attention  
- key_senders: top 3 senders by volume
- main_themes: array of main topics/themes
- action_required: emails that need responses/actions
- summary_text: 2-3 sentence overview
`

  const raw = await llm.chat([
    {role: 'system', content: sys},
    {role: 'user', content: userMessage}
  ], {temperature: 0.3, apiKey: opts.apiKey, model: opts.model})

  const jsonText = extractJson(raw)
  const parsed = JSON.parse(jsonText)
  
  return {
    type: 'email_summary',
    timeframe,
    ...parsed
  }
}

async function processDailyBriefing(context, opts) {
  const { user, emails, calendar, tasks, teams, slack, github } = context
  
  const sys = `You are an executive assistant creating a comprehensive daily briefing.
Return a JSON object with structured sections for emails, calendar, tasks, and other platforms.`

  const briefingData = {
    emails: {
      total: emails.length,
      unread: emails.filter(e => !e.is_read).length,
      urgent: emails.filter(e => e.importance === 'high').length
    },
    calendar: {
      total_events: calendar.length,
      next_meeting: calendar[0] || null
    },
    tasks: {
      pending: tasks.length,
      overdue: tasks.filter(t => new Date(t.due_date) < new Date()).length
    },
    integrations: {
      teams_messages: teams.length || 0,
      slack_messages: slack.length || 0, 
      github_activity: github.length || 0
    }
  }

  const userMessage = `
Create a daily briefing for ${user.display_name || user.email}:
Data: ${JSON.stringify(briefingData, null, 2)}

Provide a JSON response with:
- greeting: personalized morning greeting
- priority_items: array of top 3 things to focus on today
- email_overview: brief email summary with action count
- calendar_overview: today's schedule summary
- tasks_overview: pending tasks summary
- integrations_summary: summary of activity from other platforms
- recommendations: array of 2-3 actionable recommendations
- estimated_focus_time: suggested time blocks for deep work
`

  const raw = await llm.chat([
    {role: 'system', content: sys},
    {role: 'user', content: userMessage}
  ], {temperature: 0.4, apiKey: opts.apiKey, model: opts.model})

  const jsonText = extractJson(raw)
  const parsed = JSON.parse(jsonText)
  
  return {
    type: 'daily_briefing',
    generated_at: new Date().toISOString(),
    ...parsed
  }
}

async function processMeetingNotes(context, opts) {
  const { user, meetingId, transcript } = context
  
  const sys = `You are an assistant that processes meeting transcripts to extract key information.
Return a JSON object with structured meeting analysis.`

  const userMessage = `
Process this meeting transcript:
${transcript.slice(0, 8000)}

Provide a JSON response with:
- meeting_summary: 2-3 sentence summary
- key_decisions: array of decisions made
- action_items: array of action items with owners and deadlines
- key_topics: main topics discussed
- next_steps: what needs to happen next
- attendee_insights: key contributions from attendees
`

  const raw = await llm.chat([
    {role: 'system', content: sys},
    {role: 'user', content: userMessage}
  ], {temperature: 0.2, apiKey: opts.apiKey, model: opts.model})

  const jsonText = extractJson(raw)
  const parsed = JSON.parse(jsonText)
  
  return {
    type: 'meeting_notes',
    meeting_id: meetingId,
    processed_at: new Date().toISOString(),
    ...parsed
  }
}

async function processChatResponse(context, opts) {
  const { user, message, context: chatContext } = context
  
  const sys = `You are a helpful AI assistant for One App Club, an email and productivity management platform.
You help users with their emails, calendar, tasks, and general productivity questions.
Be conversational, helpful, and action-oriented. Suggest specific next steps when appropriate.`

  const userMessage = `
User: ${user.display_name || user.email}
Message: ${message}
Context: ${JSON.stringify(chatContext)}

Provide a helpful response that may include:
- Direct answers to questions
- Suggestions for email/calendar management
- Productivity tips
- Specific actions the user can take in the app
`

  const raw = await llm.chat([
    {role: 'system', content: sys},
    {role: 'user', content: userMessage}
  ], {temperature: 0.6, apiKey: opts.apiKey, model: opts.model})

  return {
    type: 'chat_response',
    response: raw,
    timestamp: new Date().toISOString()
  }
}

// ============= DATA COLLECTION HELPERS =============

async function getEmailsForTimeframe(userId, timeframe, limit = 50) {
  let timeCondition = ''
  const now = new Date()
  
  switch (timeframe) {
    case 'today':
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      timeCondition = `AND received_at >= '${todayStart.toISOString()}'`
      break
    case 'yesterday':
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      timeCondition = `AND received_at >= '${yesterdayStart.toISOString()}' AND received_at < '${yesterdayEnd.toISOString()}'`
      break
    case 'week':
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      timeCondition = `AND received_at >= '${weekStart.toISOString()}'`
      break
  }
  
  const query = `
    SELECT id, external_message_id, sender, subject, body_plain, 
           received_at, is_read, importance, action_required, actioned
    FROM messages 
    WHERE user_id = $1 ${timeCondition}
    ORDER BY received_at DESC 
    LIMIT $2
  `
  
  const result = await db.query(query, [userId, limit])
  return result.rows
}

async function getCalendarEvents(userId, date) {
  // Placeholder - implement when calendar integration is ready
  const query = `
    SELECT id, title, start_time, end_time, location, attendees
    FROM calendar_events 
    WHERE user_id = $1 AND start_time::date = $2
    ORDER BY start_time ASC
  `
  
  try {
    const result = await db.query(query, [userId, date])
    return result.rows
  } catch (err) {
    // Table might not exist yet, return empty array
    return []
  }
}

async function getTasks(userId, status = 'pending') {
  // Placeholder - implement when task integration is ready
  try {
    const query = `
      SELECT id, title, description, due_date, priority, status
      FROM tasks 
      WHERE user_id = $1 AND status = $2
      ORDER BY due_date ASC
    `
    const result = await db.query(query, [userId, status])
    return result.rows
  } catch (err) {
    return []
  }
}

// Placeholder functions for future integrations
async function getTeamsMessages(userId, timeframe) {
  // TODO: Implement Teams integration
  return []
}

async function getSlackMessages(userId, timeframe) {
  // TODO: Implement Slack integration
  return []
}

async function getGithubActivity(userId, timeframe) {
  // TODO: Implement GitHub integration
  return []
}

// ============= CACHING HELPERS =============

async function getCachedBriefing(userId) {
  const today = new Date().toISOString().split('T')[0]
  
  try {
    const query = `
      SELECT briefing_data, created_at
      FROM daily_briefing_cache 
      WHERE user_id = $1 AND date = $2
    `
    const result = await db.query(query, [userId, today])
    
    if (result.rows.length > 0) {
      const cached = result.rows[0]
      // Return cached data if it's less than 2 hours old
      const cacheAge = new Date() - new Date(cached.created_at)
      const twoHours = 2 * 60 * 60 * 1000
      
      if (cacheAge < twoHours) {
        return JSON.parse(cached.briefing_data)
      }
    }
  } catch (err) {
    // Cache table might not exist yet
    console.log('Daily briefing cache not available:', err.message)
  }
  
  return null
}

async function cacheBriefing(userId, briefingData) {
  const today = new Date().toISOString().split('T')[0]
  
  try {
    const query = `
      INSERT INTO daily_briefing_cache (user_id, date, briefing_data, created_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (user_id, date) 
      DO UPDATE SET briefing_data = EXCLUDED.briefing_data, created_at = now()
    `
    await db.query(query, [userId, today, JSON.stringify(briefingData)])
  } catch (err) {
    // Cache table might not exist yet, that's okay
    console.log('Could not cache briefing:', err.message)
  }
}

// ============= UTILITIES =============

function extractJson(text = '') {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('No JSON found in LLM response')
  return text.slice(first, last + 1)
}

module.exports = { 
  processEmail,           // Legacy compatibility
  processLLMRequest,      // New generic processor
  processEmailActions,
  processEmailSummary,
  processDailyBriefing,
  processMeetingNotes,
  processChatResponse
}