const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.POSTGRES_URL || 'postgres://localhost/oneappclub' })

module.exports = { query: (text, params)=> pool.query(text, params), pool }
