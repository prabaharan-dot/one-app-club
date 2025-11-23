/**
 * Integration Utilities
 * Centralized utilities for managing user integrations and OAuth tokens
 */

const db = require('../db')
const { google } = require('googleapis')

/**
 * Get user's integration by platform with token parsing
 * @param {string} userId - User ID
 * @param {string} platform - Platform name (e.g., 'gmail', 'slack')
 * @param {boolean} requireEnabled - Only return enabled integrations (default: true)
 * @returns {Object|null} Integration object with parsed tokens or null if not found
 */
async function getUserIntegration(userId, platform, requireEnabled = true) {
  try {
    const enabledClause = requireEnabled ? 'AND enabled = true' : ''
    const query = `
      SELECT 
        id,
        user_id,
        platform,
        external_account_id,
        oauth_token_encrypted,
        config,
        enabled,
        created_at,
        updated_at
      FROM integrations 
      WHERE user_id = $1 AND platform = $2 ${enabledClause}
      LIMIT 1
    `
    
    const result = await db.query(query, [userId, platform])
    
    if (result.rowCount === 0) {
      console.warn(`🔍 No ${platform} integration found for user ${userId}`)
      return null
    }

    const integration = result.rows[0]
    
    // Parse OAuth tokens if available
    if (integration.oauth_token_encrypted) {
      try {
        integration.tokens = JSON.parse(integration.oauth_token_encrypted.toString())
      } catch (parseError) {
        console.error(`❌ Failed to parse OAuth tokens for ${platform} integration:`, parseError)
        integration.tokens = null
      }
    }
    
    // Parse config if available
    if (integration.config) {
      try {
        integration.configData = typeof integration.config === 'string' 
          ? JSON.parse(integration.config) 
          : integration.config
      } catch (configError) {
        console.warn(`⚠️ Failed to parse config for ${platform} integration:`, configError)
        integration.configData = {}
      }
    }

    console.log(`✅ Found ${platform} integration for user ${userId}`)
    return integration
  } catch (error) {
    console.error(`🚨 Error getting ${platform} integration for user ${userId}:`, error)
    throw error
  }
}

/**
 * Get multiple integrations for a user
 * @param {string} userId - User ID
 * @param {string[]} platforms - Array of platform names (optional, gets all if not specified)
 * @param {boolean} requireEnabled - Only return enabled integrations (default: true)
 * @returns {Object[]} Array of integration objects with parsed tokens
 */
async function getUserIntegrations(userId, platforms = null, requireEnabled = true) {
  try {
    let query = `
      SELECT 
        id,
        user_id,
        platform,
        external_account_id,
        oauth_token_encrypted,
        config,
        enabled,
        created_at,
        updated_at
      FROM integrations 
      WHERE user_id = $1
    `
    
    const params = [userId]
    
    if (platforms && platforms.length > 0) {
      const placeholders = platforms.map((_, index) => `$${index + 2}`).join(',')
      query += ` AND platform IN (${placeholders})`
      params.push(...platforms)
    }
    
    if (requireEnabled) {
      query += ' AND enabled = true'
    }
    
    query += ' ORDER BY platform, created_at DESC'
    
    const result = await db.query(query, params)
    
    const integrations = result.rows.map(integration => {
      // Parse OAuth tokens if available
      if (integration.oauth_token_encrypted) {
        try {
          integration.tokens = JSON.parse(integration.oauth_token_encrypted.toString())
        } catch (parseError) {
          console.error(`❌ Failed to parse OAuth tokens for ${integration.platform}:`, parseError)
          integration.tokens = null
        }
      }
      
      // Parse config if available
      if (integration.config) {
        try {
          integration.configData = typeof integration.config === 'string' 
            ? JSON.parse(integration.config) 
            : integration.config
        } catch (configError) {
          console.warn(`⚠️ Failed to parse config for ${integration.platform}:`, configError)
          integration.configData = {}
        }
      }
      
      return integration
    })

    console.log(`📊 Found ${integrations.length} integrations for user ${userId}`)
    return integrations
  } catch (error) {
    console.error(`🚨 Error getting integrations for user ${userId}:`, error)
    throw error
  }
}

/**
 * Create Google OAuth2 client from tokens
 * @param {Object} tokens - OAuth token object
 * @returns {google.auth.OAuth2} Configured OAuth2 client
 */
function createGoogleOAuthClient(tokens) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    
    oauth2Client.setCredentials(tokens)
    return oauth2Client
  } catch (error) {
    console.error('🚨 Failed to create Google OAuth client:', error)
    throw new Error('Failed to create Google OAuth client: ' + error.message)
  }
}

/**
 * Get Google OAuth client for user
 * @param {string} userId - User ID
 * @returns {google.auth.OAuth2|null} OAuth2 client or null if not available
 */
async function getUserGoogleOAuthClient(userId) {
  try {
    const integration = await getUserIntegration(userId, 'gmail')
    
    if (!integration || !integration.tokens) {
      console.warn(`🔐 No Google OAuth tokens available for user ${userId}`)
      return null
    }
    
    return createGoogleOAuthClient(integration.tokens)
  } catch (error) {
    console.error(`🚨 Error getting Google OAuth client for user ${userId}:`, error)
    throw error
  }
}

/**
 * Validate that user has required integration
 * @param {string} userId - User ID
 * @param {string} platform - Platform name
 * @param {boolean} requireTokens - Whether to require valid tokens (default: true)
 * @returns {Object} Validation result with integration data
 */
