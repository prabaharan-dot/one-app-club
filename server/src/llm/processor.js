// Main LLM Processor - Refactored for modularity
const llm = require('./llmClient')
const db = require('../db')

// Import modular processors (with new names to avoid conflicts)
const { LLMProcessor } = require('./processors/coreProcessor')
const emailProcessors = require('./processors/emailProcessors')
const meetingProcessors = require('./processors/meetingProcessors')
const generalProcessors = require('./processors/generalProcessors')
const contextCollectorModules = require('./processors/contextCollectors')
const dataHelpers = require('./processors/dataHelpers')
const { extractJson } = require('./utils/jsonUtils')

/*
 Generic LLM Processor for One App Club
 Supports multiple processor types:
 - email_actions: Analyze emails and suggest actionable next steps with summaries
 - email_summary: Summarize emails for a time period
 - daily_briefing: Complete daily overview
 - meeting_notes: Process meeting transcripts
 - chat_response: General chat interactions
 - create_meeting: Meeting creation from chat
*/

// Processor registry (using original functions for backward compatibility)
const processors = {
  'email_actions': processEmailActions,      // Original function defined below
  'email_summary': processEmailSummary,      // Original function defined below
  'daily_briefing': processDailyBriefing,    // Original function defined below
  'meeting_notes': processMeetingNotes,      // Original function defined below  
  'chat_response': processChatResponse,      // Original function defined below
  'parse_meeting': parseMeetingRequirements, // Original function defined below
  'create_meeting': processChatMeetingCreation // Original function defined below
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
  
  'parse_meeting': async (user, params) => {
    const { meetingText } = params
    return { user, meetingText, type: 'meeting_parsing' }
  },

  'create_meeting': async (user, params) => {
    const { message, context = {} } = params
    return { user, message, context, type: 'chat_meeting_creation' }
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
// Main processor instance
let mainProcessor = null;

async function processLLMRequest(processorType, user, params = {}, opts = {}) {
  try {
    // Initialize main processor if not already done
    if (!mainProcessor) {
      mainProcessor = new LLMProcessor(llm, db);
    }

    // If no processor type specified and we have a message, use the new detection system
    if (!processorType && params.message) {
      console.log('🔄 Using new LLMProcessor for intelligent processing:', params.message.substring(0, 50) + '...');
      
      const context = { user, ...params };
      const options = {
        apiKey: opts.apiKey || process.env.OPENAI_API_KEY,
        model: opts.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'
      };
      
      const result = await mainProcessor.processLLMRequest(params.message, context, options);
      console.log('✅ New processor result type:', result.type);
      return result;
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
  
  const sys = `You are an intelligent email assistant that analyzes emails and provides actionable summaries and suggestions.
Analyze the email content, determine its importance, intent, and suggest the most appropriate actions for the user.

IMPORTANT TIMEZONE HANDLING:
- User's timezone is: ${user.timezone || 'UTC'}
- All times must be interpreted and calculated in the user's timezone
- When suggesting meeting times or events, always consider the user's local time
- Convert any times mentioned in emails to the user's timezone before creating calendar events

Return a JSON object with:
- summary: 2-3 sentence summary of the email content and intent
- priority_level: "high", "medium", or "low" based on urgency and importance
- category: email type like "meeting_request", "task_assignment", "newsletter", "personal", "promotional", "urgent_request", etc.
- sentiment: "positive", "neutral", "negative", or "urgent"
- suggested_actions: array of 1-3 most relevant actions with details

Available action types:
- mark_as_priority: Mark email as high priority
- flag_as_spam: Flag as spam/unwanted
- create_event: Create calendar event (include title, start_time, duration in user timezone)
- create_meeting: Schedule meeting with sender (include title, suggested_times, duration in user timezone)
- create_task: Create a task (include title, description, due_date)
- mark_as_read: Mark as read (for low-priority items)
- draft_reply: Suggest a reply (include reply_type, tone, key_points)
- archive: Archive the email
- forward: Forward to someone (include reason)

For create_event and create_meeting actions:
- start_time and end_time should be in ISO format with proper timezone offset
- Use the user's timezone (${user.timezone || 'UTC'}) for all time calculations
- If user says "9 AM", interpret it as 9 AM in their timezone (${user.timezone || 'UTC'})

Each action should include:
- type: action type
- title: human-readable action description
- confidence: how confident you are this action is appropriate (0.0-1.0)
- reasoning: brief explanation why this action is suggested
- payload: action-specific data (event details, task info, reply content, etc.)

Be selective - only suggest actions that truly make sense for this email.`

  // Build user context for personalized assistance
  const userContext = []
  if (user.display_name) userContext.push(`Name: ${user.display_name}`)
  if (user.role) userContext.push(`Role: ${user.role}`)
  if (user.location) userContext.push(`Location: ${user.location}`)
  if (user.timezone) userContext.push(`Timezone: ${user.timezone}`)
  if (user.personal_note) userContext.push(`Personal Note: ${user.personal_note}`)

  const userMessage = `
Analyze this email for user: ${user.display_name || user.email}

User Context:
${userContext.length > 0 ? userContext.join('\n') : 'No additional context provided'}

User Preferences: ${JSON.stringify(prefs)}

Email Details:
- ID: ${email.id || 'N/A'}
- From: ${email.from || 'Unknown sender'}
- Subject: ${email.subject || 'No subject'}
- Snippet: ${email.snippet || 'No preview available'}
- Content: ${email.body ? email.body.slice(0, 3000) : 'No body content'}

Consider the following when analyzing:
1. Is this sender in the user's high_priority_senders list?
2. Does the content suggest urgency (deadlines, ASAP, urgent keywords)?
3. Does it contain meeting/event information that needs scheduling?
4. Does it assign tasks or request actions from the user?
5. Is it promotional/newsletter content that might be archived?
6. Does it require a response or acknowledgment?
7. Is it spam or suspicious content?

Provide comprehensive analysis with actionable suggestions that help the user manage their inbox efficiently.

Return strict JSON format only.`

  const raw = await llm.chat([
    {role: 'system', content: sys},
    {role: 'user', content: userMessage}
  ], {temperature: 0.3, max_tokens: 1000, apiKey: opts.apiKey, model: opts.model})

  try {
    const jsonText = extractJson(raw)
    const parsed = JSON.parse(jsonText)
    
    // Validate and enhance the response
    const enhancedResponse = {
      type: 'email_actions',
      email_id: email.id,
      summary: parsed.summary || `Email from ${email.from} about ${email.subject}`,
      priority_level: parsed.priority_level || 'medium',
      category: parsed.category || 'general',
      sentiment: parsed.sentiment || 'neutral',
      suggested_actions: [],
      analysis_timestamp: new Date().toISOString()
    }
    
    // Process and validate suggested actions
    if (parsed.suggested_actions && Array.isArray(parsed.suggested_actions)) {
      enhancedResponse.suggested_actions = parsed.suggested_actions.map(action => ({
        type: action.type || 'mark_as_read',
        title: action.title || `${action.type} action`,
        confidence: Math.min(Math.max(action.confidence || 0.5, 0.0), 1.0),
        reasoning: action.reasoning || 'Automated suggestion',
        payload: action.payload || {},
        actionable: true,
        estimated_time: action.estimated_time || '1 minute'
      })).slice(0, 3) // Limit to 3 actions max
    }
    
    // If no actions suggested, provide default based on priority
    if (enhancedResponse.suggested_actions.length === 0) {
      const defaultAction = enhancedResponse.priority_level === 'high' 
        ? {
            type: 'mark_as_priority',
            title: 'Mark as high priority',
            confidence: 0.7,
            reasoning: 'Email appears to be important based on content analysis',
            payload: { priority: 'high' },
            actionable: true,
            estimated_time: '1 minute'
          }
        : {
            type: 'mark_as_read',
            title: 'Mark as read',
            confidence: 0.6,
            reasoning: 'Email appears to be informational',
            payload: {},
            actionable: true,
            estimated_time: '30 seconds'
          }
      
      enhancedResponse.suggested_actions = [defaultAction]
    }
    
    return enhancedResponse
    
  } catch (err) {
    console.error('Failed to parse email actions JSON:', err.message)
    console.error('Raw LLM response:', raw)
    
    // Return fallback response with basic analysis
    return {
      type: 'email_actions',
      email_id: email.id,
      summary: `Email from ${email.from} regarding "${email.subject}". Content analysis failed, manual review recommended.`,
      priority_level: 'medium',
      category: 'general',
      sentiment: 'neutral',
      suggested_actions: [
        {
          type: 'mark_as_read',
          title: 'Mark as read',
          confidence: 0.5,
          reasoning: 'Default action due to analysis failure',
          payload: {},
          actionable: true,
          estimated_time: '30 seconds'
        }
      ],
      analysis_timestamp: new Date().toISOString(),
      analysis_error: 'LLM response parsing failed'
    }
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
- Role: ${user.role || 'Not specified'}
- Location: ${user.location || 'Not specified'}
- Timezone: ${user.timezone || chatContext.user_timezone || 'UTC'}
- Personal note: ${user.personal_note || 'No personal context provided'}
- Recent emails: ${chatContext.recent_email_count || 0} today
- Unread emails: ${chatContext.unread_count || 0}

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

IMPORTANT: If the user mentions creating, scheduling, booking, planning, or setting up ANY meeting/event/appointment/call, return "create_meeting".

Based on the user's message, return ONLY one of these processor types:
- email_actions: User wants to take action on specific emails (reply, flag, delete, etc.)
- email_summary: User wants a summary of their emails (today, yesterday, this week, etc.)
- daily_briefing: User wants a comprehensive daily overview/briefing/prep for their day
- meeting_notes: User wants to process meeting notes or transcripts
- create_meeting: User wants to create, schedule, book, plan, or set up a new meeting/appointment/event/call (including recurring meetings, time-based requests like "every Thursday", "at 2pm", "tomorrow at 9am")
- chat_response: General questions, casual chat, or anything else that doesn't involve creating meetings

Examples that should return "create_meeting":
- "schedule a meeting tomorrow at 2pm"
- "create a meeting every thursday 9 to 9.30am"
- "book a call next week"
- "set up weekly standup"
- "plan team meeting"

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
    const validTypes = ['email_actions', 'email_summary', 'daily_briefing', 'meeting_notes', 'create_meeting', 'chat_response']
    if (validTypes.includes(detectedType)) {
      return detectedType
    }
    
    // Fallback pattern matching if AI fails
    console.log(`⚠️ LLM detection returned invalid type "${detectedType}", using fallback patterns`)
    return fallbackProcessorDetection(message)
    
  } catch (err) {
    console.error('AI processor detection failed:', err.message)
    return fallbackProcessorDetection(message)
  }
  
  // Additional fallback check - if LLM returned chat_response but message contains meeting keywords, override to create_meeting
  if (detectedType === 'chat_response') {
    const fallbackType = fallbackProcessorDetection(message)
    if (fallbackType === 'create_meeting') {
      console.log(`🔄 Overriding LLM detection: chat_response -> create_meeting`)
      return 'create_meeting'
    }
  }
}

function fallbackProcessorDetection(message) {
  const msg = message.toLowerCase().trim()
  console.log(`🔍 Fallback pattern matching for: "${msg}"`)
  
  // Meeting creation patterns
  if (msg.match(/\b(create|schedule|set up|add|book|plan).*\b(meeting|appointment|event|call|session)\b/i) ||
      msg.match(/\b(meeting|appointment|event|call).*\b(tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i) ||
      msg.match(/\b(let'?s meet|can we meet|schedule.*time|book.*time|set.*time)\b/i) ||
      msg.match(/\bevery.*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i) ||
      msg.match(/\b(weekly|daily|monthly).*\b(meeting|standup|check-in|review)\b/i) ||
      msg.match(/\bat\s+\d+/i) || // "at 2pm", "at 9:30am"
      msg.match(/\b\d+\s*(am|pm|:\d+)/i)) { // "2pm", "9:30am"
    console.log(`✅ Meeting creation pattern matched!`)
    return 'create_meeting'
  }

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

// Followup action processor for prepare requests
async function followupActionOnEmail(user, email, opts, context = {}) {
  const { selectedAction, calendarBusy } = context
  
  if (!selectedAction || !selectedAction.type) {
    return { actions: [], followups: [] }
  }
  
  const actionType = selectedAction.type
  
  // Handle specific action types that need LLM assistance
  if (actionType === 'draft_reply') {
    return await generateReplyDraft(user, email, selectedAction, opts)
  } else if (actionType === 'create_meeting' || actionType === 'create_event') {
    return await generateMeetingProposal(user, email, selectedAction, opts, calendarBusy)
  }
  
  // For other actions, return empty suggestions
  return { actions: [], followups: [] }
}

// Generate AI-powered reply draft
async function generateReplyDraft(user, email, action, opts) {
  const sys = `You are an email assistant that drafts professional, contextually appropriate replies.
Analyze the incoming email and generate a suitable reply based on the email content and user context.

Return a JSON object with:
- actions: array with one reply action containing:
  - type: "reply" or "draft_reply"
  - title: Brief description of the reply
  - payload: object with "to", "subject", "body" fields
  - confidence: how confident this is a good reply (0.0-1.0)
  - reasoning: why this reply is appropriate

Guidelines for replies:
- Be professional but friendly
- Keep replies concise and to the point
- Address the main points from the original email
- Use appropriate tone (formal for business, casual for personal)
- Include necessary action items or next steps
- Don't make commitments the user hasn't authorized`

  const userMessage = `Draft a reply for this email:

User: ${user.display_name || user.email}

Original Email:
From: ${email.from}
Subject: ${email.subject}
Content: ${email.body || email.snippet || 'No content available'}

User requested action: ${JSON.stringify(action)}

Generate an appropriate reply that addresses the sender's needs while maintaining a professional tone.`

  try {
    const raw = await llm.chat([
      {role: 'system', content: sys},
      {role: 'user', content: userMessage}
    ], {temperature: 0.4, max_tokens: 800, apiKey: opts.apiKey, model: opts.model})

    const jsonText = extractJson(raw)
    const parsed = JSON.parse(jsonText)
    
    return {
      actions: parsed.actions || [],
      followups: []
    }
  } catch (err) {
    console.error('Failed to generate reply draft:', err)
    return {
      actions: [{
        type: 'reply',
        title: 'Draft reply (manual composition needed)',
        payload: {
          to: email.from,
          subject: `Re: ${email.subject || ''}`,
          body: 'Thank you for your email. I will review this and get back to you soon.\n\nBest regards'
        },
        confidence: 0.5,
        reasoning: 'Generated fallback reply due to processing error'
      }],
      followups: []
    }
  }
}

// Generate meeting proposal with time suggestions
async function generateMeetingProposal(user, email, action, opts, calendarBusy) {
  const sys = `You are a calendar assistant that creates meeting proposals based on email content.
Analyze the email and generate appropriate meeting details.

IMPORTANT TIMEZONE HANDLING:
- User timezone is: ${user.timezone || 'UTC'}
- All times must be calculated in the user's timezone
- When suggesting meeting times, use the user's local business hours
- Generate start/end times as ISO strings in the user's timezone

Return a JSON object with:
- actions: array with one meeting action containing:
  - type: "create_event" or "create_meeting"  
  - title: Meeting title/purpose
  - payload: object with meeting details
  - confidence: how confident this meeting is appropriate (0.0-1.0)
  - reasoning: why this meeting is suggested

Meeting payload should include:
- title/summary: Clear meeting purpose
- description: Meeting agenda/notes
- start: ISO datetime string in user's timezone (${user.timezone || 'UTC'})
- end: ISO datetime string in user's timezone (${user.timezone || 'UTC'})
- attendees: array of email addresses

Guidelines:
- Suggest meetings within business hours (9 AM - 6 PM) in user's timezone (${user.timezone || 'UTC'})
- Default to 30-60 minute duration based on context
- Avoid scheduling conflicts if calendar data provided
- Include relevant context from the original email
- If user mentions specific times (like "9 AM"), interpret as ${user.timezone || 'UTC'} time`

  const calendarContext = calendarBusy && calendarBusy.length > 0 
    ? `\nUser's busy times in next 3 days: ${JSON.stringify(calendarBusy)}`
    : '\nNo calendar conflicts data available'

  const userMessage = `Create a meeting proposal for this email:

User: ${user.display_name || user.email}
User Timezone: ${user.timezone || 'UTC'}
Current Time: ${new Date().toLocaleString('en-US', { timeZone: user.timezone || 'UTC' })}

Original Email:
From: ${email.from}
Subject: ${email.subject}
Content: ${email.body || email.snippet || 'No content available'}

User requested action: ${JSON.stringify(action)}${calendarContext}

Generate appropriate meeting details including suggested time slots in ${user.timezone || 'UTC'} timezone.`

  try {
    const raw = await llm.chat([
      {role: 'system', content: sys},
      {role: 'user', content: userMessage}
    ], {temperature: 0.3, max_tokens: 600, apiKey: opts.apiKey, model: opts.model})

    const jsonText = extractJson(raw)
    const parsed = JSON.parse(jsonText)
    
    return {
      actions: parsed.actions || [],
      followups: []
    }
  } catch (err) {
    console.error('Failed to generate meeting proposal:', err)
    
    // Generate fallback meeting
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(14, 0, 0, 0) // 2 PM tomorrow
    
    const endTime = new Date(tomorrow)
    endTime.setHours(15, 0, 0, 0) // 1 hour duration
    
    const senderEmail = (email.from.match(/<(.+)>/) || [null, email.from])[1] || email.from
    
    return {
      actions: [{
        type: 'create_event',
        title: `Meeting with ${email.from}`,
        payload: {
          title: `Meeting regarding: ${email.subject || 'Email discussion'}`,
          description: `Meeting to discuss email from ${email.from}.\n\nOriginal email subject: ${email.subject}`,
          start: tomorrow.toISOString(),
          end: endTime.toISOString(),
          attendees: [senderEmail]
        },
        confidence: 0.6,
        reasoning: 'Generated fallback meeting proposal'
      }],
      followups: []
    }
  }
}

// ============= MEETING REQUIREMENTS PARSER =============

async function processChatMeetingCreation(context, opts = {}) {
  const { user, message } = context
  
  console.log(`📅 Processing chat meeting creation request: "${message}"`)
  
  try {
    // First, use LLM to parse the meeting requirements from the chat message
    const meetingParsing = await parseMeetingRequirements(user, message, opts)
    
    if (meetingParsing && meetingParsing.success) {
      console.log(`✅ Successfully parsed meeting from chat:`, meetingParsing)
      
      // Return the response in a format that includes meeting creation actions
      return {
        type: 'create_meeting',
        success: true,
        response: `I'll help you create that meeting! Here are the details I understood:
        
**Meeting: ${meetingParsing.title || 'New Meeting'}**
${meetingParsing.description ? `- Description: ${meetingParsing.description}` : ''}
${meetingParsing.start_time ? `- Start: ${new Date(meetingParsing.start_time).toLocaleString('en-US', { timeZone: user.timezone || 'UTC' })}` : ''}
${meetingParsing.end_time ? `- End: ${new Date(meetingParsing.end_time).toLocaleString('en-US', { timeZone: user.timezone || 'UTC' })}` : ''}
${meetingParsing.location ? `- Location: ${meetingParsing.location}` : ''}
${meetingParsing.recurring?.enabled ? `- Recurring: ${meetingParsing.recurring.frequency || 'weekly'}` : ''}

Would you like me to create this meeting in your Google Calendar?`,
        actions: [{
          type: 'create_calendar_event',
          title: `Create Meeting: ${meetingParsing.title || 'New Meeting'}`,
          payload: meetingParsing,
          confidence: 0.9,
          reasoning: 'User requested meeting creation through chat'
        }],
        meetingData: meetingParsing,
        followups: []
      }
    } else {
      // If LLM parsing failed, return a helpful response with basic meeting creation
      console.log(`⚠️ LLM parsing failed, offering basic meeting creation`)
      
      return {
        type: 'create_meeting',
        success: true,
        response: `I'd be happy to help you create a meeting! I understood you want to schedule something, but I need a few more details.

Could you provide:
- Meeting title
- Date and time (e.g., "tomorrow at 2pm", "next Monday at 9:30am")
- Duration (optional, defaults to 1 hour)
- Attendees (optional)
- Location or meeting link (optional)

For example: "Schedule team standup every Tuesday at 9am" or "Book client call tomorrow 3-4pm with john@company.com"`,
        actions: [],
        followups: ['What would you like to call this meeting?', 'When should the meeting be scheduled?']
      }
    }
  } catch (error) {
    console.error('Chat meeting creation error:', error)
    return {
      type: 'create_meeting',
      success: false,
      response: 'I encountered an issue while trying to create your meeting. Could you try rephrasing your request?',
      error: error.message,
      actions: [],
      followups: ['Try: "Schedule meeting tomorrow at 2pm"', 'Try: "Create weekly standup every Monday at 9am"']
    }
  }
}

async function parseMeetingRequirements(user, meetingText, opts = {}) {
  const context = { user, meetingText, type: 'meeting_parsing' }
  
  const sys = `You are an intelligent meeting scheduler that analyzes user input and extracts structured meeting information.

CRITICAL: You must respond with ONLY valid JSON. Do not include any explanations, markdown formatting, or additional text.

IMPORTANT TIMEZONE HANDLING:
- User's timezone is: ${user.timezone || 'UTC'}
- All times must be interpreted and calculated in the user's timezone
- Return times in ISO 8601 format with proper timezone handling

Parse the user's meeting request and return a JSON object with EXACTLY this structure:
{
  "success": true,
  "title": "Meeting title",
  "description": "Detailed meeting description", 
  "start_time": "2025-11-22T08:00:00.000Z",
  "end_time": "2025-11-22T09:00:00.000Z",
  "duration_minutes": 60,
  "location": "Physical location or video link",
  "attendees": ["email1@example.com", "email2@example.com"],
  "recurring": {
    "enabled": false,
    "frequency": "weekly|daily|monthly",
    "interval": 1,
    "end_date": "2025-12-22T00:00:00.000Z",
    "occurrences": 10
  },
  "reminders": [
    {"method": "email", "minutes": 15},
    {"method": "popup", "minutes": 10}
  ],
  "priority": "high|normal|low",
  "visibility": "public|private",
  "notes": "Additional meeting notes"
}

PARSING RULES:
1. DATES & TIMES:
   - "tomorrow" = next day in user's timezone
   - "next week" = same day next week
   - "8am", "2:30pm" = times in user's timezone
   - "Monday at 3pm" = next Monday at 3pm
   - Default duration: 60 minutes if not specified

2. RECURRING MEETINGS:
   - "weekly team standup" = weekly recurring
   - "daily check-in" = daily recurring  
   - "monthly review" = monthly recurring
   - "every Tuesday at 2pm" = weekly on Tuesday

3. ATTENDEES:
   - Extract email addresses from text
   - "with john@company.com" = add to attendees
   - "team meeting" = may need attendee list

4. LOCATION:
   - "zoom meeting" = virtual
   - "conference room A" = physical location
   - "meet.google.com/abc" = video link

5. PRIORITY & REMINDERS:
   - "urgent meeting" = high priority
   - "quick chat" = normal priority, shorter duration
   - "important presentation" = high priority, longer duration

EXAMPLES:
Input: "every thursday 9 to 9.30am"
Output: {"success":true,"title":"Weekly Thursday Meeting","start_time":"2025-11-21T09:00:00.000Z","end_time":"2025-11-21T09:30:00.000Z","duration_minutes":30,"recurring":{"enabled":true,"frequency":"weekly","interval":1}}

Input: "team standup tomorrow 10am"  
Output: {"success":true,"title":"Team Standup","start_time":"2025-11-22T10:00:00.000Z","end_time":"2025-11-22T11:00:00.000Z","duration_minutes":60,"recurring":{"enabled":false}}

CRITICAL RULES:
- ALWAYS return valid JSON only
- NO explanations or extra text
- Use ISO 8601 format for all times
- If parsing fails, return: {"success": false, "error": "reason"}

User timezone: ${user.timezone || 'UTC'}
Current date: ${new Date().toISOString()}

Parse this meeting request and return ONLY JSON: "${meetingText}"`

  const usr = `Meeting request: "${meetingText}"`

  try {
    const messages = [
      { role: 'system', content: sys },
      { role: 'user', content: usr }
    ]
    
    const result = await llm.chat(messages, opts)
    console.log(`🤖 LLM meeting parsing result (length: ${result?.length || 0}):`, JSON.stringify(result))
    
    // Validate and parse the JSON response
    if (!result || typeof result !== 'string' || result.trim().length === 0) {
      console.error(`❌ Invalid LLM response - Type: ${typeof result}, Length: ${result?.length || 0}`)
      return { success: false, error: 'Empty or invalid response from LLM' }
    }
    
    // Clean up the response (remove any markdown formatting, extra whitespace)
    let cleanResult = result.trim()
    
    // Remove markdown code blocks if present
    if (cleanResult.startsWith('```json')) {
      cleanResult = cleanResult.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanResult.startsWith('```')) {
      cleanResult = cleanResult.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    try {
      const parsedResult = JSON.parse(cleanResult)
      
      // Validate that we have the expected structure
      if (typeof parsedResult === 'object' && parsedResult !== null) {
        // Ensure we have at least a success field
        if (!parsedResult.hasOwnProperty('success')) {
          parsedResult.success = true // Assume success if we got valid JSON
        }
        
        // For successful parsing, ensure we have minimum required fields
        if (parsedResult.success) {
          // Add default values for missing required fields
          if (!parsedResult.title) {
            parsedResult.title = 'Meeting' // Default title
          }
          
          // Validate time fields if present
          if (parsedResult.start_time && !parsedResult.end_time) {
            // Generate end time if start time is provided but not end time
            const startDate = new Date(parsedResult.start_time)
            const duration = parsedResult.duration_minutes || 60
            const endDate = new Date(startDate.getTime() + duration * 60 * 1000)
            parsedResult.end_time = endDate.toISOString()
          }
          
          console.log(`✅ LLM parsing successful with title: "${parsedResult.title}"`)
        }
        
        return parsedResult
      } else {
        console.error(`❌ LLM returned non-object JSON:`, parsedResult)
        return { success: false, error: 'Invalid JSON structure from LLM' }
      }
    } catch (jsonError) {
      console.error(`❌ JSON parsing failed. Raw response: "${cleanResult}"`)
      console.error(`❌ JSON error:`, jsonError.message)
      return { success: false, error: `Failed to parse LLM response as JSON: ${jsonError.message}` }
    }
  } catch (error) {
    console.error('Error parsing meeting requirements:', error)
    return { success: false, error: error.message }
  }
}

module.exports = { 
  // Legacy compatibility
  processEmail,
  
  // Main processor functions
  processLLMRequest,      // Enhanced generic processor with new modular system
  detectProcessorType,    // Intelligent processor detection
  
  // Processor implementations (original functions for backward compatibility)
  processEmailActions,
  processEmailSummary,
  processDailyBriefing,
  processMeetingNotes,
  processChatResponse,
  followupActionOnEmail,   // For prepare requests
  
  // Meeting/Calendar processors
  parseMeetingRequirements,
  processChatMeetingCreation,
  
  // Modular processor functions (new exports from modules)
  processEmailReply: emailProcessors.processEmailReply,
  extractEmailKeyInfo: emailProcessors.extractEmailKeyInfo,
  formatMeetingForCalendar: meetingProcessors.formatMeetingForCalendar,
  validateMeetingData: meetingProcessors.validateMeetingData,
  processTaskCreation: generalProcessors.processTaskCreation,
  processQuickAction: generalProcessors.processQuickAction,
  generateSmartSuggestions: generalProcessors.generateSmartSuggestions,
  analyzeTextSentiment: generalProcessors.analyzeTextSentiment,
  
  // Context collectors
  getComprehensiveContext: contextCollectorModules.getComprehensiveContext,
  collectUserContext: contextCollectorModules.collectUserContext,
  collectMessageContext: contextCollectorModules.collectMessageContext,
  collectCalendarContext: contextCollectorModules.collectCalendarContext,
  collectAppContext: contextCollectorModules.collectAppContext,
  
  // Data helpers
  sanitizeInput: dataHelpers.sanitizeInput,
  normalizeActionData: dataHelpers.normalizeActionData,
  formatUserContextForPrompt: dataHelpers.formatUserContextForPrompt,
  validateEmailData: dataHelpers.validateEmailData,
  formatDateTime: dataHelpers.formatDateTime,
  extractErrorDetails: dataHelpers.extractErrorDetails,
  
  // Utilities
  extractJson,
  
  // New modular processor class
  LLMProcessor
}