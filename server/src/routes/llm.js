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
// Chat interaction endpoint
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

    // Process with intelligent processor detection (pass null or processorType)
    const result = await llmProcessor.processLLMRequest(processorType, user, { message, context }, {})
    
    res.json({ success: true, response: result, detectedType: result.type })
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

    // Always use intelligent detection (pass null for processor type)
    const result = await llmProcessor.processLLMRequest(null, user, { message, context, sessionId }, {})
    
    res.json({ 
      success: true, 
      response: result,
      detectedType: result.type,
      sessionId,
      message: 'Intelligently processed your request'
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

module.exports = router
