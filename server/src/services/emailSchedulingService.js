// Email Scheduling Service - Phase 2
// Handles scheduled email sending with optimal timing
const db = require('../db')
const { OAuth2Client } = require('google-auth-library')
const { gmail } = require('googleapis')

class EmailSchedulingService {
  constructor() {
    this.scheduleCheckInterval = 60000 // Check every minute for due emails
    this.startScheduleProcessor()
  }

  // Create a scheduled email
  async scheduleEmail(userId, emailData) {
    const {
      recipientEmail,
      subject,
      body,
      scheduledFor,
      timezone = 'UTC',
      messageId = null
    } = emailData

    const query = `
      INSERT INTO email_schedules (
        user_id, message_id, recipient_email, subject, body, 
        scheduled_for, timezone, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
      RETURNING *
    `
    
    const result = await db.query(query, [
      userId, messageId, recipientEmail, subject, body, 
      scheduledFor, timezone
    ])
    
    return result.rows[0]
  }

  // Get scheduled emails for a user
  async getUserScheduledEmails(userId, status = null) {
    let query = `
      SELECT 
        es.*,
        m.subject as original_subject,
        m.sender as original_sender
      FROM email_schedules es
      LEFT JOIN messages m ON es.message_id = m.id
      WHERE es.user_id = $1
    `
    const params = [userId]

    if (status) {
      query += ` AND es.status = $2`
      params.push(status)
    }

    query += ` ORDER BY es.scheduled_for ASC`

    const result = await db.query(query, params)
    return result.rows
  }

  // Cancel a scheduled email
  async cancelScheduledEmail(userId, scheduleId) {
    const query = `
      UPDATE email_schedules 
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'scheduled'
      RETURNING *
    `
    
    const result = await db.query(query, [scheduleId, userId])
    return result.rows[0]
  }

  // Get optimal send times based on user's email patterns
  async getOptimalSendTimes(userId) {
    const query = `
      SELECT 
        EXTRACT(hour FROM received_at) as hour,
        EXTRACT(dow FROM received_at) as day_of_week,
        COUNT(*) as email_count,
        AVG(response_time_hours) as avg_response_time
      FROM messages 
      WHERE user_id = $1 
        AND response_time_hours IS NOT NULL
        AND response_time_hours < 168 -- Within a week
      GROUP BY EXTRACT(hour FROM received_at), EXTRACT(dow FROM received_at)
      ORDER BY avg_response_time ASC, email_count DESC
      LIMIT 10
    `
    
    const result = await db.query(query, [userId])
    
    // Process results to suggest optimal times
    const optimalTimes = result.rows.map(row => ({
      hour: parseInt(row.hour),
      dayOfWeek: parseInt(row.day_of_week),
      avgResponseTime: parseFloat(row.avg_response_time),
      emailVolume: parseInt(row.email_count),
      score: this.calculateTimeScore(row)
    }))

    return optimalTimes
  }

  // Calculate scoring for send times
  calculateTimeScore(timeData) {
    const responseScore = Math.max(0, 10 - (timeData.avg_response_time / 24)) // Faster response = higher score
    const volumeScore = Math.min(5, timeData.email_count / 10) // More emails = slight bonus
    return responseScore + volumeScore
  }

  // Suggest optimal send time for a specific email
  async suggestOptimalSendTime(userId, recipientEmail) {
    // Check historical patterns with this specific recipient
    const recipientQuery = `
      SELECT 
        EXTRACT(hour FROM received_at) as hour,
        EXTRACT(dow FROM received_at) as day_of_week,
        AVG(response_time_hours) as avg_response_time
      FROM messages 
      WHERE user_id = $1 
        AND (sender ILIKE $2 OR recipient ILIKE $2)
        AND response_time_hours IS NOT NULL
        AND response_time_hours < 72
      GROUP BY EXTRACT(hour FROM received_at), EXTRACT(dow FROM received_at)
      ORDER BY avg_response_time ASC
      LIMIT 3
    `
    
    const recipientResult = await db.query(recipientQuery, [userId, `%${recipientEmail}%`])
    
    if (recipientResult.rows.length > 0) {
      const bestTime = recipientResult.rows[0]
      return {
        type: 'recipient_specific',
        hour: parseInt(bestTime.hour),
        dayOfWeek: parseInt(bestTime.day_of_week),
        avgResponseTime: parseFloat(bestTime.avg_response_time),
        confidence: 'high'
      }
    }

    // Fall back to general optimal times
    const generalTimes = await this.getOptimalSendTimes(userId)
    if (generalTimes.length > 0) {
      return {
        type: 'general_pattern',
        hour: generalTimes[0].hour,
        dayOfWeek: generalTimes[0].dayOfWeek,
        avgResponseTime: generalTimes[0].avgResponseTime,
        confidence: 'medium'
      }
    }

    // Default suggestion for business hours
    return {
      type: 'default',
      hour: 10, // 10 AM
      dayOfWeek: 2, // Tuesday
      avgResponseTime: null,
      confidence: 'low'
    }
  }

