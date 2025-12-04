// Smart Notifications Service - Phase 2
// Manages priority-based notifications and user preferences
const db = require('../db')

class SmartNotificationsService {
  constructor() {
    this.cleanupInterval = 3600000 // Clean up old notifications every hour
    this.startCleanupProcessor()
  }

  // Get user notification preferences
  async getUserPreferences(userId) {
    const query = `
      SELECT * FROM notification_preferences 
      WHERE user_id = $1
    `
    
    const result = await db.query(query, [userId])
    
    if (result.rows.length === 0) {
      // Create default preferences if none exist
      return await this.createDefaultPreferences(userId)
    }
    
    return result.rows[0]
  }

  // Create default notification preferences
  async createDefaultPreferences(userId) {
    const query = `
      INSERT INTO notification_preferences (
        user_id, email_notifications, push_notifications, 
        priority_threshold, quiet_hours_start, quiet_hours_end,
        weekend_notifications, keyword_alerts, sender_priorities
      ) VALUES ($1, true, true, 3, '22:00', '08:00', false, '{}', '{}')
      RETURNING *
    `
    
    const result = await db.query(query, [userId])
    return result.rows[0]
  }

  // Update user notification preferences
  async updatePreferences(userId, preferences) {
    const {
      emailNotifications,
      pushNotifications,
      priorityThreshold,
      quietHoursStart,
      quietHoursEnd,
      quietHoursTimezone,
      weekendNotifications,
      keywordAlerts,
      senderPriorities
    } = preferences

    const query = `
      UPDATE notification_preferences SET
        email_notifications = COALESCE($2, email_notifications),
        push_notifications = COALESCE($3, push_notifications),
        priority_threshold = COALESCE($4, priority_threshold),
        quiet_hours_start = COALESCE($5, quiet_hours_start),
        quiet_hours_end = COALESCE($6, quiet_hours_end),
        quiet_hours_timezone = COALESCE($7, quiet_hours_timezone),
        weekend_notifications = COALESCE($8, weekend_notifications),
        keyword_alerts = COALESCE($9, keyword_alerts),
        sender_priorities = COALESCE($10, sender_priorities),
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `
    
    const result = await db.query(query, [
      userId, emailNotifications, pushNotifications, priorityThreshold,
      quietHoursStart, quietHoursEnd, quietHoursTimezone, weekendNotifications,
      keywordAlerts, senderPriorities
    ])
    
    return result.rows[0]
  }

  // Get notifications for user
  async getUserNotifications(userId, options = {}) {
    const { 
      unreadOnly = false, 
      limit = 50, 
      offset = 0,
      priorityMin = 1,
      type = null 
    } = options

    let query = `
      SELECT 
        n.*,
        m.subject as message_subject,
        m.sender as message_sender,
        m.received_at as message_received_at
      FROM notifications n
      LEFT JOIN messages m ON n.message_id = m.id
      WHERE n.user_id = $1 AND n.priority >= $4
    `
    const params = [userId, limit, offset, priorityMin]
    let paramCount = 4

    if (unreadOnly) {
      query += ` AND n.read = false`
    }

    if (type) {
      paramCount++
      query += ` AND n.type = $${paramCount}`
      params.push(type)
    }

    query += ` ORDER BY n.priority DESC, n.sent_at DESC LIMIT $2 OFFSET $3`

    const result = await db.query(query, params)
    return result.rows
  }

  // Create a notification
  async createNotification(userId, notificationData) {
    const {
      messageId = null,
      type,
      priority = 3,
      title,
      content = null
    } = notificationData

    const query = `
      INSERT INTO notifications (
        user_id, message_id, type, priority, title, content
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `
    
    const result = await db.query(query, [
      userId, messageId, type, priority, title, content
    ])
    
    return result.rows[0]
  }

  // Mark notification as read
  async markAsRead(userId, notificationId) {
    const query = `
      UPDATE notifications 
      SET read = true, read_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `
    
    const result = await db.query(query, [notificationId, userId])
    return result.rows[0]
  }

  // Mark notification as dismissed
  async dismissNotification(userId, notificationId) {
    const query = `
      UPDATE notifications 
      SET dismissed = true, dismissed_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `
    
    const result = await db.query(query, [notificationId, userId])
    return result.rows[0]
  }

  // Mark all notifications as read
  async markAllAsRead(userId) {
    const query = `
      UPDATE notifications 
      SET read = true, read_at = NOW()
      WHERE user_id = $1 AND read = false
    `
    
    const result = await db.query(query, [userId])
    return result.rowCount
  }

