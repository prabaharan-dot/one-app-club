const express = require('express')
const router = express.Router()
const db = require('../db')
const llmProcessor = require('../llm/processor')

// POST /api/llm/process
// Generic LLM processing endpoint
router.post('/process', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { type, params = {} } = req.body
    if (!type) return res.status(400).json({ error: 'missing_type' })

    // Get user data
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId])
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'user_not_found' })
    const user = userRes.rows[0]

    // Process the request (using global API key from environment)
    const result = await llmProcessor.processLLMRequest(type, user, params, {})
    
    res.json({ success: true, result })
  } catch (err) {
    console.error('LLM processing error:', err)
    res.status(500).json({ error: 'processing_failed', message: err.message })
  }
})

// GET /api/llm/summary/:timeframe
// Quick email summary endpoint
router.get('/summary/:timeframe', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { timeframe } = req.params
    const limit = parseInt(req.query.limit) || 50

    // Get user data
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId])
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'user_not_found' })
    const user = userRes.rows[0]

    // Process email summary (using global API key from environment)
    const result = await llmProcessor.processLLMRequest('email_summary', user, { timeframe, limit }, {})
    
    res.json({ success: true, result })
  } catch (err) {
    console.error('Email summary error:', err)
    res.status(500).json({ error: 'summary_failed', message: err.message })
  }
})

// GET /api/llm/briefing
// Daily briefing endpoint
router.get('/briefing', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    // Get user data
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId])
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'user_not_found' })
    const user = userRes.rows[0]

    // Process daily briefing (using global API key from environment)
    const result = await llmProcessor.processLLMRequest('daily_briefing', user, {}, {})
    
    res.json({ success: true, result })
  } catch (err) {
    console.error('Daily briefing error:', err)
    res.status(500).json({ error: 'briefing_failed', message: err.message })
  }
})

// POST /api/llm/chat
// Chat interaction endpoint with task creation support
router.post('/chat', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { message, context = {}, processorType = null } = req.body
    if (!message) return res.status(400).json({ error: 'missing_message' })

    // Get user data
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId])
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'user_not_found' })
    const user = userRes.rows[0]

    // Get user's LLM API key
    let userApiKey = null;
    try {
      const settingsRes = await db.query('SELECT llm_key_encrypted FROM user_settings WHERE user_id = $1', [userId])
      if (settingsRes.rows.length > 0 && settingsRes.rows[0].llm_key_encrypted) {
        // In a real app, you'd decrypt this properly
        userApiKey = settingsRes.rows[0].llm_key_encrypted.toString();
      }
    } catch (settingsErr) {
      console.warn('Could not get user API key:', settingsErr.message);
    }

    // Prepare options with user's API key
    const processingOptions = {
      apiKey: userApiKey || process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    };

    // Enhanced context with user info
    const enhancedContext = {
      ...context,
      user: user
    };

    // Process with intelligent processor detection (pass null or processorType)
    const result = await llmProcessor.processLLMRequest(processorType, user, { 
      message, 
      context: enhancedContext 
    }, processingOptions);
    
    res.json({ 
      success: true, 
      response: result, 
      detectedType: result.processorType || result.type,
      taskCreated: result.success || false 
    });
  } catch (err) {
    console.error('Chat processing error:', err)
    res.status(500).json({ error: 'chat_failed', message: err.message })
  }
})

