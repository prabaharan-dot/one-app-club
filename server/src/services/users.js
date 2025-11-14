const db = require('../db')

async function upsertUserByEmail(email, displayName, timezone, tenantId){
  // try insert, if conflict update
  const text = `INSERT INTO users (tenant_id, email, display_name, timezone, created_at, updated_at) VALUES ($1,$2,$3,$4,now(),now()) ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name, tenant_id=EXCLUDED.tenant_id, updated_at=now() RETURNING id`;
  const vals = [tenantId, email, displayName, timezone || 'UTC']
  const r = await db.query(text, vals)
  return r.rows[0].id
}

async function getUserById(id){
  const r = await db.query('SELECT id,email,display_name,timezone,role,tenant_id FROM users WHERE id=$1', [id])
  return r.rows[0]
}

module.exports = { upsertUserByEmail, getUserById }
