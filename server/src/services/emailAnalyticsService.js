// Email Analytics Service - Phase 2
// Tracks email engagement metrics and productivity insights
const db = require('../db')

class EmailAnalyticsService {
  constructor() {
    this.dailyStatsInterval = 3600000 // Update daily stats every hour
    this.startDailyStatsProcessor()
  }

  // Create analytics entry for sent email
  async createAnalyticsEntry(userId, emailData) {
    const {
      messageId = null,
      recipientEmail,
      senderEmail,
      subject,
      sentAt = new Date()
    } = emailData

    const query = `
      INSERT INTO email_analytics (
        user_id, message_id, recipient_email, sender_email, 
        subject, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `
    
    const result = await db.query(query, [
      userId, messageId, recipientEmail, senderEmail, subject, sentAt
    ])
    
    return result.rows[0]
  }

  // Update analytics when email is opened
  async trackEmailOpen(analyticsId, openedAt = new Date()) {
    const query = `
      UPDATE email_analytics 
      SET opened_at = $2, 
          engagement_score = calculate_engagement_score(true, replied_at IS NOT NULL, clicked_at IS NOT NULL, response_time_hours),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    
    const result = await db.query(query, [analyticsId, openedAt])
    return result.rows[0]
  }

  // Update analytics when email is replied to
  async trackEmailReply(analyticsId, repliedAt = new Date()) {
    const query = `
      UPDATE email_analytics 
      SET replied_at = $2,
          response_time_hours = EXTRACT(EPOCH FROM ($2 - sent_at))/3600,
          engagement_score = calculate_engagement_score(opened_at IS NOT NULL, true, clicked_at IS NOT NULL, EXTRACT(EPOCH FROM ($2 - sent_at))/3600),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    
    const result = await db.query(query, [analyticsId, repliedAt])
    return result.rows[0]
  }

