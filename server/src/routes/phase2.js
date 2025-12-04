// Phase 2 API Routes - Email Scheduling, Smart Notifications, Analytics
const express = require('express')
const router = express.Router()
const emailSchedulingService = require('../services/emailSchedulingService')
const smartNotificationsService = require('../services/smartNotificationsService')
const emailAnalyticsService = require('../services/emailAnalyticsService')

// Middleware to ensure user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}

// === EMAIL SCHEDULING ROUTES ===

// Schedule an email
router.post('/schedule', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { recipientEmail, subject, body, scheduledFor, timezone, messageId } = req.body

    if (!recipientEmail || !subject || !body || !scheduledFor) {
      return res.status(400).json({ 
        error: 'Missing required fields: recipientEmail, subject, body, scheduledFor' 
      })
    }

    const scheduledEmail = await emailSchedulingService.scheduleEmail(userId, {
      recipientEmail,
      subject,
      body,
      scheduledFor,
      timezone,
      messageId
    })

    res.json({ 
      success: true, 
      schedule: scheduledEmail,
      message: 'Email scheduled successfully'
    })
  } catch (error) {
    console.error('Error scheduling email:', error)
    res.status(500).json({ error: 'Failed to schedule email' })
  }
})

// Get user's scheduled emails
router.get('/schedule', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { status } = req.query

    const scheduledEmails = await emailSchedulingService.getUserScheduledEmails(userId, status)

    res.json({ 
      success: true, 
      schedules: scheduledEmails 
    })
  } catch (error) {
    console.error('Error fetching scheduled emails:', error)
    res.status(500).json({ error: 'Failed to fetch scheduled emails' })
  }
})

// Cancel a scheduled email
router.delete('/schedule/:scheduleId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { scheduleId } = req.params

    const cancelled = await emailSchedulingService.cancelScheduledEmail(userId, scheduleId)
    
    if (!cancelled) {
      return res.status(404).json({ error: 'Scheduled email not found or already processed' })
    }

    res.json({ 
      success: true, 
      message: 'Email schedule cancelled',
      schedule: cancelled
    })
  } catch (error) {
    console.error('Error cancelling scheduled email:', error)
    res.status(500).json({ error: 'Failed to cancel scheduled email' })
  }
})

// Get optimal send times
router.get('/optimal-times', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { recipientEmail } = req.query

    if (recipientEmail) {
      const suggestion = await emailSchedulingService.suggestOptimalSendTime(userId, recipientEmail)
      res.json({ success: true, suggestion })
    } else {
      const optimalTimes = await emailSchedulingService.getOptimalSendTimes(userId)
      res.json({ success: true, optimalTimes })
    }
  } catch (error) {
    console.error('Error getting optimal times:', error)
    res.status(500).json({ error: 'Failed to get optimal send times' })
  }
})

// Get scheduling analytics
router.get('/schedule/analytics', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { days = 30 } = req.query

    const analytics = await emailSchedulingService.getSchedulingAnalytics(userId, parseInt(days))

    res.json({ 
      success: true, 
      analytics 
    })
  } catch (error) {
    console.error('Error getting scheduling analytics:', error)
    res.status(500).json({ error: 'Failed to get scheduling analytics' })
  }
})

// === SMART NOTIFICATIONS ROUTES ===

// Get user notifications
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { 
      unreadOnly = false, 
      limit = 50, 
      offset = 0, 
      priorityMin = 1,
      type 
    } = req.query

    const notifications = await smartNotificationsService.getUserNotifications(userId, {
      unreadOnly: unreadOnly === 'true',
      limit: parseInt(limit),
      offset: parseInt(offset),
      priorityMin: parseInt(priorityMin),
      type
    })

    res.json({ 
      success: true, 
      notifications 
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// Mark notification as read
router.put('/notifications/:notificationId/read', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { notificationId } = req.params

    const notification = await smartNotificationsService.markAsRead(userId, notificationId)
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    res.json({ 
      success: true, 
      notification,
      message: 'Notification marked as read'
    })
  } catch (error) {
    console.error('Error marking notification as read:', error)
    res.status(500).json({ error: 'Failed to mark notification as read' })
  }
})

// Dismiss notification
router.put('/notifications/:notificationId/dismiss', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { notificationId } = req.params

    const notification = await smartNotificationsService.dismissNotification(userId, notificationId)
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    res.json({ 
      success: true, 
      notification,
      message: 'Notification dismissed'
    })
  } catch (error) {
    console.error('Error dismissing notification:', error)
    res.status(500).json({ error: 'Failed to dismiss notification' })
  }
})

// Mark all notifications as read
router.put('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId

    const count = await smartNotificationsService.markAllAsRead(userId)

    res.json({ 
      success: true, 
      message: `Marked ${count} notifications as read`,
      count
    })
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    res.status(500).json({ error: 'Failed to mark all notifications as read' })
  }
})

// Get notification preferences
router.get('/notifications/preferences', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId

    const preferences = await smartNotificationsService.getUserPreferences(userId)

    res.json({ 
      success: true, 
      preferences 
    })
  } catch (error) {
    console.error('Error fetching notification preferences:', error)
    res.status(500).json({ error: 'Failed to fetch notification preferences' })
  }
})

