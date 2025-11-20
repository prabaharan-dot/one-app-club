const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/chat/sessions - Get user's chat sessions
router.get('/sessions', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const result = await db.query(`
      SELECT 
        s.id,
        s.title,
        s.created_at,
        s.updated_at,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON s.id = m.session_id
      WHERE s.user_id = $1
      GROUP BY s.id, s.title, s.created_at, s.updated_at
      ORDER BY s.updated_at DESC
      LIMIT 50
    `, [userId])

    res.json({ sessions: result.rows })
  } catch (err) {
    console.error('Get sessions error:', err)
    res.status(500).json({ error: 'server_error' })
  }
})

// POST /api/chat/sessions - Create new chat session
router.post('/sessions', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { title = 'New Chat' } = req.body

    // Create session
    const sessionResult = await db.query(`
      INSERT INTO chat_sessions (user_id, title) 
      VALUES ($1, $2) 
      RETURNING id, title, created_at, updated_at
    `, [userId, title])

    const session = sessionResult.rows[0]

    // Create initial message
    await db.query(`
      SELECT create_initial_chat_message($1, $2)
    `, [session.id, userId])

    res.json({ session })
  } catch (err) {
    console.error('Create session error:', err)
    res.status(500).json({ error: 'server_error' })
  }
})

// GET /api/chat/sessions/:id - Get session with messages
router.get('/sessions/:id', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { id: sessionId } = req.params
    const { limit = 100 } = req.query

    // Verify session belongs to user
    const sessionResult = await db.query(`
      SELECT id, title, created_at, updated_at 
      FROM chat_sessions 
      WHERE id = $1 AND user_id = $2
    `, [sessionId, userId])

    if (sessionResult.rowCount === 0) {
      return res.status(404).json({ error: 'session_not_found' })
    }

    const session = sessionResult.rows[0]

    // Get messages
    const messagesResult = await db.query(`
      SELECT 
        id,
        message_role as "from",
        content as text,
        message_type as type,
        metadata,
        context_relevant,
        created_at
      FROM chat_messages
      WHERE session_id = $1 AND user_id = $2
      ORDER BY created_at ASC
      LIMIT $3
    `, [sessionId, userId, parseInt(limit)])

    // Transform messages to match ChatWindow format
    const messages = messagesResult.rows.map(msg => ({
      id: msg.id,
      from: msg.from,
      text: msg.text,
      type: msg.type,
      data: msg.metadata,
      timestamp: msg.created_at,
      contextRelevant: msg.context_relevant
    }))

    res.json({ session, messages })
  } catch (err) {
    console.error('Get session messages error:', err)
    res.status(500).json({ error: 'server_error' })
  }
})

// POST /api/chat/messages - Save new message
router.post('/messages', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { sessionId, role, content, type = 'chat_response', metadata = {}, contextRelevant = true } = req.body

    if (!sessionId || !role || !content) {
      return res.status(400).json({ error: 'missing_required_fields' })
    }

    // Verify session belongs to user
    const sessionCheck = await db.query(`
      SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2
    `, [sessionId, userId])

    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({ error: 'session_not_found' })
    }

    // Insert message
    const result = await db.query(`
      INSERT INTO chat_messages (session_id, user_id, message_role, content, message_type, metadata, context_relevant)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `, [sessionId, userId, role, content, type, JSON.stringify(metadata), contextRelevant])

    const message = result.rows[0]

    res.json({ 
      message: {
        id: message.id,
        sessionId,
        from: role,
        text: content,
        type,
        data: metadata,
        timestamp: message.created_at,
        contextRelevant
      }
    })
  } catch (err) {
    console.error('Save message error:', err)
    res.status(500).json({ error: 'server_error' })
  }
})

// GET /api/chat/sessions/:id/context - Get conversation context for LLM
router.get('/sessions/:id/context', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { id: sessionId } = req.params
    const { limit = 10 } = req.query

    // Get recent context-relevant messages
    const result = await db.query(`
      SELECT 
        message_role,
        content,
        created_at
      FROM chat_messages
      WHERE session_id = $1 AND user_id = $2 AND context_relevant = TRUE
      ORDER BY created_at DESC
      LIMIT $3
    `, [sessionId, userId, parseInt(limit)])

    // Format for LLM (reverse to chronological order)
    const conversationHistory = result.rows
      .reverse()
      .map(msg => ({
        role: msg.message_role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))

    res.json({ conversationHistory })
  } catch (err) {
    console.error('Get context error:', err)
    res.status(500).json({ error: 'server_error' })
  }
})

// PUT /api/chat/sessions/:id - Update session title
router.put('/sessions/:id', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { id: sessionId } = req.params
    const { title } = req.body

    if (!title) {
      return res.status(400).json({ error: 'missing_title' })
    }

    const result = await db.query(`
      UPDATE chat_sessions 
      SET title = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING id, title, updated_at
    `, [title, sessionId, userId])

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'session_not_found' })
    }

    res.json({ session: result.rows[0] })
  } catch (err) {
    console.error('Update session error:', err)
    res.status(500).json({ error: 'server_error' })
  }
})

// DELETE /api/chat/sessions/:id - Delete session and all messages
router.delete('/sessions/:id', async (req, res) => {
  try {
    const userId = req.session && req.session.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { id: sessionId } = req.params

    const result = await db.query(`
      DELETE FROM chat_sessions 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [sessionId, userId])

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'session_not_found' })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Delete session error:', err)
    res.status(500).json({ error: 'server_error' })
  }
})

module.exports = router
