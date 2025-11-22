const db = require('../db')

async function upsertUserByEmail(email, displayName, timezone){
  // try insert, if conflict update
  const text = `INSERT INTO users (email, display_name, timezone, created_at, updated_at) VALUES ($1,$2,$3,now(),now()) ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=now() RETURNING id`;
  const vals = [email, displayName, timezone || 'UTC']
  const r = await db.query(text, vals)
  return r.rows[0].id
}

async function getUserById(id){
  const r = await db.query(
    'SELECT id,email,display_name,timezone,role,location,personal_note FROM users WHERE id=$1', 
    [id]
  )
  return r.rows[0]
}

module.exports = { upsertUserByEmail, getUserById }
