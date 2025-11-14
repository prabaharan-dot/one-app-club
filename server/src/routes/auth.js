const express = require('express')
const router = express.Router()
const {google} = require('googleapis')
const tenantsService = require('../services/tenants')
const usersService = require('../services/users')
const integrationsService = require('../services/integrations')

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = process.env.GOOGLE_REDIRECT || 'http://localhost:4000/api/auth/oauth2callback'

function oauthClient(){
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

router.get('/url', (req, res) =>{
  const o = oauthClient()
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks'
  ]
  const url = o.generateAuthUrl({access_type:'offline', scope:scopes, prompt:'consent'})
  res.json({url})
})

// new signup endpoint to begin google oauth for signup
router.get('/signup', (req,res)=>{
  const o = oauthClient()
  const scopes = ['https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile','https://www.googleapis.com/auth/gmail.readonly']
  const url = o.generateAuthUrl({access_type:'offline', scope:scopes, prompt:'consent'})
  res.redirect(url)
})

router.get('/oauth2callback', async (req, res)=>{
  const code = req.query.code
  if(!code) return res.status(400).send('missing code')
  const o = oauthClient()
  const {tokens} = await o.getToken(code)
  o.setCredentials(tokens)
  const oauth2 = google.oauth2({auth:o, version:'v2'})
  const profile = await oauth2.userinfo.get()
  const userInfo = profile.data

  // upsert tenant, user and integration
  const domain = userInfo.email
  // create tenant using user's name and email domain
  const tenantId = await tenantsService.getOrCreateTenant(domain, userInfo.name || domain)
  const userId = await usersService.upsertUserByEmail(userInfo.email, userInfo.name, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', tenantId)
  const tokenBlob = Buffer.from(JSON.stringify(tokens))
  await integrationsService.upsertIntegration(tenantId, 'gmail', userInfo.id, tokenBlob, {scopes:[]})

  // set session
  req.session.userId = userId
  req.session.tenantId = tenantId
  return res.redirect(process.env.CLIENT_ORIGIN || 'http://localhost:5173')
})

router.get('/me', async (req,res)=>{
  if(!req.session.userId) return res.status(401).json({error:'not_logged_in'})
  const user = await usersService.getUserById(req.session.userId)
  res.json({user})
})

module.exports = router
