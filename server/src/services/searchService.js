const db = require('../db')
const llm = require('../llm/llmClient')

/**
 * Enhanced Search Service
 * Provides semantic search, keyword search, and saved searches
 */

// Perform semantic search using embeddings
async function performSemanticSearch(userId, query, limit = 20) {
  try {
    // Generate embedding for search query
    const queryEmbedding = await generateSearchEmbedding(query)
    
    if (!queryEmbedding) {
      // Fallback to keyword search if embedding fails
      return await performKeywordSearch(userId, query, limit)
    }
    
    const result = await db.query(`
      SELECT 
        m.id, m.sender, m.subject, m.body_plain, m.received_at,
        me.embedding <-> $1::vector as similarity_score
      FROM messages m
      JOIN message_embeddings me ON m.id = me.message_id
      WHERE m.user_id = $2 AND m.is_snoozed = false
      ORDER BY similarity_score ASC
      LIMIT $3
    `, [JSON.stringify(queryEmbedding), userId, limit])
    
    // Log search for analytics
    await logSearch(userId, query, 'semantic', result.rowCount)
    
    return result.rows.map(row => ({
      ...row,
      similarity_score: parseFloat(row.similarity_score),
      search_type: 'semantic'
    }))
  } catch (error) {
    console.error('Error performing semantic search:', error)
    // Fallback to keyword search
    return await performKeywordSearch(userId, query, limit)
  }
}

// Perform keyword-based search
async function performKeywordSearch(userId, query, limit = 20) {
  try {
    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2)
    
    if (searchTerms.length === 0) {
      return []
    }
    
    // Build search condition for multiple terms
    const searchConditions = searchTerms.map((_, index) => 
      `(LOWER(subject) LIKE $${index + 3} OR LOWER(body_plain) LIKE $${index + 3} OR LOWER(sender) LIKE $${index + 3})`
    ).join(' AND ')
    
    const searchParams = searchTerms.map(term => `%${term}%`)
    
    const result = await db.query(`
      SELECT id, sender, subject, body_plain, received_at,
             CASE 
               WHEN LOWER(subject) LIKE $${searchTerms.length + 3} THEN 3
               WHEN LOWER(sender) LIKE $${searchTerms.length + 3} THEN 2
               ELSE 1
             END as relevance_score
      FROM messages 
      WHERE user_id = $1 AND is_snoozed = false AND (${searchConditions})
      ORDER BY relevance_score DESC, received_at DESC
      LIMIT $2
    `, [userId, limit, ...searchParams, `%${query.toLowerCase()}%`])
    
    // Log search for analytics
    await logSearch(userId, query, 'keyword', result.rowCount)
    
    return result.rows.map(row => ({
      ...row,
      search_type: 'keyword'
    }))
  } catch (error) {
    console.error('Error performing keyword search:', error)
    throw error
  }
}

// Advanced search with filters
async function performAdvancedSearch(userId, searchParams) {
  try {
    const { 
      query, 
      sender, 
      dateFrom, 
      dateTo, 
      hasAttachments, 
      isRead, 
      isImportant,
      limit = 20 
    } = searchParams
    
    let whereConditions = ['user_id = $1', 'is_snoozed = false']
    let params = [userId]
    let paramIndex = 2
    
    // Add text search if query provided
    if (query && query.trim()) {
      whereConditions.push(`(LOWER(subject) LIKE $${paramIndex} OR LOWER(body_plain) LIKE $${paramIndex})`)
      params.push(`%${query.toLowerCase()}%`)
      paramIndex++
    }
    
    // Add sender filter
    if (sender) {
      whereConditions.push(`LOWER(sender) LIKE $${paramIndex}`)
      params.push(`%${sender.toLowerCase()}%`)
      paramIndex++
    }
    
    // Add date range filters
    if (dateFrom) {
      whereConditions.push(`received_at >= $${paramIndex}`)
      params.push(dateFrom)
      paramIndex++
    }
    
    if (dateTo) {
      whereConditions.push(`received_at <= $${paramIndex}`)
      params.push(dateTo)
      paramIndex++
    }
    
    // Add boolean filters
    if (typeof isRead === 'boolean') {
      whereConditions.push(`is_read = $${paramIndex}`)
      params.push(isRead)
      paramIndex++
    }
    
    if (typeof isImportant === 'boolean') {
      whereConditions.push(`importance = $${paramIndex}`)
      params.push(isImportant ? 'high' : 'normal')
      paramIndex++
    }
    
    if (typeof hasAttachments === 'boolean') {
      if (hasAttachments) {
        whereConditions.push(`attachments IS NOT NULL AND attachments != '{}'`)
      } else {
        whereConditions.push(`(attachments IS NULL OR attachments = '{}')`)
      }
    }
    
    const whereClause = whereConditions.join(' AND ')
    params.push(limit)
    
    const result = await db.query(`
      SELECT id, sender, subject, body_plain, received_at, is_read, importance
      FROM messages 
      WHERE ${whereClause}
      ORDER BY received_at DESC
      LIMIT $${paramIndex}
    `, params)
    
    // Log search for analytics
    await logSearch(userId, JSON.stringify(searchParams), 'advanced', result.rowCount)
    
    return result.rows.map(row => ({
      ...row,
      search_type: 'advanced'
    }))
  } catch (error) {
    console.error('Error performing advanced search:', error)
    throw error
  }
}

