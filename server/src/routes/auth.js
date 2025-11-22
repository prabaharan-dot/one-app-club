const express = require('express')
const router = express.Router()
const {google} = require('googleapis')
const usersService = require('../services/users')
const integrationsService = require('../services/integrations')

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = process.env.GOOGLE_REDIRECT || 'http://localhost:4000/api/auth/oauth2callback'

function oauthClient(){
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

// Standardized scopes for One App Club - ensures consistency across all auth endpoints
function getRequiredScopes() {
  return [
    'https://www.googleapis.com/auth/userinfo.email',      // User profile access
    'https://www.googleapis.com/auth/userinfo.profile',    // User profile access  
    'https://www.googleapis.com/auth/gmail.readonly',      // Read emails and labels
    'https://www.googleapis.com/auth/gmail.send',          // Send emails (replies, forwards)
    'https://www.googleapis.com/auth/gmail.modify',        // Modify emails (mark read, delete, labels)
    'https://www.googleapis.com/auth/calendar',            // Create calendar events/meetings
    'https://www.googleapis.com/auth/tasks'                // Create and manage tasks
  ]
}

router.get('/url', (req, res) =>{
  const o = oauthClient()
  const scopes = getRequiredScopes()
  
  const url = o.generateAuthUrl({
    access_type:'offline', 
    scope:scopes, 
    prompt:'consent',
    include_granted_scopes: true
  })
  res.json({url})
})

// new signup endpoint to begin google oauth for signup
// IMPORTANT: This endpoint requests ALL necessary permissions upfront for new users
router.get('/signup', (req,res)=>{
  const o = oauthClient()
  const scopes = getRequiredScopes()
  
  // Force consent screen to ensure user sees all permissions being requested
  const url = o.generateAuthUrl({
    access_type:'offline', 
    scope:scopes, 
    prompt:'consent',
    include_granted_scopes: true  // Include previously granted scopes
  })
  res.redirect(url)
})

// endpoint to request additional permissions for existing users
router.get('/reauth', (req,res)=>{
  console.log('🔐 Reauth request - Session ID:', req.session.id, 'User ID:', req.session.userId)
  
  if(!req.session.userId) {
    console.log('🔐 No session found in popup, redirecting to Google OAuth')
    // If no session in popup, redirect to login with reauth state
    const o = oauthClient()
    const scopes = getRequiredScopes()
    
    const url = o.generateAuthUrl({
      access_type:'offline', 
      scope:scopes, 
      prompt:'consent', 
      state:'reauth',
      include_granted_scopes: true
    })
    return res.redirect(url)
  }
  
  console.log('🔐 Valid session found, redirecting to Google OAuth with reauth state')
  const o = oauthClient()
  const scopes = getRequiredScopes()
  
  const url = o.generateAuthUrl({
    access_type:'offline', 
    scope:scopes, 
    prompt:'consent', 
    state:'reauth',
    include_granted_scopes: true
  })
  res.redirect(url)
})

// endpoint for onboarding new users - ensures all permissions are granted
router.get('/onboard', (req,res)=>{
  if(!req.session.userId) {
    // If no session in popup, redirect to Google OAuth with onboard state
    const o = oauthClient()
    const scopes = getRequiredScopes()
    
    const url = o.generateAuthUrl({
      access_type:'offline', 
      scope:scopes, 
      prompt:'consent',
      state:'onboard',
      include_granted_scopes: true
    })
    return res.redirect(url)
  }
  
  const o = oauthClient()
  const scopes = getRequiredScopes()
  
  // Force consent screen and include all scopes for complete onboarding
  const url = o.generateAuthUrl({
    access_type:'offline', 
    scope:scopes, 
    prompt:'consent',
    state:'onboard',
    include_granted_scopes: true
  })
  res.redirect(url)
})

// endpoint to check current permissions
router.get('/permissions', async (req, res) => {
  try {
    if(!req.session.userId) return res.status(401).json({error:'not_logged_in'})
    
    const ires = await integrationsService.getIntegrationByUserAndPlatform(req.session.userId, 'gmail')
    if(!ires) return res.status(404).json({error:'no_integration'})
    
    const tokens = JSON.parse(ires.oauth_token_encrypted.toString())
    const o = oauthClient()
    o.setCredentials(tokens)
    
    // Test each required permission by making a simple API call
    const permissions = {
      gmail_read: false,
      gmail_send: false,
      gmail_modify: false,
      calendar: false,
      tasks: false
    }
    
    const gmail = google.gmail({version:'v1', auth:o})
    const calendar = google.calendar({version:'v3', auth:o})
    const tasks = google.tasks({version:'v1', auth:o})
    
    // Test Gmail read access
    try {
      await gmail.users.getProfile({userId: 'me'})
      permissions.gmail_read = true
    } catch(e) { /* ignore */ }
    
    // Test Gmail send access by checking if we can list drafts
    try {
      await gmail.users.drafts.list({userId: 'me', maxResults: 1})
      permissions.gmail_send = true
    } catch(e) { /* ignore */ }
    
    // Test Gmail modify access by checking if we can list labels
    try {
      await gmail.users.labels.list({userId: 'me'})
      permissions.gmail_modify = true
    } catch(e) { /* ignore */ }
    
    // Test Calendar access
    try {
      await calendar.calendarList.list({maxResults: 1})
      permissions.calendar = true
    } catch(e) { /* ignore */ }
    
    // Test Tasks access
    try {
      await tasks.tasklists.list({maxResults: 1})
      permissions.tasks = true
    } catch(e) { /* ignore */ }
    
    const hasAllPermissions = Object.values(permissions).every(p => p === true)
    
    res.json({
      permissions,
      hasAllPermissions,
      missingPermissions: Object.keys(permissions).filter(key => !permissions[key]),
      reauthUrl: hasAllPermissions ? null : '/api/auth/reauth'
    })
    
  } catch(e) {
    console.error('permissions check error', e)
    res.status(500).json({error: 'server_error', detail: e.message})
  }
})

router.get('/oauth2callback', async (req, res)=>{
  const code = req.query.code
  const state = req.query.state
  if(!code) return res.status(400).send('missing code')
  const o = oauthClient()
  const {tokens} = await o.getToken(code)
  o.setCredentials(tokens)
  const oauth2 = google.oauth2({auth:o, version:'v2'})
  const profile = await oauth2.userinfo.get()
  const userInfo = profile.data

  // For new users, verify they granted all necessary permissions
  let permissionVerification = null
  try {
    // Test key permissions by making API calls
    const gmail = google.gmail({version:'v1', auth:o})
    const calendar = google.calendar({version:'v3', auth:o})
    const tasks = google.tasks({version:'v1', auth:o})
    
    const permissionTests = []
    
    // Test Gmail access
    try {
      await gmail.users.getProfile({userId: 'me'})
      permissionTests.push('gmail_basic')
    } catch(e) { 
      console.warn('Gmail basic access failed:', e.message)
    }
    
    // Test Gmail modify access (for mark as read/delete)
    try {
      await gmail.users.labels.list({userId: 'me'})
      permissionTests.push('gmail_modify')
    } catch(e) { 
      console.warn('Gmail modify access failed:', e.message)
    }
    
    // Test Gmail send access
    try {
      await gmail.users.drafts.list({userId: 'me', maxResults: 1})
      permissionTests.push('gmail_send')
    } catch(e) { 
      console.warn('Gmail send access failed:', e.message)
    }
    
    // Test Calendar access
    try {
      await calendar.calendarList.list({maxResults: 1})
      permissionTests.push('calendar')
    } catch(e) { 
      console.warn('Calendar access failed:', e.message)
    }
    
    // Test Tasks access
    try {
      await tasks.tasklists.list({maxResults: 1})
      permissionTests.push('tasks')
    } catch(e) { 
      console.warn('Tasks access failed:', e.message)
    }
    
    permissionVerification = {
      grantedPermissions: permissionTests,
      hasAllRequired: permissionTests.length >= 5, // We expect at least 5 permissions
      timestamp: new Date().toISOString()
    }
    
  } catch(verificationError) {
    console.error('Permission verification failed:', verificationError)
    permissionVerification = {
      grantedPermissions: [],
      hasAllRequired: false,
      error: verificationError.message,
      timestamp: new Date().toISOString()
    }
  }

  // upsert user and integration (user-scoped) with permission info
  const tokenBlob = Buffer.from(JSON.stringify(tokens))
  const userId = await usersService.upsertUserByEmail(userInfo.email, userInfo.name, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  await integrationsService.upsertIntegration(userId, 'gmail', userInfo.id, tokenBlob, {
    scopes: [], 
    permissionVerification,
    lastVerified: new Date().toISOString()
  })

  // set session
  req.session.userId = userId
  
  // Handle different auth flows
  if(state === 'reauth') {
    return res.redirect((process.env.CLIENT_ORIGIN || 'http://localhost:5173') + '?reauth=success')
  }
  
  if(state === 'onboard') {
    if(!permissionVerification.hasAllRequired) {
      return res.redirect((process.env.CLIENT_ORIGIN || 'http://localhost:5173') + '?onboard=incomplete')
    }
    return res.redirect((process.env.CLIENT_ORIGIN || 'http://localhost:5173') + '?onboard=success')
  }
  
  // For regular signups, redirect with permission status
  if(!permissionVerification.hasAllRequired) {
    return res.redirect((process.env.CLIENT_ORIGIN || 'http://localhost:5173') + '?signup=incomplete_permissions')
  }
  
  return res.redirect((process.env.CLIENT_ORIGIN || 'http://localhost:5173') + '?signup=success')
})

router.get('/me', async (req,res)=>{
  if(!req.user) return res.status(401).json({error:'not_logged_in'})
  res.json({user: req.user})
})

// endpoint to get information about required scopes for frontend display
router.get('/required-permissions', (req, res) => {
  const scopes = getRequiredScopes()
  const permissionInfo = {
    scopes,
    descriptions: {
      'https://www.googleapis.com/auth/userinfo.email': 'Access to your email address',
      'https://www.googleapis.com/auth/userinfo.profile': 'Access to your basic profile info',
      'https://www.googleapis.com/auth/gmail.readonly': 'Read your emails and labels',
      'https://www.googleapis.com/auth/gmail.send': 'Send emails on your behalf (for replies)',
      'https://www.googleapis.com/auth/gmail.modify': 'Modify emails (mark as read, delete, organize)',
      'https://www.googleapis.com/auth/calendar': 'Create and manage calendar events',
      'https://www.googleapis.com/auth/tasks': 'Create and manage tasks'
    },
    features: {
      'Email Management': ['gmail.readonly', 'gmail.modify'],
      'AI-Powered Replies': ['gmail.send'],
      'Meeting Scheduling': ['calendar'],
      'Task Creation': ['tasks'],
      'Profile Access': ['userinfo.email', 'userinfo.profile']
    }
  }
  
  res.json(permissionInfo)
})

module.exports = router
