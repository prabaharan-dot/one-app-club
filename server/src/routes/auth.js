const express = require('express')
const router = express.Router()
const {google} = require('googleapis')
const User = require('../models/User')

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

router.get('/oauth2callback', async (req, res)=>{
  const code = req.query.code
  if(!code) return res.status(400).send('missing code')
  const o = oauthClient()
  const {tokens} = await o.getToken(code)
  o.setCredentials(tokens)
  const oauth2 = google.oauth2({auth:o, version:'v2'})
  const profile = await oauth2.userinfo.get()
  const userInfo = profile.data
  let user = await User.findOne({googleId:userInfo.id})
  if(!user){
    user = await User.create({googleId:userInfo.id, email:userInfo.email, name:userInfo.name, avatar:userInfo.picture, tokens})
  }else{
    user.tokens = tokens
    await user.save()
  }
  // store user in session
  req.session.userId = user._id
  // redirect to client
  return res.redirect(process.env.CLIENT_ORIGIN || 'http://localhost:5173')
})

router.get('/me', async (req,res)=>{
  if(!req.session.userId) return res.status(401).json({error:'not_logged_in'})
  const user = await User.findById(req.session.userId).select('-tokens')
  res.json({user})
})

module.exports = router
