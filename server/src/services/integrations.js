/**
 * Legacy integrations service
 * @deprecated Use utils/integrations.js for new code
 * This file maintains backward compatibility for existing code
 */

const integrationUtils = require('../utils/integrations')

// Legacy function - use integrationUtils.listIntegrationsForPlatform instead
async function listIntegrationsForPlatform(platform) {
  return await integrationUtils.listIntegrationsForPlatform(platform, true)
}

// Legacy function - use integrationUtils.upsertIntegration instead  
async function upsertIntegration(userId, platform, externalAccountId, tokenBlob, config) {
  // Convert tokenBlob to tokens object if needed
  const tokens = tokenBlob instanceof Buffer 
    ? JSON.parse(tokenBlob.toString())
    : (typeof tokenBlob === 'string' ? JSON.parse(tokenBlob) : tokenBlob)
  
  return await integrationUtils.upsertIntegration(userId, platform, externalAccountId, tokens, config || {})
}

// Legacy function - use integrationUtils.getUserIntegration instead
async function getIntegrationByUserAndPlatform(userId, platform) {
  const integration = await integrationUtils.getUserIntegration(userId, platform, true)
  
  // Return in legacy format (without parsed tokens/config for backward compatibility)
  if (integration) {
    return {
      id: integration.id,
      user_id: integration.user_id,
      platform: integration.platform,
      external_account_id: integration.external_account_id,
      oauth_token_encrypted: integration.oauth_token_encrypted,
      config: integration.config,
      enabled: integration.enabled,
      created_at: integration.created_at,
      updated_at: integration.updated_at
    }
  }
  
  return null
}

module.exports = { 
  listIntegrationsForPlatform, 
  upsertIntegration, 
  getIntegrationByUserAndPlatform 
}