// POST /api/llm/intelligent
// New intelligent endpoint that auto-detects user intent and routes accordingly
router.post('/intelligent', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { message, context = {}, sessionId } = req.body
    if (!message) return res.status(400).json({ error: 'missing_message' })

    // Get user data
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId])
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'user_not_found' })
    const user = userRes.rows[0]

    // Get conversation history if sessionId is provided
    let conversationHistory = []
    if (sessionId) {
      try {
        const historyRes = await db.query(`
          SELECT 
            message_role,
            content,
            created_at
          FROM chat_messages
          WHERE session_id = $1 AND user_id = $2 AND context_relevant = TRUE
          ORDER BY created_at DESC
          LIMIT 10
        `, [sessionId, userId])

        // Format for LLM (reverse to chronological order)
        conversationHistory = historyRes.rows
          .reverse()
          .map(msg => ({
            role: msg.message_role === 'user' ? 'user' : 'assistant',
            content: msg.content
          }))

        console.log(`Retrieved ${conversationHistory.length} conversation messages for session ${sessionId}`)
      } catch (historyErr) {
        console.warn('Could not retrieve conversation history:', historyErr.message)
        // Continue without history rather than failing
      }
    }

    // Enhanced context with conversation history
    const enhancedContext = {
      ...context,
      user,
      sessionId,
      conversationHistory
    }

    // Get user's LLM API key for processing
    let userApiKey = null;
    try {
      const settingsRes = await db.query('SELECT llm_key_encrypted FROM user_settings WHERE user_id = $1', [userId])
      if (settingsRes.rows.length > 0 && settingsRes.rows[0].llm_key_encrypted) {
        userApiKey = settingsRes.rows[0].llm_key_encrypted.toString();
      }
    } catch (settingsErr) {
      console.warn('Could not get user API key:', settingsErr.message);
    }

    // Processing options with API key
    const processingOptions = {
      apiKey: userApiKey || process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    };

    // Always use intelligent detection (pass null for processor type)
    const result = await llmProcessor.processLLMRequest(null, user, { 
      message, 
      context: enhancedContext 
    }, processingOptions)
    
    res.json({ 
      success: true, 
      response: result,
      detectedType: result.type,
      sessionId,
      conversationContext: conversationHistory.length,
      message: 'Intelligently processed your request with conversation context'
    })
  } catch (err) {
    console.error('Intelligent processing error:', err)
    res.status(500).json({ error: 'processing_failed', message: err.message })
  }
})

// GET /api/llm/stats
// Get processing stats and available processors
router.get('/stats', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const availableProcessors = [
      {
        type: 'email_actions',
        name: 'Email Actions',
        description: 'Suggest actions for individual emails',
        input: 'Single email object'
      },
      {
        type: 'email_summary', 
        name: 'Email Summary',
        description: 'Summarize emails for a time period',
        input: 'Timeframe (today, yesterday, week)'
      },
      {
        type: 'daily_briefing',
        name: 'Daily Briefing', 
        description: 'Complete daily overview across all platforms',
        input: 'None (auto-collects data)'
      },
      {
        type: 'meeting_notes',
        name: 'Meeting Notes',
        description: 'Process meeting transcripts',
        input: 'Meeting transcript text'
      },
      {
        type: 'chat_response',
        name: 'Chat Response',
        description: 'General AI assistant chat',
        input: 'User message and context'
      }
    ]

    // Get usage stats from llm_calls table
    let usageStats = { total_calls: 0, calls_today: 0 }
    try {
      const statsRes = await db.query(`
        SELECT 
          COUNT(*) as total_calls,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as calls_today
        FROM llm_calls 
        WHERE user_id = $1
      `, [userId])
      
      if (statsRes.rowCount > 0) {
        usageStats = statsRes.rows[0]
      }
    } catch (err) {
      // llm_calls table might not exist yet
      console.log('Usage stats not available:', err.message)
    }

    res.json({
      success: true,
      processors: availableProcessors,
      usage_stats: usageStats
    })
  } catch (err) {
    console.error('Stats error:', err)
    res.status(500).json({ error: 'stats_failed', message: err.message })
  }
})

