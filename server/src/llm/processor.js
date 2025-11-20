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
    // Extract timeframe from message if auto-detected
    let { timeframe = 'today', limit = 50 } = params
    
    if (params.message && !params.timeframe) {
      // Try to detect timeframe from the message
      const msg = params.message.toLowerCase()
      if (msg.includes('yesterday')) {
        timeframe = 'yesterday'
      } else if (msg.includes('week') || msg.includes('7 days')) {
        timeframe = 'week'
      } else if (msg.includes('today') || msg.includes('this morning')) {
        timeframe = 'today'
      }
    }
    
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
    const { message, context = {}, sessionId } = params
    
    // Get conversation history from database if sessionId provided
    let conversationHistory = []
    if (sessionId) {
      try {
        const historyResult = await db.query(`
          SELECT 
            message_role,
            content,
            created_at
          FROM chat_messages
          WHERE session_id = $1 AND user_id = $2 AND context_relevant = TRUE
          ORDER BY created_at DESC
          LIMIT 10
        `, [sessionId, user.id])
        
        // Format for LLM context (reverse to chronological order)
        conversationHistory = historyResult.rows
          .reverse()
          .map(msg => ({
            role: msg.message_role === 'user' ? 'user' : 'assistant',
            content: msg.content
          }))
        
        console.log(`Loaded ${conversationHistory.length} messages from conversation history`)
      } catch (err) {
        console.log('Could not load conversation history:', err.message)
      }
    }
    
    // If this was auto-detected from a message, enhance context with user data
    if (message && !params.originalProcessorType) {
      try {
        // Add some basic user context to make responses more helpful
        const recentEmails = await getEmailsForTimeframe(user.id, 'today', 5)
        const enhancedContext = {
          ...context,
          recent_email_count: recentEmails.length,
          unread_count: recentEmails.filter(e => !e.is_read).length,
          user_timezone: user.timezone || 'UTC'
        }
        return { 
          user, 
          message, 
          context: enhancedContext, 
          conversationHistory,
          sessionId,
          type: 'chat_interaction' 
        }
      } catch (err) {
        // If context enhancement fails, use basic context
        console.log('Could not enhance chat context:', err.message)
      }
    }
    
    return { 
      user, 
      message, 
      context, 
      conversationHistory,
      sessionId,
      type: 'chat_interaction' 
    }
  }
}