  // Calculate message priority based on various factors
  async calculateMessagePriority(userId, messageData) {
    const preferences = await this.getUserPreferences(userId)
    let priority = 3 // Default priority
    
    const { sender, subject, body_preview } = messageData
    
    // Check sender priority overrides
    if (preferences.sender_priorities && sender) {
      const senderKey = sender.toLowerCase()
      if (preferences.sender_priorities[senderKey]) {
        priority = Math.max(priority, preferences.sender_priorities[senderKey])
      }
    }

    // Check for keyword alerts
    if (preferences.keyword_alerts && preferences.keyword_alerts.length > 0) {
      const content = `${subject || ''} ${body_preview || ''}`.toLowerCase()
      const hasKeyword = preferences.keyword_alerts.some(keyword => 
        content.includes(keyword.toLowerCase())
      )
      
      if (hasKeyword) {
        priority = Math.max(priority, 4) // High priority for keyword matches
      }
    }

    // Check for urgency indicators in subject/content
    const urgencyKeywords = [
      'urgent', 'asap', 'immediate', 'emergency', 'critical', 
      'deadline', 'rush', 'priority', 'important'
    ]
    
    const subjectLower = (subject || '').toLowerCase()
    const hasUrgency = urgencyKeywords.some(keyword => subjectLower.includes(keyword))
    
    if (hasUrgency) {
      priority = Math.max(priority, 4)
    }

    // Check if from known important domains
    const importantDomains = [
      'ceo@', 'president@', 'director@', 'manager@', 
      '@apple.com', '@google.com', '@microsoft.com'
    ]
    
    const hasImportantDomain = importantDomains.some(domain => 
      sender && sender.toLowerCase().includes(domain)
    )
    
    if (hasImportantDomain) {
      priority = Math.max(priority, 4)
    }

    return Math.min(5, priority) // Cap at maximum priority
  }

  // Check if notification should be sent based on user preferences
  async shouldSendNotification(userId, priority, type = 'new_email') {
    const preferences = await this.getUserPreferences(userId)
    
    // Check if notifications are enabled
    if (!preferences.email_notifications && !preferences.push_notifications) {
      return false
    }

    // Check priority threshold
    if (priority < preferences.priority_threshold) {
      return false
    }

    // Check quiet hours
    const now = new Date()
    const currentHour = now.getHours()
    const quietStart = parseInt(preferences.quiet_hours_start.split(':')[0])
    const quietEnd = parseInt(preferences.quiet_hours_end.split(':')[0])
    
    const isQuietTime = (quietStart > quietEnd) 
      ? (currentHour >= quietStart || currentHour < quietEnd)
      : (currentHour >= quietStart && currentHour < quietEnd)
    
    if (isQuietTime && priority < 4) {
      return false // Only high priority during quiet hours
    }

    // Check weekend preferences
    const isWeekend = now.getDay() === 0 || now.getDay() === 6
    if (isWeekend && !preferences.weekend_notifications && priority < 4) {
      return false
    }

    return true
  }

  // Get notification statistics
  async getNotificationStats(userId, days = 30) {
    const query = `
      SELECT 
        type,
        priority,
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE read = true) as read_count,
        COUNT(*) FILTER (WHERE dismissed = true) as dismissed_count,
        AVG(EXTRACT(EPOCH FROM (read_at - sent_at))/60) as avg_read_time_minutes
      FROM notifications
      WHERE user_id = $1 
        AND sent_at >= NOW() - INTERVAL '${days} days'
      GROUP BY type, priority
      ORDER BY priority DESC, total_count DESC
    `
    
    const result = await db.query(query, [userId])
    return result.rows
  }

  // Create follow-up reminder notifications
  async createFollowUpReminders(userId) {
    const query = `
      SELECT m.*, ea.sent_at
      FROM messages m
      LEFT JOIN email_analytics ea ON m.id = ea.message_id
      WHERE m.user_id = $1 
        AND m.actioned = true 
        AND m.action_type = 'reply'
        AND ea.sent_at IS NOT NULL
        AND ea.replied_at IS NULL
        AND ea.sent_at < NOW() - INTERVAL '3 days'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n 
          WHERE n.message_id = m.id AND n.type = 'follow_up'
        )
      LIMIT 10
    `
    
    const result = await db.query(query, [userId])
    const followUps = []
    
    for (const message of result.rows) {
      const notification = await this.createNotification(userId, {
        messageId: message.id,
        type: 'follow_up',
        priority: 3,
        title: 'Follow-up Reminder',
        content: `No reply received for: ${message.subject || 'No Subject'}`
      })
      followUps.push(notification)
    }
    
    return followUps
  }

  // Clean up old notifications
  async cleanupOldNotifications() {
    // Delete read notifications older than 30 days
    const deleteOldRead = `
      DELETE FROM notifications 
      WHERE read = true 
        AND read_at < NOW() - INTERVAL '30 days'
    `
    
    // Delete dismissed notifications older than 7 days  
    const deleteOldDismissed = `
      DELETE FROM notifications
      WHERE dismissed = true
        AND dismissed_at < NOW() - INTERVAL '7 days'
    `
    
    const readResult = await db.query(deleteOldRead)
    const dismissedResult = await db.query(deleteOldDismissed)
    
    return {
      deletedRead: readResult.rowCount,
      deletedDismissed: dismissedResult.rowCount
    }
  }

  // Start background cleanup processor
  startCleanupProcessor() {
    setInterval(async () => {
      try {
        const results = await this.cleanupOldNotifications()
        if (results.deletedRead > 0 || results.deletedDismissed > 0) {
          console.log(`Cleaned up ${results.deletedRead} read and ${results.deletedDismissed} dismissed notifications`)
        }
      } catch (error) {
        console.error('Error cleaning up notifications:', error)
      }
    }, this.cleanupInterval)

    console.log('Notifications cleanup processor started')
  }
}

module.exports = new SmartNotificationsService()