// GET /api/llm/processing-status
// Get processing job statistics
router.get('/processing-status', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const llmProcessingJob = require('../jobs/llmProcessingJob')
    const stats = await llmProcessingJob.getStats()
    
    // Get user-specific stats
    const userStats = await db.query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE llm_processed = true) as processed_messages,
        COUNT(*) FILTER (WHERE llm_processed = false) as unprocessed_messages,
        COUNT(*) FILTER (WHERE llm_processed = false AND llm_processing_attempts > 0) as retry_messages,
        MAX(created_at) as latest_message
      FROM messages
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
    `, [userId])

    res.json({
      success: true,
      global_stats: stats,
      user_stats: userStats.rows[0],
      job_running: llmProcessingJob.isRunning
    })
  } catch (err) {
    console.error('Processing status error:', err)
    res.status(500).json({ error: 'status_failed', message: err.message })
  }
})

// POST /api/llm/retry-failed
// Retry failed message processing for current user
router.post('/retry-failed', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const llmProcessingJob = require('../jobs/llmProcessingJob')
    await llmProcessingJob.retryFailedMessages(userId)
    
    res.json({ success: true, message: 'Failed messages queued for retry' })
  } catch (err) {
    console.error('Retry failed error:', err)
    res.status(500).json({ error: 'retry_failed', message: err.message })
  }
})

// POST /api/llm/debug-chat - Temporary debug endpoint
router.post('/debug-chat', async (req, res) => {
  try {
    const { message = 'hello', context = {} } = req.body
    
    // Mock user for testing with proper UUID format
    const user = {
      id: 'ec5ea4d4-ab0d-414c-9caf-4a65c44c634b', // Use existing user ID from logs
      email: 'debug@example.com',
      display_name: 'Debug User'
    }
    
    console.log('=== DEBUG CHAT REQUEST ===')
    console.log('Message:', message)
    console.log('Context:', context)
    console.log('Environment - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'MISSING')
    console.log('Environment - OPENAI_MODEL:', process.env.OPENAI_MODEL)
    
    // Process with intelligent processor detection
    const result = await llmProcessor.processLLMRequest(null, user, { message, context }, {})
    
    console.log('=== DEBUG CHAT RESULT ===')
    console.log('Result:', JSON.stringify(result, null, 2))
    
    res.json({ 
      success: true, 
      response: result,
      detectedType: result.type,
      debug: {
        envApiKey: process.env.OPENAI_API_KEY ? 'SET' : 'MISSING',
        envModel: process.env.OPENAI_MODEL
      }
    })
  } catch (err) {
    console.error('Debug chat error:', err)
    res.status(500).json({ error: 'debug_failed', message: err.message })
  }
})

// POST /api/llm/execute-action - Execute action from chat response
router.post('/execute-action', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { action } = req.body
    if (!action || !action.type) return res.status(400).json({ error: 'missing_action' })

    console.log(`🎯 Executing chat action: ${action.type}`)

    // Get user data  
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId])
    if (userRes.rowCount === 0) return res.status(404).json({ error: 'user_not_found' })
    const user = userRes.rows[0]

    if (action.type === 'create_calendar_event') {
      // Import the googleapis library (same approach as messages route)
      const { google } = require('googleapis')
      
      if (!action.payload) {
        return res.status(400).json({ error: 'missing_meeting_payload' })
      }

      const meetingData = action.payload
      
      try {
        // Get user's Google OAuth tokens (use 'gmail' platform like other routes)
        const integrationRes = await db.query(
          'SELECT oauth_token_encrypted FROM integrations WHERE user_id = $1 AND platform = $2 AND enabled = true',
          [userId, 'gmail']
        )

        if (integrationRes.rowCount === 0) {
          console.error(`❌ No Google integration found for user ${userId}`)
          return res.status(400).json({ 
            error: 'google_not_connected',
            message: 'Please connect your Google Calendar first. Go to Settings → Integrations to connect your Google account.'
          })
        }

        const tokens = JSON.parse(integrationRes.rows[0].oauth_token_encrypted.toString())
        
        // Create OAuth2 client and calendar service (same as messages route)
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID, 
          process.env.GOOGLE_CLIENT_SECRET
        )
        oauth2Client.setCredentials(tokens)
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

        // Build the calendar event
        const eventPayload = {
          summary: meetingData.title || 'Meeting',
          description: meetingData.description || meetingData.notes || '',
          start: {
            dateTime: meetingData.start_time,
            timeZone: user.timezone || 'UTC'
          },
          end: {
            dateTime: meetingData.end_time || new Date(new Date(meetingData.start_time).getTime() + 60 * 60 * 1000).toISOString(),
            timeZone: user.timezone || 'UTC'
          }
        }

        // Add location if provided
        if (meetingData.location) {
          eventPayload.location = meetingData.location
        }

        // Add attendees if provided
        if (meetingData.attendees && meetingData.attendees.length > 0) {
          eventPayload.attendees = meetingData.attendees.map(email => ({ email }))
        }

        // Add recurrence if specified
        if (meetingData.recurring && meetingData.recurring.enabled) {
          const frequency = (meetingData.recurring.frequency || 'weekly').toUpperCase()
          const interval = meetingData.recurring.interval || 1
          let rrule = `FREQ=${frequency};INTERVAL=${interval}`
          
          if (meetingData.recurring.end_date) {
            // Format the end date properly: YYYYMMDDTHHMMSSZ
            const endDate = new Date(meetingData.recurring.end_date)
            const formattedEndDate = endDate.getUTCFullYear().toString() +
              (endDate.getUTCMonth() + 1).toString().padStart(2, '0') +
              endDate.getUTCDate().toString().padStart(2, '0') +
              'T' +
              endDate.getUTCHours().toString().padStart(2, '0') +
              endDate.getUTCMinutes().toString().padStart(2, '0') +
              endDate.getUTCSeconds().toString().padStart(2, '0') +
              'Z'
            rrule += `;UNTIL=${formattedEndDate}`
          } else if (meetingData.recurring.occurrences) {
            rrule += `;COUNT=${meetingData.recurring.occurrences}`
          }
          
          eventPayload.recurrence = [rrule]
        }

        // Add reminders if specified
        if (meetingData.reminders && meetingData.reminders.length > 0) {
          eventPayload.reminders = {
            useDefault: false,
            overrides: meetingData.reminders.map(reminder => ({
              method: reminder.method || 'email',
              minutes: reminder.minutes || 15
            }))
          }
        }

        console.log(`📅 Creating calendar event:`, eventPayload)
        const result = await calendar.events.insert({
          calendarId: 'primary',
          resource: eventPayload
        })

        console.log(`✅ Meeting created successfully: ${result.data.id}`)
        
        res.json({
          success: true,
          message: 'Meeting created successfully in your Google Calendar!',
          event: {
            id: result.data.id,
            title: eventPayload.summary,
            start: eventPayload.start.dateTime,
            end: eventPayload.end.dateTime,
            link: result.data.htmlLink
          }
        })

      } catch (error) {
        console.error('Calendar creation error:', error)
        res.status(500).json({ 
          error: 'calendar_creation_failed', 
          message: 'Failed to create calendar event: ' + error.message 
        })
      }

    } else if (action.type === 'create_task') {
      // Handle Google Tasks creation
      const { google } = require('googleapis')
      
      if (!action.data) {
        return res.status(400).json({ error: 'missing_task_data' })
      }

      const taskData = action.data
      
      try {
        // Get user's Google OAuth tokens (same pattern as calendar)
        const integrationRes = await db.query(
          'SELECT oauth_token_encrypted FROM integrations WHERE user_id = $1 AND platform = $2 AND enabled = true',
          [userId, 'gmail']
        )

        if (integrationRes.rowCount === 0) {
          console.error(`❌ No Google integration found for user ${userId}`)
          return res.status(400).json({ 
            error: 'google_not_connected',
            message: 'Please connect your Google account first. Go to Settings → Integrations to connect your Google account.'
          })
        }

        const tokens = JSON.parse(integrationRes.rows[0].oauth_token_encrypted.toString())
        
        // Create OAuth2 client and Tasks service
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID, 
          process.env.GOOGLE_CLIENT_SECRET
        )
        oauth2Client.setCredentials(tokens)
        const tasks = google.tasks({ version: 'v1', auth: oauth2Client })

        // Build the Google Task
        const googleTask = {
          title: taskData.title,
          notes: taskData.description || '',
        }

        // Add due date if provided
        if (taskData.due_date) {
          const dueDate = new Date(taskData.due_date)
          if (!isNaN(dueDate.getTime())) {
            googleTask.due = dueDate.toISOString()
          }
        }

        console.log(`📝 Creating Google Task:`, googleTask)
        const result = await tasks.tasks.insert({
          tasklist: '@default',
          resource: googleTask
        })

        console.log(`✅ Task created successfully: ${result.data.id}`)
        
        res.json({
          success: true,
          message: 'Task created successfully in Google Tasks!',
          task: {
            id: result.data.id,
            title: googleTask.title,
            description: googleTask.notes,
            due: googleTask.due,
            status: result.data.status
          }
        })

      } catch (error) {
        console.error('Google Tasks creation error:', error)
        res.status(500).json({ 
          error: 'task_creation_failed', 
          message: 'Failed to create Google Task: ' + error.message 
        })
      }

    } else {
      res.status(400).json({ error: 'unsupported_action_type', actionType: action.type })
    }

  } catch (err) {
    console.error('Execute action error:', err)
    res.status(500).json({ error: 'execution_failed', message: err.message })
  }
})

module.exports = router
