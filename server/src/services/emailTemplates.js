const db = require('../db')

/**
 * Email Templates Service
 * Manages user-defined email templates for quick responses
 */

// Get all templates for a user
async function getUserTemplates(userId, category = null) {
  try {
    let query = `
      SELECT id, name, subject_template, body_template, category, usage_count, created_at
      FROM email_templates 
      WHERE user_id = $1 AND is_active = true
    `
    const params = [userId]
    
    if (category) {
      query += ' AND category = $2'
      params.push(category)
    }
    
    query += ' ORDER BY usage_count DESC, created_at DESC'
    
    const result = await db.query(query, params)
    return result.rows
  } catch (error) {
    console.error('Error fetching user templates:', error)
    throw error
  }
}

// Create a new template
async function createTemplate(userId, templateData) {
  try {
    const { name, subject_template, body_template, category = 'general' } = templateData
    
    const result = await db.query(`
      INSERT INTO email_templates (user_id, name, subject_template, body_template, category)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, subject_template, body_template, category, created_at
    `, [userId, name, subject_template, body_template, category])
    
    return result.rows[0]
  } catch (error) {
    console.error('Error creating template:', error)
    throw error
  }
}

// Update template usage count
async function incrementTemplateUsage(templateId, userId) {
  try {
    await db.query(`
      UPDATE email_templates 
      SET usage_count = usage_count + 1, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, [templateId, userId])
  } catch (error) {
    console.error('Error incrementing template usage:', error)
  }
}

// Process template variables
function processTemplate(template, variables = {}) {
  let processed = {
    subject: template.subject_template || '',
    body: template.body_template || ''
  }
  
  // Replace common variables
  const defaultVariables = {
    '{sender_name}': variables.sender_name || 'there',
    '{sender_email}': variables.sender_email || '',
    '{original_subject}': variables.original_subject || '',
    '{user_name}': variables.user_name || '',
    '{current_date}': new Date().toLocaleDateString(),
    '{current_time}': new Date().toLocaleTimeString()
  }
  
  // Merge custom variables with defaults
  const allVariables = { ...defaultVariables, ...variables }
  
  // Replace variables in subject and body
  Object.entries(allVariables).forEach(([key, value]) => {
    const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g')
    processed.subject = processed.subject.replace(regex, value)
    processed.body = processed.body.replace(regex, value)
  })
  
  return processed
}

// Get template suggestions based on email content
async function suggestTemplates(userId, emailContent) {
  try {
    // Simple keyword matching for template suggestions
    const keywordMap = {
      'meeting': ['meeting_decline', 'meeting_accept', 'meeting_reschedule'],
      'thank': ['thank_you'],
      'follow': ['follow_up'],
      'intro': ['introduction'],
      'deadline': ['deadline_extension', 'deadline_reminder']
    }
    
    const content = emailContent.toLowerCase()
    let suggestedCategories = []
    
    Object.entries(keywordMap).forEach(([keyword, categories]) => {
      if (content.includes(keyword)) {
        suggestedCategories.push(...categories)
      }
    })
    
    if (suggestedCategories.length === 0) {
      suggestedCategories = ['general']
    }
    
    // Get templates for suggested categories
    const templates = await getUserTemplates(userId)
    const suggestions = templates.filter(t => 
      suggestedCategories.includes(t.category)
    ).slice(0, 3) // Return top 3 suggestions
    
    return suggestions
  } catch (error) {
    console.error('Error suggesting templates:', error)
    return []
  }
}

// Create default templates for new users
async function createDefaultTemplates(userId) {
  const defaultTemplates = [
    {
      name: 'Thank You',
      subject_template: 'Re: {original_subject}',
      body_template: 'Hi {sender_name},\n\nThank you for your email. I appreciate you reaching out.\n\nBest regards,\n{user_name}',
      category: 'thank_you'
    },
    {
      name: 'Follow Up',
      subject_template: 'Following up: {original_subject}',
      body_template: 'Hi {sender_name},\n\nI wanted to follow up on my previous email. Please let me know if you need any additional information.\n\nBest regards,\n{user_name}',
      category: 'follow_up'
    },
    {
      name: 'Meeting Decline',
      subject_template: 'Re: {original_subject}',
      body_template: 'Hi {sender_name},\n\nThank you for the meeting invitation. Unfortunately, I won\'t be able to attend due to a scheduling conflict.\n\nCould we explore alternative times that might work better?\n\nBest regards,\n{user_name}',
      category: 'meeting_decline'
    }
  ]
  
  try {
    for (const template of defaultTemplates) {
      await createTemplate(userId, template)
    }
  } catch (error) {
    console.error('Error creating default templates:', error)
  }
}

module.exports = {
  getUserTemplates,
  createTemplate,
  incrementTemplateUsage,
  processTemplate,
  suggestTemplates,
  createDefaultTemplates
}