async function validateUserIntegration(userId, platform, requireTokens = true) {
  try {
    const integration = await getUserIntegration(userId, platform)
    
    const validation = {
      hasIntegration: !!integration,
      hasTokens: !!(integration && integration.tokens),
      hasValidTokens: false,
      integration: integration,
      errorCode: null,
      errorMessage: null
    }
    
    if (!integration) {
      validation.errorCode = 'INTEGRATION_NOT_FOUND'
      validation.errorMessage = `${platform} integration not found. Please connect your ${platform} account in Settings → Integrations.`
      return validation
    }
    
    if (requireTokens && !integration.tokens) {
      validation.errorCode = 'TOKENS_NOT_AVAILABLE'
      validation.errorMessage = `${platform} authentication tokens not available. Please reconnect your ${platform} account.`
      return validation
    }
    
    if (requireTokens && integration.tokens) {
      // Basic token validation (check for required fields)
      if (platform === 'gmail') {
        validation.hasValidTokens = !!(integration.tokens.access_token)
        if (!validation.hasValidTokens) {
          validation.errorCode = 'INVALID_TOKENS'
          validation.errorMessage = 'Google authentication expired. Please reconnect your Google account in Settings → Integrations.'
        }
      } else {
        // For other platforms, assume tokens are valid if they exist
        validation.hasValidTokens = true
      }
    }
    
    if (!requireTokens || validation.hasValidTokens) {
      validation.errorCode = null
      validation.errorMessage = null
    }
    
    return validation
  } catch (error) {
    console.error(`🚨 Error validating ${platform} integration for user ${userId}:`, error)
    return {
      hasIntegration: false,
      hasTokens: false,
      hasValidTokens: false,
      integration: null,
      errorCode: 'VALIDATION_ERROR',
      errorMessage: `Failed to validate ${platform} integration: ${error.message}`
    }
  }
}

/**
 * Get user-friendly error messages for integration issues
 * @param {string} platform - Platform name
 * @param {string} errorCode - Error code from validation
 * @returns {string} User-friendly error message
 */
function getIntegrationErrorMessage(platform, errorCode) {
  const platformDisplay = platform.charAt(0).toUpperCase() + platform.slice(1)
  
  switch (errorCode) {
    case 'INTEGRATION_NOT_FOUND':
      return `🔗 **Connect ${platformDisplay} Account**: Go to Settings → Integrations → Connect ${platformDisplay} Account to enable this feature.`
    
    case 'TOKENS_NOT_AVAILABLE':
      return `🔐 **${platformDisplay} Not Connected**: Your ${platformDisplay} account connection is missing. Please connect in Settings → Integrations.`
    
    case 'INVALID_TOKENS':
      return `🔄 **Reconnect Required**: Your ${platformDisplay} account connection expired. Please reconnect in Settings → Integrations.`
    
    case 'VALIDATION_ERROR':
      return `⚠️ **Connection Issue**: There's a problem with your ${platformDisplay} integration. Please try reconnecting in Settings → Integrations.`
    
    default:
      return `❌ **${platformDisplay} Unavailable**: Please check your ${platformDisplay} connection in Settings → Integrations.`
  }
}

/**
 * List all integrations for a platform (admin/system use)
 * @param {string} platform - Platform name
 * @param {boolean} requireEnabled - Only return enabled integrations (default: true)
 * @returns {Object[]} Array of all integrations for the platform
 */
async function listIntegrationsForPlatform(platform, requireEnabled = true) {
  try {
    const enabledClause = requireEnabled ? 'AND enabled = true' : ''
    const query = `
      SELECT * FROM integrations 
      WHERE platform = $1 ${enabledClause}
      ORDER BY created_at DESC
    `
    
    const result = await db.query(query, [platform])
    return result.rows
  } catch (error) {
    console.error(`🚨 Error listing ${platform} integrations:`, error)
    throw error
  }
}

/**
 * Upsert user integration
 * @param {string} userId - User ID
 * @param {string} platform - Platform name
 * @param {string} externalAccountId - External account ID
 * @param {Object} tokens - OAuth tokens object
 * @param {Object} config - Integration configuration (optional)
 * @returns {void}
 */
async function upsertIntegration(userId, platform, externalAccountId, tokens, config = {}) {
  try {
    const tokenBlob = Buffer.from(JSON.stringify(tokens))
    const configJson = JSON.stringify(config)
    
    const query = `
      INSERT INTO integrations (
        user_id, 
        platform, 
        external_account_id, 
        oauth_token_encrypted, 
        config, 
        enabled, 
        created_at, 
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, true, now(), now()) 
      ON CONFLICT (user_id, external_account_id, platform) 
      DO UPDATE SET 
        oauth_token_encrypted = EXCLUDED.oauth_token_encrypted,
        config = EXCLUDED.config,
        updated_at = now()
    `
    
    await db.query(query, [userId, platform, externalAccountId, tokenBlob, configJson])
    console.log(`✅ Upserted ${platform} integration for user ${userId}`)
  } catch (error) {
    console.error(`🚨 Error upserting ${platform} integration for user ${userId}:`, error)
    throw error
  }
}

module.exports = {
  // Core functions
  getUserIntegration,
  getUserIntegrations,
  validateUserIntegration,
  
  // Google-specific functions
  createGoogleOAuthClient,
  getUserGoogleOAuthClient,
  
  // Error handling
  getIntegrationErrorMessage,
  
  // Admin/System functions
  listIntegrationsForPlatform,
  upsertIntegration
}
