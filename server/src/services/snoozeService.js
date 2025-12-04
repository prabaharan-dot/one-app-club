const db = require('../db')

/**
 * Email Snooze Service
 * Handles email snoozing and follow-up reminders
 */

// Snooze an email until a specific date/time
async function snoozeEmail(messageId, userId, snoozeUntil) {
  try {
    const result = await db.query(`
      UPDATE messages 
      SET is_snoozed = true, 
          snoozed_until = $1, 
          snooze_count = snooze_count + 1,
          updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING id, subject, snoozed_until
    `, [snoozeUntil, messageId, userId])
    
    if (result.rowCount === 0) {
      throw new Error('Message not found or permission denied')
    }
    
    return result.rows[0]
  } catch (error) {
    console.error('Error snoozing email:', error)
    throw error
  }
}

// Unsnooze an email (bring it back immediately)
async function unsnoozeEmail(messageId, userId) {
  try {
    const result = await db.query(`
      UPDATE messages 
      SET is_snoozed = false, 
          snoozed_until = NULL,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, subject
    `, [messageId, userId])
    
    if (result.rowCount === 0) {
      throw new Error('Message not found or permission denied')
    }
    
    return result.rows[0]
  } catch (error) {
    console.error('Error unsnoozing email:', error)
    throw error
  }
}

// Get snoozed emails for a user
async function getSnoozedEmails(userId) {
  try {
    const result = await db.query(`
      SELECT id, sender, subject, snoozed_until, snooze_count, received_at
      FROM messages 
      WHERE user_id = $1 AND is_snoozed = true
      ORDER BY snoozed_until ASC
    `, [userId])
    
    return result.rows
  } catch (error) {
    console.error('Error fetching snoozed emails:', error)
    throw error
  }
}

// Get emails that should be unsnoozed (expired snooze)
async function getExpiredSnoozedEmails(userId = null) {
  try {
    let query = `
      SELECT id, user_id, sender, subject, snoozed_until
      FROM messages 
      WHERE is_snoozed = true AND snoozed_until <= NOW()
    `
    const params = []
    
    if (userId) {
      query += ' AND user_id = $1'
      params.push(userId)
    }
    
    query += ' ORDER BY snoozed_until ASC'
    
    const result = await db.query(query, params)
    return result.rows
  } catch (error) {
    console.error('Error fetching expired snoozed emails:', error)
    throw error
  }
}

// Process expired snoozes (unsnooze them)
async function processExpiredSnoozes() {
  try {
    const result = await db.query(`
      UPDATE messages 
      SET is_snoozed = false, snoozed_until = NULL, updated_at = NOW()
      WHERE is_snoozed = true AND snoozed_until <= NOW()
      RETURNING id, user_id, sender, subject
    `)
    
    console.log(`Processed ${result.rowCount} expired snoozed emails`)
    return result.rows
  } catch (error) {
    console.error('Error processing expired snoozes:', error)
    throw error
  }
}

// Set follow-up reminder for an email
async function setFollowUpReminder(messageId, userId, reminderTime) {
  try {
    const result = await db.query(`
      UPDATE messages 
      SET follow_up_reminder = $1,
          updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING id, subject, follow_up_reminder
    `, [reminderTime, messageId, userId])
    
    if (result.rowCount === 0) {
      throw new Error('Message not found or permission denied')
    }
    
    return result.rows[0]
  } catch (error) {
    console.error('Error setting follow-up reminder:', error)
    throw error
  }
}

// Get due follow-up reminders
async function getDueFollowUps(userId = null) {
  try {
    let query = `
      SELECT id, user_id, sender, subject, follow_up_reminder, received_at
      FROM messages 
      WHERE follow_up_reminder IS NOT NULL AND follow_up_reminder <= NOW()
    `
    const params = []
    
    if (userId) {
      query += ' AND user_id = $1'
      params.push(userId)
    }
    
    query += ' ORDER BY follow_up_reminder ASC'
    
    const result = await db.query(query, params)
    return result.rows
  } catch (error) {
    console.error('Error fetching due follow-ups:', error)
    throw error
  }
}

// Clear follow-up reminder (when user takes action)
async function clearFollowUpReminder(messageId, userId) {
  try {
    const result = await db.query(`
      UPDATE messages 
      SET follow_up_reminder = NULL,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [messageId, userId])
    
    return result.rowCount > 0
  } catch (error) {
    console.error('Error clearing follow-up reminder:', error)
    throw error
  }
}

// Snooze presets for common durations
const snoozePresets = {
  'later_today': () => {
    const date = new Date()
    date.setHours(17, 0, 0, 0) // 5 PM today
    return date
  },
  'tomorrow_morning': () => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(9, 0, 0, 0) // 9 AM tomorrow
    return date
  },
  'this_weekend': () => {
    const date = new Date()
    const daysUntilSaturday = 6 - date.getDay()
    date.setDate(date.getDate() + daysUntilSaturday)
    date.setHours(10, 0, 0, 0) // 10 AM Saturday
    return date
  },
  'next_week': () => {
    const date = new Date()
    const daysUntilMonday = (8 - date.getDay()) % 7
    date.setDate(date.getDate() + daysUntilMonday)
    date.setHours(9, 0, 0, 0) // 9 AM next Monday
    return date
  },
  'in_1_hour': () => {
    const date = new Date()
    date.setHours(date.getHours() + 1)
    return date
  },
  'in_3_hours': () => {
    const date = new Date()
    date.setHours(date.getHours() + 3)
    return date
  }
}

// Get snooze preset datetime
function getSnoozePreset(presetName) {
  const presetFn = snoozePresets[presetName]
  return presetFn ? presetFn() : null
}

module.exports = {
  snoozeEmail,
  unsnoozeEmail,
  getSnoozedEmails,
  getExpiredSnoozedEmails,
  processExpiredSnoozes,
  setFollowUpReminder,
  getDueFollowUps,
  clearFollowUpReminder,
  getSnoozePreset,
  snoozePresets: Object.keys(snoozePresets)
}
