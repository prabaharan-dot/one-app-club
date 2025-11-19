const db = require('../../db')
const llmProcessor = require('../../llm/processor')

const PROCESSING_INTERVAL = parseInt(process.env.LLM_PROCESSING_INTERVAL || '60000') // 1 minute
const MAX_RETRY_ATTEMPTS = parseInt(process.env.LLM_MAX_RETRIES || '3')
const RETRY_DELAY_HOURS = parseInt(process.env.LLM_RETRY_DELAY_HOURS || '1')

class LLMProcessingJob {
  constructor() {
    this.isRunning = false
    this.timer = null
  }

  async start() {
    if (this.isRunning) {
      console.log('LLM processing job is already running')
      return
    }

    console.log('Starting LLM processing job...')
    this.isRunning = true
    
    // Process immediately on start
    await this.processUnprocessedMessages()
    
    // Then set up interval
    this.timer = setInterval(() => {
      this.processUnprocessedMessages().catch(err => {
        console.error('LLM processing job error:', err)
      })
    }, PROCESSING_INTERVAL)
  }

  async stop() {
    if (!this.isRunning) return
    
    console.log('Stopping LLM processing job...')
    this.isRunning = false
    
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async processUnprocessedMessages() {
    try {
      // Get unprocessed messages with retry logic
      const unprocessedMessages = await this.getUnprocessedMessages()
      
      if (unprocessedMessages.length === 0) {
        console.log('No unprocessed messages to handle')
        return
      }

      console.log(`Processing ${unprocessedMessages.length} unprocessed messages`)

      // Group messages by user to batch LLM settings lookup
      const messagesByUser = {}
      for (const msg of unprocessedMessages) {
        if (!messagesByUser[msg.user_id]) {
          messagesByUser[msg.user_id] = []
        }
        messagesByUser[msg.user_id].push(msg)
      }

      // Process each user's messages
      for (const [userId, messages] of Object.entries(messagesByUser)) {
        await this.processUserMessages(userId, messages)
      }

    } catch (err) {
      console.error('Error in processUnprocessedMessages:', err)
    }
  }

  async getUnprocessedMessages() {
    const retryDelayMs = RETRY_DELAY_HOURS * 60 * 60 * 1000
    const retryThreshold = new Date(Date.now() - retryDelayMs).toISOString()

    const query = `
      SELECT m.*, u.display_name, u.email as user_email, u.preferences
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE (
        -- Never processed
        m.llm_processed = false AND m.llm_processing_attempts = 0
      ) OR (
        -- Failed but within retry attempts and past retry delay
        m.llm_processed = false 
        AND m.llm_processing_attempts < $1 
        AND (m.llm_last_attempt IS NULL OR m.llm_last_attempt < $2)
      )
      ORDER BY m.received_at DESC
      LIMIT 50
    `

    const result = await db.query(query, [MAX_RETRY_ATTEMPTS, retryThreshold])
    return result.rows
  }

  async processUserMessages(userId, messages) {
    try {
      // Get user's LLM settings once per batch
      const userLLMSettings = await this.getUserLLMSettings(userId)
      
      if (!userLLMSettings) {
        console.log(`No LLM settings for user ${userId}, skipping processing`)
        // Mark as processed but with error
        for (const msg of messages) {
          await this.markProcessingResult(msg.id, false, 'No LLM settings configured')
        }
        return
      }

      // Process each message
      for (const msg of messages) {
        await this.processMessage(msg, userLLMSettings)
        
        // Add small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      }

    } catch (err) {
      console.error(`Error processing messages for user ${userId}:`, err)
      
      // Mark all messages as failed for this batch
      for (const msg of messages) {
        await this.markProcessingResult(msg.id, false, err.message || 'Batch processing failed')
      }
    }
  }

  async processMessage(message, llmSettings) {
    const startTime = Date.now()
    
    try {
      console.log(`Processing message ${message.id} from ${message.sender}`)
      
      // Update attempt counter first
      await this.incrementProcessingAttempt(message.id)

      // Prepare message data for LLM
      const user = {
        id: message.user_id,
        email: message.user_email,
        display_name: message.display_name,
        preferences: message.preferences || {}
      }

      const email = {
        id: message.external_message_id,
        from: message.sender,
        subject: message.subject,
        snippet: (message.body_plain || '').substring(0, 200),
        body: message.body_plain || message.body
      }

      // Process with LLM
      const result = await llmProcessor.processLLMRequest('email_actions', user, { email }, {
        apiKey: llmSettings.apiKey,
        model: llmSettings.model
      })

      if (result.type === 'error') {
        throw new Error(result.error)
      }

      // Store the suggested actions
      const actions = result.actions || []
      if (actions.length > 0) {
        await this.storeMessageActions(message.id, message.user_id, actions)
        
        // Mark message as requiring action
        await db.query(
          'UPDATE messages SET action_required = true WHERE id = $1',
          [message.id]
        )
      }

      // Mark as successfully processed
      await this.markProcessingResult(message.id, true, null)

      // Log LLM usage for tracking
      const processingTime = Date.now() - startTime
      await this.logLLMUsage(message.user_id, 'email_actions', processingTime, llmSettings.model)

      console.log(`Successfully processed message ${message.id} in ${processingTime}ms`)

    } catch (err) {
      console.error(`Failed to process message ${message.id}:`, err.message)
      
      // Mark as failed
      await this.markProcessingResult(message.id, false, err.message || 'Processing failed')
      
      // Log failed attempt
      await this.logLLMUsage(message.user_id, 'email_actions', Date.now() - startTime, llmSettings.model, 'failed')
    }
  }

  async getUserLLMSettings(userId) {
    try {
      const result = await db.query(
        'SELECT llm_key_encrypted, llm_model FROM user_settings WHERE user_id = $1',
        [userId]
      )
      
      if (result.rowCount === 0) {
        return null
      }

      return {
        apiKey: result.rows[0].llm_key_encrypted.toString(),
        model: result.rows[0].llm_model || 'gpt-3.5-turbo'
      }
    } catch (err) {
      console.error(`Error getting LLM settings for user ${userId}:`, err)
      return null
    }
  }

  async incrementProcessingAttempt(messageId) {
    await db.query(`
      UPDATE messages 
      SET llm_processing_attempts = llm_processing_attempts + 1,
          llm_last_attempt = now()
      WHERE id = $1
    `, [messageId])
  }

  async markProcessingResult(messageId, success, error) {
    await db.query(`
      UPDATE messages 
      SET llm_processed = $2,
          llm_error = $3,
          llm_last_attempt = now()
      WHERE id = $1
    `, [messageId, success, error])
  }

  async storeMessageActions(messageId, userId, actions) {
    try {
      await db.query(`
        INSERT INTO message_actions (message_id, user_id, suggested_actions, created_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (message_id, user_id) 
        DO UPDATE SET suggested_actions = EXCLUDED.suggested_actions, created_at = now()
      `, [messageId, userId, JSON.stringify(actions)])
    } catch (err) {
      console.error('Error storing message actions:', err)
      throw err
    }
  }

  async logLLMUsage(userId, processorType, processingTime, model, status = 'success') {
    try {
      await db.query(`
        INSERT INTO llm_calls (user_id, processor_type, model, processing_time_ms, status, created_at)
        VALUES ($1, $2, $3, $4, $5, now())
      `, [userId, processorType, model, processingTime, status])
    } catch (err) {
      // Don't fail processing if logging fails
      console.error('Error logging LLM usage:', err)
    }
  }

  // Get processing statistics
  async getStats() {
    try {
      const stats = await db.query(`
        SELECT 
          COUNT(*) as total_messages,
          COUNT(*) FILTER (WHERE llm_processed = true) as processed_messages,
          COUNT(*) FILTER (WHERE llm_processed = false) as unprocessed_messages,
          COUNT(*) FILTER (WHERE llm_processed = false AND llm_processing_attempts >= $1) as failed_messages,
          AVG(llm_processing_attempts) FILTER (WHERE llm_processed = true) as avg_attempts_success
        FROM messages
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `, [MAX_RETRY_ATTEMPTS])

      return stats.rows[0]
    } catch (err) {
      console.error('Error getting processing stats:', err)
      return null
    }
  }

  // Manual retry of failed messages
  async retryFailedMessages(userId = null) {
    const userFilter = userId ? 'AND user_id = $2' : ''
    const params = userId ? [MAX_RETRY_ATTEMPTS, userId] : [MAX_RETRY_ATTEMPTS]
    
    await db.query(`
      UPDATE messages 
      SET llm_processing_attempts = 0,
          llm_last_attempt = NULL,
          llm_error = NULL
      WHERE llm_processed = false 
        AND llm_processing_attempts >= $1
        ${userFilter}
    `, params)
    
    console.log(`Reset failed messages for retry${userId ? ` for user ${userId}` : ''}`)
  }
}

// Singleton instance
const llmProcessingJob = new LLMProcessingJob()

module.exports = llmProcessingJob
