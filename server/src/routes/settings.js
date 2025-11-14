const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/settings/llm -> { hasKey: boolean }
router.get('/llm', async (req,res)=>{
  if(!req.session.userId) return res.status(401).json({error:'not_logged_in'})
  const r = await db.query('SELECT id FROM user_settings WHERE user_id=$1', [req.session.userId])
  res.json({hasKey: r.rowCount>0})
})

// POST /api/settings/llm -> {ok:true}
router.post('/llm', async (req,res)=>{
  if(!req.session.userId) return res.status(401).json({error:'not_logged_in'})
  const {key, model} = req.body
  if(!key || !model) return res.status(400).json({error:'missing'})
  // naive storage: store key bytes in user_settings.llm_key_encrypted (replace with proper encryption)
  const blob = Buffer.from(key)
  await db.query(`INSERT INTO user_settings (user_id, llm_key_encrypted, llm_model, created_at, updated_at) VALUES ($1,$2,$3,now(),now()) ON CONFLICT (user_id) DO UPDATE SET llm_key_encrypted=$2, llm_model=$3, updated_at=now()`, [req.session.userId, blob, model])
  res.json({ok:true})
})

module.exports = router