// Update notification preferences
router.put('/notifications/preferences', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const preferences = req.body

    const updated = await smartNotificationsService.updatePreferences(userId, preferences)

    res.json({ 
      success: true, 
      preferences: updated,
      message: 'Notification preferences updated'
    })
  } catch (error) {
    console.error('Error updating notification preferences:', error)
    res.status(500).json({ error: 'Failed to update notification preferences' })
  }
})

// Create manual notification (for testing or admin use)
router.post('/notifications', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { messageId, type, priority, title, content } = req.body

    if (!type || !title) {
      return res.status(400).json({ error: 'Missing required fields: type, title' })
    }

    const notification = await smartNotificationsService.createNotification(userId, {
      messageId,
      type,
      priority,
      title,
      content
    })

    res.json({ 
      success: true, 
      notification,
      message: 'Notification created'
    })
  } catch (error) {
    console.error('Error creating notification:', error)
    res.status(500).json({ error: 'Failed to create notification' })
  }
})

// Get notification statistics
router.get('/notifications/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { days = 30 } = req.query

    const stats = await smartNotificationsService.getNotificationStats(userId, parseInt(days))

    res.json({ 
      success: true, 
      stats 
    })
  } catch (error) {
    console.error('Error fetching notification stats:', error)
    res.status(500).json({ error: 'Failed to fetch notification stats' })
  }
})

// === EMAIL ANALYTICS ROUTES ===

// Get user's email analytics
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { days = 30, recipientEmail, includeAggregates = true } = req.query

    const analytics = await emailAnalyticsService.getUserAnalytics(userId, {
      days: parseInt(days),
      recipientEmail,
      includeAggregates: includeAggregates === 'true'
    })

    res.json({ 
      success: true, 
      analytics 
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})

// Get engagement trends
router.get('/analytics/trends', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { days = 30 } = req.query

    const trends = await emailAnalyticsService.getEngagementTrends(userId, parseInt(days))

    res.json({ 
      success: true, 
      trends 
    })
  } catch (error) {
    console.error('Error fetching engagement trends:', error)
    res.status(500).json({ error: 'Failed to fetch engagement trends' })
  }
})

// Get top recipients by engagement
router.get('/analytics/top-recipients', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { days = 30, limit = 10 } = req.query

    const recipients = await emailAnalyticsService.getTopRecipients(userId, parseInt(days), parseInt(limit))

    res.json({ 
      success: true, 
      recipients 
    })
  } catch (error) {
    console.error('Error fetching top recipients:', error)
    res.status(500).json({ error: 'Failed to fetch top recipients' })
  }
})

// Get optimal send time analysis
router.get('/analytics/optimal-times', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { days = 90 } = req.query

    const analysis = await emailAnalyticsService.getOptimalSendTimeAnalysis(userId, parseInt(days))

    res.json({ 
      success: true, 
      analysis 
    })
  } catch (error) {
    console.error('Error fetching optimal time analysis:', error)
    res.status(500).json({ error: 'Failed to fetch optimal time analysis' })
  }
})

// Get daily statistics
router.get('/analytics/daily-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { startDate, endDate } = req.query

    if (!startDate) {
      return res.status(400).json({ error: 'startDate is required' })
    }

    const stats = await emailAnalyticsService.getDailyStats(
      userId, 
      new Date(startDate), 
      endDate ? new Date(endDate) : null
    )

    res.json({ 
      success: true, 
      stats 
    })
  } catch (error) {
    console.error('Error fetching daily stats:', error)
    res.status(500).json({ error: 'Failed to fetch daily stats' })
  }
})

// Get comprehensive productivity insights
router.get('/analytics/insights', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { days = 30 } = req.query

    const insights = await emailAnalyticsService.getProductivityInsights(userId, parseInt(days))

    res.json({ 
      success: true, 
      insights 
    })
  } catch (error) {
    console.error('Error fetching productivity insights:', error)
    res.status(500).json({ error: 'Failed to fetch productivity insights' })
  }
})

// Update analytics manually (for testing)
router.post('/analytics/track-open/:analyticsId', requireAuth, async (req, res) => {
  try {
    const { analyticsId } = req.params

    const updated = await emailAnalyticsService.trackEmailOpen(analyticsId)

    res.json({ 
      success: true, 
      analytics: updated,
      message: 'Email open tracked'
    })
  } catch (error) {
    console.error('Error tracking email open:', error)
    res.status(500).json({ error: 'Failed to track email open' })
  }
})

router.post('/analytics/track-reply/:analyticsId', requireAuth, async (req, res) => {
  try {
    const { analyticsId } = req.params

    const updated = await emailAnalyticsService.trackEmailReply(analyticsId)

    res.json({ 
      success: true, 
      analytics: updated,
      message: 'Email reply tracked'
    })
  } catch (error) {
    console.error('Error tracking email reply:', error)
    res.status(500).json({ error: 'Failed to track email reply' })
  }
})

// Force update daily stats (admin/testing)
router.post('/analytics/update-daily-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId
    const { date } = req.body

    const stats = await emailAnalyticsService.updateDailyStats(
      userId, 
      date ? new Date(date) : new Date()
    )

    res.json({ 
      success: true, 
      stats,
      message: 'Daily stats updated'
    })
  } catch (error) {
    console.error('Error updating daily stats:', error)
    res.status(500).json({ error: 'Failed to update daily stats' })
  }
})

module.exports = router
