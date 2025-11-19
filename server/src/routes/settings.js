const express = require('express')
const router = express.Router()
const db = require('../db')

// GET /api/settings/llm -> { hasKey: boolean }
// Now returns true always since we use global API keys
router.get('/llm', async (req,res)=>{
  if(!req.session.userId) return res.status(401).json({error:'not_logged_in'})
  res.json({hasKey: true})
})

// POST /api/settings/llm -> {ok:true}
// Deprecated: No longer needed since we use global API keys
router.post('/llm', async (req,res)=>{
  if(!req.session.userId) return res.status(401).json({error:'not_logged_in'})
  res.json({ok:true})
})

module.exports = router
