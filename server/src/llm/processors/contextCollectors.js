/**
 * Context collection functions for gathering user data and application state
 */

const integrationUtils = require('../../utils/integrations');

/**
 * Collect user context from database and integrations
 */
async function collectUserContext(db, userId) {
  try {
    // Get user basic info
    const userRes = await db.query(
      'SELECT email, display_name, timezone, last_gmail_poll FROM users WHERE id = $1',
      [userId]
    );
    
    if (userRes.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userRes.rows[0];

    // Get user integrations using centralized utility
    const integrations = await integrationUtils.getUserIntegrations(userId, null, true);

    // Get pending messages count
    const pendingRes = await db.query(
      'SELECT COUNT(*) as count FROM messages WHERE user_id = $1 AND action_required = true AND actioned = false',
      [userId]
    );

    // Get recent activity
    const activityRes = await db.query(
      `SELECT created_at FROM message_actions 
       WHERE user_id = $1 AND acted = true 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    // Get LLM settings
    const settingsRes = await db.query(
      'SELECT llm_model FROM user_settings WHERE user_id = $1',
      [userId]
    );

    return {
      user: {
        id: userId,
        email: user.email,
        displayName: user.display_name,
        timezone: user.timezone || 'America/New_York',
        lastGmailPoll: user.last_gmail_poll
      },
      integrations: integrations.map(integration => ({
        platform: integration.platform,
        accountId: integration.external_account_id
      })),
      activity: {
        pendingEmails: parseInt(pendingRes.rows[0].count),
        lastActivity: activityRes.rows[0]?.created_at,
        lastPoll: user.last_gmail_poll
      },
      settings: {
        llmModel: settingsRes.rows[0]?.llm_model || 'gpt-4o-mini'
      }
    };
  } catch (error) {
    console.error('collectUserContext error:', error);
    throw error;
  }
}

/**
 * Collect message context for processing
 */
async function collectMessageContext(db, userId, messageId = null) {
  try {
    let query, params;

    if (messageId) {
      // Get specific message
      query = `
        SELECT m.*, ma.suggested_actions, ma.acted
        FROM messages m
        LEFT JOIN message_actions ma ON m.id = ma.message_id
        WHERE m.user_id = $1 AND m.id = $2
      `;
      params = [userId, messageId];
    } else {
      // Get recent messages requiring action
      query = `
        SELECT m.*, ma.suggested_actions, ma.acted
        FROM messages m
        LEFT JOIN message_actions ma ON m.id = ma.message_id
        WHERE m.user_id = $1 AND m.action_required = true AND m.actioned = false
        ORDER BY m.received_at DESC
        LIMIT 10
      `;
      params = [userId];
    }

    const result = await db.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      platform: row.platform,
      externalId: row.external_message_id,
      sender: row.sender,
      subject: row.subject,
      bodyPlain: row.body_plain,
      receivedAt: row.received_at,
      actionRequired: row.action_required,
      actioned: row.actioned,
      suggestedActions: row.suggested_actions,
      hasActions: row.acted || false
    }));
  } catch (error) {
    console.error('collectMessageContext error:', error);
    throw error;
  }
}

/**
 * Collect calendar context
 */
async function collectCalendarContext(googleAuth, userTimezone = 'America/New_York') {
  try {
    const { google } = require('googleapis');
    const calendar = google.calendar({ version: 'v3', auth: googleAuth });

    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString(); // Next 7 days

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: userTimezone
    });

    const events = response.data.items || [];
    
    return {
      upcomingEvents: events.length,
      nextEvent: events[0] ? {
        title: events[0].summary,
        start: events[0].start.dateTime || events[0].start.date,
        end: events[0].end.dateTime || events[0].end.date
      } : null,
      events: events.map(event => ({
        id: event.id,
        title: event.summary,
        description: event.description,
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        location: event.location
      }))
    };
  } catch (error) {
    console.error('collectCalendarContext error:', error);
    return {
      upcomingEvents: 0,
      nextEvent: null,
      events: []
    };
  }
}

/**
 * Collect application state for context-aware processing
 */
async function collectAppContext(db, userId) {
  try {
    // Get system statistics
    const statsRes = await db.query(`
      SELECT 
        COUNT(CASE WHEN m.action_required = true AND m.actioned = false THEN 1 END) as pending_actions,
        COUNT(CASE WHEN ma.acted = true AND ma.created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_actions,
        COUNT(CASE WHEN m.received_at > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_messages
      FROM messages m
      LEFT JOIN message_actions ma ON m.id = ma.message_id
      WHERE m.user_id = $1
    `, [userId]);

    const stats = statsRes.rows[0] || {};

    // Get processing history
    const historyRes = await db.query(`
      SELECT processor_type, COUNT(*) as usage_count
      FROM (
        SELECT 'email' as processor_type FROM message_actions WHERE user_id = $1
        UNION ALL
        SELECT 'meeting' as processor_type FROM message_actions 
        WHERE user_id = $1 AND suggested_actions::text ILIKE '%create_event%'
      ) as processor_usage
      GROUP BY processor_type
    `, [userId]);

    return {
      stats: {
        pendingActions: parseInt(stats.pending_actions || 0),
        recentActions: parseInt(stats.recent_actions || 0),
        recentMessages: parseInt(stats.recent_messages || 0)
      },
      processorUsage: historyRes.rows.reduce((acc, row) => {
        acc[row.processor_type] = parseInt(row.usage_count);
        return acc;
      }, {}),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('collectAppContext error:', error);
    return {
      stats: { pendingActions: 0, recentActions: 0, recentMessages: 0 },
      processorUsage: {},
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get comprehensive context for LLM processing
 */
async function getComprehensiveContext(db, userId, options = {}) {
  try {
    const { includeCalendar = false, googleAuth = null, messageId = null } = options;

    const [userContext, messageContext, appContext] = await Promise.all([
      collectUserContext(db, userId),
      collectMessageContext(db, userId, messageId),
      collectAppContext(db, userId)
    ]);

    const context = {
      user: userContext.user,
      integrations: userContext.integrations,
      activity: userContext.activity,
      settings: userContext.settings,
      messages: messageContext,
      app: appContext
    };

    // Add calendar context if requested and auth available
    if (includeCalendar && googleAuth) {
      context.calendar = await collectCalendarContext(googleAuth, userContext.user.timezone);
    }

    return context;
  } catch (error) {
    console.error('getComprehensiveContext error:', error);
    throw error;
  }
}

module.exports = {
  collectUserContext,
  collectMessageContext,
  collectCalendarContext,
  collectAppContext,
  getComprehensiveContext
};