  // Process scheduled emails that are due
  async processScheduledEmails() {
    const query = `
      SELECT * FROM email_schedules
      WHERE status = 'scheduled' 
        AND scheduled_for <= NOW()
      ORDER BY scheduled_for ASC
      LIMIT 50
    `
    
    const result = await db.query(query)
    const dueEmails = result.rows

    for (const email of dueEmails) {
      try {
        await this.sendScheduledEmail(email)
      } catch (error) {
        console.error(`Failed to send scheduled email ${email.id}:`, error)
        await this.markEmailFailed(email.id, error.message)
      }
    }

    return dueEmails.length
  }

  // Send a scheduled email via Gmail API
  async sendScheduledEmail(scheduleData) {
    const { user_id, id, recipient_email, subject, body } = scheduleData

    // Get user's OAuth tokens
    const userQuery = `
      SELECT oauth_token_encrypted FROM integrations 
      WHERE user_id = $1 AND platform = 'google'
    `
    const userResult = await db.query(userQuery, [user_id])
    
    if (userResult.rows.length === 0) {
      throw new Error('No Google integration found for user')
    }

    const tokens = JSON.parse(userResult.rows[0].oauth_token_encrypted.toString())
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oauth2Client.setCredentials(tokens)

    const gmailApi = gmail({ version: 'v1', auth: oauth2Client })

    // Create email message
    const emailMessage = [
      `To: ${recipient_email}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      body
    ].join('\n')

    const encodedMessage = Buffer.from(emailMessage).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Send via Gmail API
    const sendResult = await gmailApi.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    })

    // Mark as sent
    await this.markEmailSent(id, sendResult.data.id)
    
    // Create analytics entry
    await this.createAnalyticsEntry(user_id, scheduleData, sendResult.data.id)

    return sendResult.data
  }

  // Mark email as sent
  async markEmailSent(scheduleId, gmailMessageId) {
    const query = `
      UPDATE email_schedules 
      SET status = 'sent', 
          updated_at = NOW(),
          last_attempt_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    
    const result = await db.query(query, [scheduleId])
    return result.rows[0]
  }

  // Mark email as failed
  async markEmailFailed(scheduleId, errorMessage) {
    const query = `
      UPDATE email_schedules 
      SET status = 'failed', 
          send_attempts = send_attempts + 1,
          error_message = $2,
          last_attempt_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    
    const result = await db.query(query, [scheduleId, errorMessage])
    return result.rows[0]
  }

  // Create analytics entry for sent email
  async createAnalyticsEntry(userId, scheduleData, gmailMessageId) {
    const query = `
      INSERT INTO email_analytics (
        user_id, recipient_email, sender_email, subject, sent_at
      ) VALUES ($1, $2, (SELECT email FROM users WHERE id = $1), $3, NOW())
      RETURNING *
    `
    
    const result = await db.query(query, [
      userId, 
      scheduleData.recipient_email, 
      scheduleData.subject
    ])
    
    return result.rows[0]
  }

  // Start background processor for scheduled emails
  startScheduleProcessor() {
    setInterval(async () => {
      try {
        const processedCount = await this.processScheduledEmails()
        if (processedCount > 0) {
          console.log(`Processed ${processedCount} scheduled emails`)
        }
      } catch (error) {
        console.error('Error processing scheduled emails:', error)
      }
    }, this.scheduleCheckInterval)

    console.log('Email scheduling processor started')
  }

  // Get scheduling analytics
  async getSchedulingAnalytics(userId, days = 30) {
    const query = `
      SELECT 
        DATE(scheduled_for) as date,
        status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) as avg_processing_hours
      FROM email_schedules
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(scheduled_for), status
      ORDER BY date DESC
    `
    
    const result = await db.query(query, [userId])
    return result.rows
  }
}

module.exports = new EmailSchedulingService()
