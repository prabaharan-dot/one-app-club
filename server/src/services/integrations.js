const db = require('../db')

async function listIntegrationsForPlatform(platform){
  const r = await db.query('SELECT * FROM integrations WHERE platform=$1 AND enabled=true', [platform])
  return r.rows
}

async function upsertIntegration(tenantId, platform, externalAccountId, tokenBlob, config){
  const q = `INSERT INTO integrations (tenant_id, platform, external_account_id, oauth_token_encrypted, config, enabled, created_at, updated_at)
  VALUES ($1,$2,$3,$4,$5,true,now(),now()) ON CONFLICT (external_account_id, platform) DO UPDATE SET oauth_token_encrypted=EXCLUDED.oauth_token_encrypted, config=EXCLUDED.config, updated_at=now()`
  await db.query(q, [tenantId, platform, externalAccountId, tokenBlob, JSON.stringify(config||{})])
}

module.exports = { listIntegrationsForPlatform, upsertIntegration }