  // Update analytics when link is clicked
  async trackEmailClick(analyticsId, clickedAt = new Date()) {
    const query = `
      UPDATE email_analytics 
      SET clicked_at = $2,
          engagement_score = calculate_engagement_score(opened_at IS NOT NULL, replied_at IS NOT NULL, true, response_time_hours),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    
    const result = await db.query(query, [analyticsId, clickedAt])
    return result.rows[0]
  }

  // Get analytics for user's sent emails
  async getUserAnalytics(userId, options = {}) {
    const {
      days = 30,
      recipientEmail = null,
      includeAggregates = true
    } = options

    let query = `
      SELECT 
        ea.*,
        m.subject as message_subject,
        m.received_at as message_received_at
      FROM email_analytics ea
      LEFT JOIN messages m ON ea.message_id = m.id
      WHERE ea.user_id = $1 
        AND ea.sent_at >= NOW() - INTERVAL '${days} days'
    `
    const params = [userId]

    if (recipientEmail) {
      query += ` AND ea.recipient_email ILIKE $2`
      params.push(`%${recipientEmail}%`)
    }

    query += ` ORDER BY ea.sent_at DESC`

    const result = await db.query(query, params)
    
    if (!includeAggregates) {
      return result.rows
    }

    // Calculate aggregates
    const aggregates = await this.calculateAnalyticsAggregates(userId, days)
    
    return {
      analytics: result.rows,
      aggregates
    }
  }

  // Calculate aggregate analytics metrics
  async calculateAnalyticsAggregates(userId, days = 30) {
    const query = `
      SELECT 
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as total_opened,
        COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as total_replied,
        COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as total_clicked,
        COUNT(*) FILTER (WHERE bounced_at IS NOT NULL) as total_bounced,
        ROUND(AVG(response_time_hours), 2) as avg_response_time_hours,
        ROUND(AVG(engagement_score), 2) as avg_engagement_score,
        ROUND(
          (COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::DECIMAL / 
           NULLIF(COUNT(*), 0)) * 100, 2
        ) as open_rate_percent,
        ROUND(
          (COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::DECIMAL / 
           NULLIF(COUNT(*), 0)) * 100, 2
        ) as reply_rate_percent,
        ROUND(
          (COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::DECIMAL / 
           NULLIF(COUNT(*), 0)) * 100, 2
        ) as click_rate_percent
      FROM email_analytics
      WHERE user_id = $1 
        AND sent_at >= NOW() - INTERVAL '${days} days'
    `
    
    const result = await db.query(query, [userId])
    return result.rows[0]
  }

  // Get top recipients by engagement
  async getTopRecipients(userId, days = 30, limit = 10) {
    const query = `
      SELECT 
        recipient_email,
        COUNT(*) as emails_sent,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as emails_opened,
        COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as emails_replied,
        ROUND(AVG(engagement_score), 2) as avg_engagement_score,
        ROUND(AVG(response_time_hours), 2) as avg_response_time_hours,
        ROUND(
          (COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::DECIMAL / 
           NULLIF(COUNT(*), 0)) * 100, 2
        ) as reply_rate_percent
      FROM email_analytics
      WHERE user_id = $1 
        AND sent_at >= NOW() - INTERVAL '${days} days'
      GROUP BY recipient_email
      HAVING COUNT(*) >= 2 -- At least 2 emails
      ORDER BY avg_engagement_score DESC, reply_rate_percent DESC
      LIMIT $2
    `
    
    const result = await db.query(query, [userId, limit])
    return result.rows
  }

  // Get engagement trends over time
  async getEngagementTrends(userId, days = 30) {
    const query = `
      SELECT 
        DATE(sent_at) as date,
        COUNT(*) as emails_sent,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as emails_opened,
        COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as emails_replied,
        ROUND(AVG(engagement_score), 2) as avg_engagement_score,
        ROUND(AVG(response_time_hours), 2) as avg_response_time_hours
      FROM email_analytics
      WHERE user_id = $1 
        AND sent_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(sent_at)
      ORDER BY date DESC
    `
    
    const result = await db.query(query, [userId])
    return result.rows
  }

  // Get optimal send time analysis
  async getOptimalSendTimeAnalysis(userId, days = 90) {
    const query = `
      SELECT 
        EXTRACT(hour FROM sent_at) as hour,
        EXTRACT(dow FROM sent_at) as day_of_week,
        COUNT(*) as emails_sent,
        ROUND(AVG(engagement_score), 2) as avg_engagement_score,
        ROUND(AVG(response_time_hours), 2) as avg_response_time_hours,
        ROUND(
          (COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::DECIMAL / 
           NULLIF(COUNT(*), 0)) * 100, 2
        ) as reply_rate_percent
      FROM email_analytics
      WHERE user_id = $1 
        AND sent_at >= NOW() - INTERVAL '${days} days'
        AND replied_at IS NOT NULL
      GROUP BY EXTRACT(hour FROM sent_at), EXTRACT(dow FROM sent_at)
      HAVING COUNT(*) >= 3 -- At least 3 emails
      ORDER BY avg_engagement_score DESC, reply_rate_percent DESC
    `
    
    const result = await db.query(query, [userId])
    
    // Process results to create recommendations
    const recommendations = result.rows.slice(0, 5).map(row => ({
      hour: parseInt(row.hour),
      dayOfWeek: parseInt(row.day_of_week),
      dayName: this.getDayName(parseInt(row.day_of_week)),
      emailsSent: parseInt(row.emails_sent),
      avgEngagementScore: parseFloat(row.avg_engagement_score),
      avgResponseTime: parseFloat(row.avg_response_time_hours),
      replyRate: parseFloat(row.reply_rate_percent)
    }))

    return {
      raw: result.rows,
      recommendations
    }
  }

  // Get daily email statistics
  async getDailyStats(userId, startDate, endDate = null) {
    if (!endDate) {
      endDate = new Date()
    }

    const query = `
      SELECT * FROM daily_email_stats
      WHERE user_id = $1 
        AND stat_date >= $2 
        AND stat_date <= $3
      ORDER BY stat_date DESC
    `
    
    const result = await db.query(query, [userId, startDate, endDate])
    return result.rows
  }

  // Update daily statistics for a specific date
  async updateDailyStats(userId, date = new Date()) {
    const statDate = date instanceof Date ? date.toISOString().split('T')[0] : date

    // Calculate sent emails
    const sentQuery = `
      SELECT COUNT(*) as count FROM email_analytics
      WHERE user_id = $1 AND DATE(sent_at) = $2
    `
    const sentResult = await db.query(sentQuery, [userId, statDate])
    const emailsSent = parseInt(sentResult.rows[0].count)

    // Calculate received emails
    const receivedQuery = `
      SELECT COUNT(*) as count FROM messages
      WHERE user_id = $1 AND DATE(received_at) = $2
    `
    const receivedResult = await db.query(receivedQuery, [userId, statDate])
    const emailsReceived = parseInt(receivedResult.rows[0].count)

    // Calculate replied emails
    const repliedQuery = `
      SELECT COUNT(*) as count FROM messages
      WHERE user_id = $1 AND DATE(received_at) = $2 AND actioned = true AND action_type = 'reply'
    `
    const repliedResult = await db.query(repliedQuery, [userId, statDate])
    const emailsReplied = parseInt(repliedResult.rows[0].count)

    // Calculate read emails
    const readQuery = `
      SELECT COUNT(*) as count FROM messages
      WHERE user_id = $1 AND DATE(received_at) = $2 AND read_status = true
    `
    const readResult = await db.query(readQuery, [userId, statDate])
    const emailsRead = parseInt(readResult.rows[0].count)

    // Calculate average response time
    const responseTimeQuery = `
      SELECT AVG(response_time_hours) as avg_time FROM email_analytics
      WHERE user_id = $1 AND DATE(sent_at) = $2 AND response_time_hours IS NOT NULL
    `
    const responseTimeResult = await db.query(responseTimeQuery, [userId, statDate])
    const avgResponseTime = parseFloat(responseTimeResult.rows[0].avg_time) || 0

    // Calculate engagement and productivity scores
    const engagementScore = this.calculateEngagementScore(emailsSent, emailsReceived, emailsReplied, avgResponseTime)
    const productivityScore = this.calculateProductivityScore(emailsSent, emailsReceived, emailsReplied, emailsRead)

    // Upsert daily stats
    const upsertQuery = `
      INSERT INTO daily_email_stats (
        user_id, stat_date, emails_sent, emails_received, emails_replied, 
        emails_read, avg_response_time_hours, engagement_score, productivity_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id, stat_date) DO UPDATE SET
        emails_sent = EXCLUDED.emails_sent,
        emails_received = EXCLUDED.emails_received,
        emails_replied = EXCLUDED.emails_replied,
        emails_read = EXCLUDED.emails_read,
        avg_response_time_hours = EXCLUDED.avg_response_time_hours,
        engagement_score = EXCLUDED.engagement_score,
        productivity_score = EXCLUDED.productivity_score,
        updated_at = NOW()
      RETURNING *
    `
    
    const result = await db.query(upsertQuery, [
      userId, statDate, emailsSent, emailsReceived, emailsReplied,
      emailsRead, avgResponseTime, engagementScore, productivityScore
    ])
    
    return result.rows[0]
  }

  // Calculate engagement score (0-10)
  calculateEngagementScore(sent, received, replied, avgResponseTime) {
    if (sent === 0) return 0
    
    const replyRate = replied / Math.max(1, received)
    const responseSpeed = avgResponseTime > 0 ? Math.max(0, 5 - (avgResponseTime / 24)) : 2.5
    
    return Math.min(10, (replyRate * 5) + responseSpeed)
  }

  // Calculate productivity score (0-10)
  calculateProductivityScore(sent, received, replied, read) {
    if (received === 0) return 5 // Neutral score if no emails
    
    const readRate = read / received
    const replyRate = replied / received
    const balanceScore = Math.max(0, 5 - Math.abs(sent - received) / 10) // Penalty for extreme imbalance
    
    return Math.min(10, (readRate * 3) + (replyRate * 4) + balanceScore)
  }

  // Get day name from day of week number
  getDayName(dayOfWeek) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return days[dayOfWeek] || 'Unknown'
  }

  // Process daily stats for all users
  async processDailyStatsForAllUsers(date = new Date()) {
    const usersQuery = `SELECT DISTINCT user_id FROM messages WHERE received_at >= $1 - INTERVAL '1 day'`
    const usersResult = await db.query(usersQuery, [date])
    
    let processed = 0
    for (const user of usersResult.rows) {
      try {
        await this.updateDailyStats(user.user_id, date)
        processed++
      } catch (error) {
        console.error(`Error updating daily stats for user ${user.user_id}:`, error)
      }
    }
    
    return processed
  }

  // Start background processor for daily stats
  startDailyStatsProcessor() {
    setInterval(async () => {
      try {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        
        const processed = await this.processDailyStatsForAllUsers(yesterday)
        if (processed > 0) {
          console.log(`Updated daily stats for ${processed} users`)
        }
      } catch (error) {
        console.error('Error processing daily stats:', error)
      }
    }, this.dailyStatsInterval)

    console.log('Email analytics daily stats processor started')
  }

  // Get comprehensive productivity insights
  async getProductivityInsights(userId, days = 30) {
    const analytics = await this.getUserAnalytics(userId, { days, includeAggregates: true })
    const trends = await this.getEngagementTrends(userId, days)
    const optimalTimes = await this.getOptimalSendTimeAnalysis(userId, days * 3)
    const topRecipients = await this.getTopRecipients(userId, days)
    const dailyStats = await this.getDailyStats(userId, new Date(Date.now() - days * 24 * 60 * 60 * 1000))

    return {
      summary: analytics.aggregates,
      trends,
      optimalTimes: optimalTimes.recommendations,
      topRecipients,
      dailyStats,
      insights: this.generateInsights(analytics.aggregates, trends, optimalTimes.recommendations)
    }
  }

  // Generate AI-powered insights from analytics data
  generateInsights(aggregates, trends, optimalTimes) {
    const insights = []

    // Response time insights
    if (aggregates.avg_response_time_hours > 48) {
      insights.push({
        type: 'response_time',
        severity: 'warning',
        message: `Your average response time is ${aggregates.avg_response_time_hours}h. Consider setting up email scheduling to respond faster.`
      })
    }

    // Engagement insights
    if (aggregates.reply_rate_percent < 20) {
      insights.push({
        type: 'engagement',
        severity: 'info',
        message: `Your reply rate is ${aggregates.reply_rate_percent}%. Try using email templates for more consistent communication.`
      })
    }

    // Optimal timing insights
    if (optimalTimes.length > 0) {
      const bestTime = optimalTimes[0]
      insights.push({
        type: 'timing',
        severity: 'success',
        message: `Your best engagement is on ${bestTime.dayName} at ${bestTime.hour}:00. Consider scheduling important emails for this time.`
      })
    }

    // Trend insights
    if (trends.length >= 7) {
      const recentTrend = trends.slice(0, 7)
      const avgRecent = recentTrend.reduce((acc, day) => acc + (day.avg_engagement_score || 0), 0) / 7
      const olderTrend = trends.slice(7, 14)
      const avgOlder = olderTrend.reduce((acc, day) => acc + (day.avg_engagement_score || 0), 0) / Math.max(1, olderTrend.length)
      
      if (avgRecent > avgOlder * 1.1) {
        insights.push({
          type: 'trend',
          severity: 'success',
          message: 'Your email engagement has been improving recently. Keep up the good work!'
        })
      } else if (avgRecent < avgOlder * 0.9) {
        insights.push({
          type: 'trend',
          severity: 'warning',
          message: 'Your email engagement has been declining. Consider reviewing your email strategies.'
        })
      }
    }

    return insights
  }
}

module.exports = new EmailAnalyticsService()
