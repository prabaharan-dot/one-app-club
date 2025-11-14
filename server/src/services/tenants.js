const db = require('../db')

async function getOrCreateTenant(domain, name){
  if(!domain) domain = 'default'
  const res = await db.query('SELECT id FROM tenants WHERE domain=$1', [domain])
  if(res.rowCount>0) return res.rows[0].id
  const ins = await db.query('INSERT INTO tenants (name, domain, created_at, updated_at) VALUES ($1,$2,now(),now()) RETURNING id', [name || domain, domain])
  return ins.rows[0].id
}

module.exports = { getOrCreateTenant }
