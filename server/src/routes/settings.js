const express = require('express')
const router = express.Router()
const db = require('../db')
const { invalidateUserCache } = require('../middleware/userContext')

// GET /api/settings/llm -> { hasKey: boolean }
// Now returns true always since we use global API keys
router.get('/llm', async (req,res)=>{
  if(!req.user) return res.status(401).json({error:'not_logged_in'})
  res.json({hasKey: true})
})

// POST /api/settings/llm -> {ok:true}
// Deprecated: No longer needed since we use global API keys
router.post('/llm', async (req,res)=>{
  if(!req.user) return res.status(401).json({error:'not_logged_in'})
  res.json({ok:true})
})

// GET /api/settings/profile -> get user profile settings
router.get('/profile', async (req, res) => {
  if(!req.user) return res.status(401).json({error:'not_logged_in'})
  
  // Return profile data directly from middleware (already cached)
  res.json({
    timezone: req.user.timezone || 'UTC',
    location: req.user.location || '',
    role: req.user.role || '',
    personalNote: req.user.personal_note || ''
  })
})

// POST /api/settings/profile -> update user profile settings
router.post('/profile', async (req, res) => {
  if(!req.user) return res.status(401).json({error:'not_logged_in'})
  
  try {
    const { timezone, location, role, personalNote } = req.body
    
    // Validate timezone if provided
    if(timezone) {
      try {
        Intl.DateTimeFormat(undefined, {timeZone: timezone})
      } catch(e) {
        return res.status(400).json({error: 'invalid_timezone'})
      }
    }
    
    await db.query(
      `UPDATE users 
       SET timezone = $1, location = $2, role = $3, personal_note = $4, updated_at = NOW()
       WHERE id = $5`,
      [
        timezone || 'UTC',
        location || '',
        role || '',
        personalNote || '',
        req.user.id
      ]
    )
    
    console.log(`📝 Profile updated for user ${req.user.id}`)
    
    // Invalidate user cache so next request gets fresh data
    if (req.session && req.session.userCache) {
      delete req.session.userCache
    }
    
    res.json({success: true})
  } catch(error) {
    console.error('Error updating user profile:', error)
    res.status(500).json({error: 'server_error'})
  }
})

module.exports = router
