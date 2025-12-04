const express = require('express')
const router = express.Router()
const emailTemplatesService = require('../services/emailTemplates')
const snoozeService = require('../services/snoozeService')
const searchService = require('../services/searchService')

// =============================================
// EMAIL TEMPLATES ROUTES
// =============================================

// GET /api/templates - Get user's email templates
router.get('/templates', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { category } = req.query
    const templates = await emailTemplatesService.getUserTemplates(userId, category)
    
    res.json({ templates })
  } catch (error) {
    console.error('Get templates error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// POST /api/templates - Create new email template
router.post('/templates', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { name, subject_template, body_template, category } = req.body
    
    if (!name || !body_template) {
      return res.status(400).json({ error: 'missing_required_fields' })
    }

    const template = await emailTemplatesService.createTemplate(userId, {
      name,
      subject_template,
      body_template,
      category
    })
    
    res.json({ template })
  } catch (error) {
    console.error('Create template error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// POST /api/templates/:id/use - Use template and increment usage count
router.post('/templates/:id/use', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { id: templateId } = req.params
    const { variables = {} } = req.body

    // Get template
    const templates = await emailTemplatesService.getUserTemplates(userId)
    const template = templates.find(t => t.id === templateId)
    
    if (!template) {
      return res.status(404).json({ error: 'template_not_found' })
    }

    // Process template with variables
    const processedTemplate = emailTemplatesService.processTemplate(template, variables)
    
    // Increment usage count
    await emailTemplatesService.incrementTemplateUsage(templateId, userId)
    
    res.json({ 
      template: processedTemplate,
      original: template
    })
  } catch (error) {
    console.error('Use template error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// POST /api/templates/suggest - Get template suggestions for email content
router.post('/templates/suggest', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { email_content } = req.body
    
    if (!email_content) {
      return res.status(400).json({ error: 'missing_email_content' })
    }

    const suggestions = await emailTemplatesService.suggestTemplates(userId, email_content)
    
    res.json({ suggestions })
  } catch (error) {
    console.error('Template suggestions error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// =============================================
// SNOOZE & FOLLOW-UP ROUTES
// =============================================

// POST /api/messages/:id/snooze - Snooze an email
router.post('/messages/:id/snooze', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { id: messageId } = req.params
    const { snooze_until, preset } = req.body
    
    let snoozeDateTime
    if (preset) {
      snoozeDateTime = snoozeService.getSnoozePreset(preset)
      if (!snoozeDateTime) {
        return res.status(400).json({ error: 'invalid_preset' })
      }
    } else if (snooze_until) {
      snoozeDateTime = new Date(snooze_until)
      if (isNaN(snoozeDateTime.getTime())) {
        return res.status(400).json({ error: 'invalid_date' })
      }
    } else {
      return res.status(400).json({ error: 'missing_snooze_time' })
    }

    const result = await snoozeService.snoozeEmail(messageId, userId, snoozeDateTime)
    
    res.json({ 
      message: 'Email snoozed successfully',
      snoozed_until: snoozeDateTime,
      email: result
    })
  } catch (error) {
    console.error('Snooze email error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// POST /api/messages/:id/unsnooze - Unsnooze an email
router.post('/messages/:id/unsnooze', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { id: messageId } = req.params
    
    const result = await snoozeService.unsnoozeEmail(messageId, userId)
    
    res.json({ 
      message: 'Email unsnoozed successfully',
      email: result
    })
  } catch (error) {
    console.error('Unsnooze email error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// GET /api/messages/snoozed - Get user's snoozed emails
router.get('/messages/snoozed', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const snoozedEmails = await snoozeService.getSnoozedEmails(userId)
    
    res.json({ snoozed_emails: snoozedEmails })
  } catch (error) {
    console.error('Get snoozed emails error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// POST /api/messages/:id/follow-up - Set follow-up reminder
router.post('/messages/:id/follow-up', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { id: messageId } = req.params
    const { reminder_time } = req.body
    
    if (!reminder_time) {
      return res.status(400).json({ error: 'missing_reminder_time' })
    }

    const reminderDateTime = new Date(reminder_time)
    if (isNaN(reminderDateTime.getTime())) {
      return res.status(400).json({ error: 'invalid_date' })
    }

    const result = await snoozeService.setFollowUpReminder(messageId, userId, reminderDateTime)
    
    res.json({ 
      message: 'Follow-up reminder set successfully',
      reminder_time: reminderDateTime,
      email: result
    })
  } catch (error) {
    console.error('Set follow-up reminder error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// GET /api/messages/follow-ups - Get due follow-up reminders
router.get('/messages/follow-ups', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const followUps = await snoozeService.getDueFollowUps(userId)
    
    res.json({ follow_ups: followUps })
  } catch (error) {
    console.error('Get follow-ups error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// GET /api/snooze/presets - Get available snooze presets
router.get('/snooze/presets', async (req, res) => {
  try {
    const presets = snoozeService.snoozePresets.map(preset => ({
      key: preset,
      label: preset.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      datetime: snoozeService.getSnoozePreset(preset)
    }))
    
    res.json({ presets })
  } catch (error) {
    console.error('Get snooze presets error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// =============================================
// ENHANCED SEARCH ROUTES
// =============================================

// POST /api/search - Perform email search
router.post('/search', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { query, search_type = 'semantic', limit = 20, filters = {} } = req.body
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'missing_query' })
    }

    let results
    switch (search_type) {
      case 'semantic':
        results = await searchService.performSemanticSearch(userId, query, limit)
        break
      case 'keyword':
        results = await searchService.performKeywordSearch(userId, query, limit)
        break
      case 'advanced':
        results = await searchService.performAdvancedSearch(userId, { query, ...filters, limit })
        break
      default:
        results = await searchService.performSemanticSearch(userId, query, limit)
    }
    
    res.json({ 
      results,
      query,
      search_type,
      total: results.length
    })
  } catch (error) {
    console.error('Search error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// POST /api/search/save - Save a search query
router.post('/search/save', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { name, query, search_type, filters } = req.body
    
    if (!name || !query) {
      return res.status(400).json({ error: 'missing_required_fields' })
    }

    const savedSearch = await searchService.saveSearch(userId, {
      name,
      query,
      search_type,
      filters
    })
    
    res.json({ saved_search: savedSearch })
  } catch (error) {
    console.error('Save search error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// GET /api/search/saved - Get user's saved searches
router.get('/search/saved', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const savedSearches = await searchService.getSavedSearches(userId)
    
    res.json({ saved_searches: savedSearches })
  } catch (error) {
    console.error('Get saved searches error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// POST /api/search/saved/:id/execute - Execute a saved search
router.post('/search/saved/:id/execute', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { id: savedSearchId } = req.params
    
    const results = await searchService.executeSavedSearch(userId, savedSearchId)
    
    res.json({ 
      results,
      total: results.length
    })
  } catch (error) {
    console.error('Execute saved search error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// GET /api/search/suggestions - Get search suggestions
router.get('/search/suggestions', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { q } = req.query
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] })
    }

    const suggestions = await searchService.getSearchSuggestions(userId, q)
    
    res.json({ suggestions })
  } catch (error) {
    console.error('Get search suggestions error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

// GET /api/search/analytics - Get search analytics
router.get('/search/analytics', async (req, res) => {
  try {
    const userId = req.session?.userId
    if (!userId) return res.status(401).json({ error: 'not_logged_in' })

    const { days = 30 } = req.query
    
    const analytics = await searchService.getSearchAnalytics(userId, parseInt(days))
    
    res.json({ analytics })
  } catch (error) {
    console.error('Get search analytics error:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

module.exports = router