// Main processor entry point
async function processLLMRequest(processorType, user, params = {}, opts = {}) {
  try {
    // If no processor type specified, try to detect from user input
    if (!processorType && params.message) {
      processorType = await detectProcessorType(params.message, user)
      console.log(`Auto-detected processor type: ${processorType}`)
    }
    
    // Default to chat_response if still no processor type
    if (!processorType) {
      processorType = 'chat_response'
    }
    
    // Get the processor function
    const processor = processors[processorType]
    if (!processor) {
      throw new Error(`Unknown processor type: ${processorType}`)
    }
    
    // Prepare options with global credentials
    const globalOpts = {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      ...opts
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
    const result = await processor(context, globalOpts)
    console.log(result)
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
  
  console.log(`Processing email summary for ${emails.length} emails from ${timeframe}`)
  
  if (emails.length === 0) {
    return {
      type: 'email_summary',
      timeframe,
      total_count: 0,
      urgent_count: 0,
      key_senders: [],
      main_themes: [],
      action_required: 0,
      summary_text: `No emails found for ${timeframe}. Your inbox is clear!`
    }
  }
  
  const sys = `You are an AI assistant that creates concise, actionable email summaries for busy professionals.
Analyze the provided emails and return a JSON object with comprehensive summary information.
Focus on actionability and prioritization to help the user manage their inbox effectively.`

  // Prepare richer email data for analysis
  const emailList = emails.map(e => ({
    id: e.id,
    from: e.sender,
    subject: e.subject,
    body_preview: e.body_plain ? e.body_plain.substring(0, 200) + '...' : '',
    received: e.received_at,
    is_read: e.is_read || false,
    priority: e.importance || 'normal',
    action_required: e.action_required || false,
    actioned: e.actioned || false
  }))

  // Calculate basic statistics
  const unreadCount = emails.filter(e => !e.is_read).length
  const actionRequiredCount = emails.filter(e => e.action_required && !e.actioned).length
  const urgentCount = emails.filter(e => e.importance === 'high').length

  const userMessage = `
Analyze and summarize these ${emails.length} emails from ${timeframe} for user: ${user.display_name || user.email}

Email Details:
${JSON.stringify(emailList.slice(0, 20), null, 2)} ${emails.length > 20 ? '\n[Additional emails truncated for analysis...]' : ''}

Current Stats:
- Total emails: ${emails.length}
- Unread: ${unreadCount}
- Action required: ${actionRequiredCount}  
- High priority: ${urgentCount}

Provide a comprehensive JSON response with:
- total_count: total number of emails
- unread_count: number of unread emails
- urgent_count: emails marked high priority or containing urgent keywords
- action_required: number of emails needing response/action
- key_senders: array of top 3-5 senders by volume (name and email count)
- main_themes: array of 3-5 main topics/categories identified
- priority_emails: array of 2-3 most important emails with brief reason why
- summary_text: 2-3 sentence executive summary with actionable insights
- recommendations: array of 2-3 specific next steps for the user
- time_estimate: estimated time needed to process important emails (e.g., "30 minutes")
`

  const raw = await llm.chat([
    {role: 'system', content: sys},
    {role: 'user', content: userMessage}
  ], {temperature: 0.3, max_tokens: 1000})

  try {
    const jsonText = extractJson(raw)
    const parsed = JSON.parse(jsonText)
    
    // Ensure key_senders are strings, not objects
    if (parsed.key_senders && Array.isArray(parsed.key_senders)) {
      parsed.key_senders = parsed.key_senders.map(sender => {
        if (typeof sender === 'string') return sender
        if (typeof sender === 'object') {
          // Extract name or email from object
          return sender.name || sender.email || sender.sender || String(sender)
        }
        return String(sender)
      })
    }
    
    // Ensure main_themes are strings
    if (parsed.main_themes && Array.isArray(parsed.main_themes)) {
      parsed.main_themes = parsed.main_themes.map(theme => String(theme))
    }
    
    return {
      type: 'email_summary',
      timeframe,
      generated_at: new Date().toISOString(),
      ...parsed
    }
  } catch (err) {
    console.error('Failed to parse email summary JSON:', err.message)
    console.error('Raw LLM response:', raw)
    
    // Extract top senders from email data as fallback
    const senderCounts = {}
    emails.forEach(e => {
      const sender = e.sender || 'Unknown'
      senderCounts[sender] = (senderCounts[sender] || 0) + 1
    })
    const topSenders = Object.entries(senderCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([sender]) => sender)
    
    // Return fallback summary with basic stats
    return {
      type: 'email_summary', 
      timeframe,
      total_count: emails.length,
      unread_count: unreadCount,
      urgent_count: urgentCount,
      action_required: actionRequiredCount,
      key_senders: topSenders,
      main_themes: ['Email processing'],
      summary_text: `You have ${emails.length} emails from ${timeframe}. ${unreadCount} are unread and ${actionRequiredCount} need action.`,
      recommendations: ['Review unread emails', 'Respond to action items'],
      generated_at: new Date().toISOString()
    }
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
  const { user, message, context: chatContext, conversationHistory = [] } = context
  
  const sys = `You are a helpful AI assistant for One App Club, an email and productivity management platform.
You help users with their emails, calendar, tasks, and general productivity questions.
Be conversational, helpful, and action-oriented. Suggest specific next steps when appropriate.

If the user's request seems to be asking for specific functionality (like email summaries, daily briefings, or email actions), 
you can suggest they use more specific commands or offer to help them with those features.

Available features you can suggest:
- Email summaries (for timeframes like today, yesterday, this week)  
- Daily briefings (comprehensive morning prep with priorities)
- Email actions (reply, flag, create tasks from emails)
- Meeting note processing
- General productivity assistance

User context:
- Name: ${user.display_name || user.email}
- Recent emails: ${chatContext.recent_email_count || 0} today
- Unread emails: ${chatContext.unread_count || 0}
- User timezone: ${chatContext.user_timezone || 'UTC'}

Use the conversation history to maintain context and provide relevant, personalized responses.`

  // Build message array with conversation history
  const messages = [
    { role: 'system', content: sys }
  ]
  
  // Add conversation history (already formatted for LLM)
  messages.push(...conversationHistory)
  
  // Add current user message
  messages.push({ role: 'user', content: message })
  
  console.log(`Chat model: ${opts.model}, history: ${conversationHistory.length} messages`)
  
  const raw = await llm.chat(messages, {
    temperature: 0.7, 
    apiKey: opts.apiKey, 
    model: opts.model
  })

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
    SELECT id, external_message_id, sender, subject, body_plain, body,
           received_at, is_read, importance, action_required, actioned,
           created_at, metadata
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

async function detectProcessorType(message, user) {
  try {
    const sys = `You are an intelligent router that determines what type of request a user is making.
Based on the user's message, return ONLY one of these processor types:
- email_actions: User wants to take action on specific emails (reply, flag, delete, etc.)
- email_summary: User wants a summary of their emails (today, yesterday, this week, etc.)
- daily_briefing: User wants a comprehensive daily overview/briefing/prep for their day
- meeting_notes: User wants to process meeting notes or transcripts
- chat_response: General questions, casual chat, or anything else

Return ONLY the processor type, no explanation.`

    const userMessage = `
User message: "${message}"
Context: User is ${user.display_name || user.email}

What type of request is this? Return only the processor type.`

    const response = await llm.chat([
      {role: 'system', content: sys},
      {role: 'user', content: userMessage}
    ], {temperature: 0.1, max_tokens: 50})
    

    const detectedType = response.trim().toLowerCase()
    console.log("processor detected "+ detectedType)
    
    // Validate the detected type
    const validTypes = ['email_actions', 'email_summary', 'daily_briefing', 'meeting_notes', 'chat_response']
    if (validTypes.includes(detectedType)) {
      return detectedType
    }
    
    // Fallback pattern matching if AI fails
    return fallbackProcessorDetection(message)
    
  } catch (err) {
    console.error('AI processor detection failed:', err.message)
    return fallbackProcessorDetection(message)
  }
}

function fallbackProcessorDetection(message) {
  const msg = message.toLowerCase().trim()
  
  // Email summary patterns
  if (msg.match(/\b(summarize?|summary|overview|digest)\b.*\b(email|mail|message)s?\b/i) ||
      msg.match(/\b(today'?s?|yesterday'?s?|this week'?s?)\s+(email|mail|message)s?\b/i) ||
      msg.match(/\bwhat.*email.*received?\b/i) ||
      msg.match(/\bhow many.*email/i)) {
    return 'email_summary'
  }
  
  // Daily briefing patterns  
  if (msg.match(/\b(brief|briefing|prep|prepare|ready|start|begin).*day\b/i) ||
      msg.match(/\b(morning|daily)\s+(brief|briefing|update|overview|summary)\b/i) ||
      msg.match(/\bwhat.*today\b/i) ||
      msg.match(/\bget.*ready.*day\b/i) ||
      msg.match(/\bpriority|priorities.*today\b/i)) {
    return 'daily_briefing'
  }
  
  // Email actions patterns
  if (msg.match(/\b(reply|respond|answer|forward|delete|archive|flag|mark)\b.*\b(email|mail|message)\b/i) ||
      msg.match(/\bhelp.*\b(reply|respond|answer)\b.*\b(email|mail|message)\b/i) ||
      msg.match(/\b(create|schedule|add).*\b(task|event|meeting|appointment)\b.*\bemail\b/i) ||
      msg.match(/\baction.*email/i)) {
    return 'email_actions'
  }
  
  // Daily briefing patterns (more specific)
  if (msg.match(/\b(brief|briefing).*\b(morning|day)\b/i) ||
      msg.match(/\bmorning.*brief/i)) {
    return 'daily_briefing'
  }
  
  // Meeting notes patterns
  if (msg.match(/\b(meeting|call|conference)\s+(notes?|transcript|summary|minutes)\b/i) ||
      msg.match(/\bprocess.*\b(meeting|transcript|notes?)\b/i) ||
      msg.match(/\b(action items?|decisions?|takeaways?).*meeting\b/i)) {
    return 'meeting_notes'
  }
  
  // Default to chat response
  return 'chat_response'
}

function extractJson(text = '') {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('No JSON found in LLM response')
  return text.slice(first, last + 1)
}

module.exports = { 
  processEmail,           // Legacy compatibility
  processLLMRequest,      // New generic processor
  detectProcessorType,    // Intelligent processor detection
  processEmailActions,
  processEmailSummary,
  processDailyBriefing,
  processMeetingNotes,
  processChatResponse
}