// Save a search query
async function saveSearch(userId, searchData) {
  try {
    const { name, query, search_type = 'semantic', filters = {} } = searchData
    
    const result = await db.query(`
      INSERT INTO saved_searches (user_id, name, query, search_type, filters)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, query, search_type, created_at
    `, [userId, name, query, search_type, JSON.stringify(filters)])
    
    return result.rows[0]
  } catch (error) {
    console.error('Error saving search:', error)
    throw error
  }
}

// Get user's saved searches
async function getSavedSearches(userId) {
  try {
    const result = await db.query(`
      SELECT id, name, query, search_type, filters, usage_count, created_at
      FROM saved_searches 
      WHERE user_id = $1
      ORDER BY usage_count DESC, created_at DESC
    `, [userId])
    
    return result.rows.map(row => ({
      ...row,
      filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters
    }))
  } catch (error) {
    console.error('Error fetching saved searches:', error)
    throw error
  }
}

// Execute a saved search
async function executeSavedSearch(userId, savedSearchId) {
  try {
    // Get saved search details
    const searchResult = await db.query(`
      SELECT query, search_type, filters FROM saved_searches 
      WHERE id = $1 AND user_id = $2
    `, [savedSearchId, userId])
    
    if (searchResult.rowCount === 0) {
      throw new Error('Saved search not found')
    }
    
    const savedSearch = searchResult.rows[0]
    const filters = typeof savedSearch.filters === 'string' 
      ? JSON.parse(savedSearch.filters) 
      : savedSearch.filters
    
    // Increment usage count
    await db.query(`
      UPDATE saved_searches 
      SET usage_count = usage_count + 1, updated_at = NOW()
      WHERE id = $1
    `, [savedSearchId])
    
    // Execute the search based on type
    let results
    switch (savedSearch.search_type) {
      case 'semantic':
        results = await performSemanticSearch(userId, savedSearch.query)
        break
      case 'advanced':
        results = await performAdvancedSearch(userId, { query: savedSearch.query, ...filters })
        break
      default:
        results = await performKeywordSearch(userId, savedSearch.query)
    }
    
    return results
  } catch (error) {
    console.error('Error executing saved search:', error)
    throw error
  }
}

// Generate search suggestions based on search history
async function getSearchSuggestions(userId, partialQuery) {
  try {
    const result = await db.query(`
      SELECT DISTINCT query, COUNT(*) as frequency
      FROM search_history 
      WHERE user_id = $1 AND LOWER(query) LIKE $2
      GROUP BY query
      ORDER BY frequency DESC, query
      LIMIT 5
    `, [userId, `%${partialQuery.toLowerCase()}%`])
    
    return result.rows
  } catch (error) {
    console.error('Error getting search suggestions:', error)
    return []
  }
}

// Generate embedding for search query
async function generateSearchEmbedding(query) {
  try {
    // This would integrate with your embedding service
    // For now, return null to fallback to keyword search
    return null
  } catch (error) {
    console.error('Error generating search embedding:', error)
    return null
  }
}

// Log search for analytics
async function logSearch(userId, query, searchType, resultsCount, clickedResultId = null) {
  try {
    await db.query(`
      INSERT INTO search_history (user_id, query, search_type, results_count, clicked_result_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, query, searchType, resultsCount, clickedResultId])
  } catch (error) {
    console.error('Error logging search:', error)
    // Don't throw - logging should not break search functionality
  }
}

// Get search analytics for user
async function getSearchAnalytics(userId, days = 30) {
  try {
    const result = await db.query(`
      SELECT 
        search_type,
        COUNT(*) as search_count,
        AVG(results_count) as avg_results,
        COUNT(clicked_result_id) as clicks
      FROM search_history 
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY search_type
      ORDER BY search_count DESC
    `, [userId])
    
    return result.rows
  } catch (error) {
    console.error('Error fetching search analytics:', error)
    return []
  }
}

module.exports = {
  performSemanticSearch,
  performKeywordSearch,
  performAdvancedSearch,
  saveSearch,
  getSavedSearches,
  executeSavedSearch,
  getSearchSuggestions,
  logSearch,
  getSearchAnalytics
}
