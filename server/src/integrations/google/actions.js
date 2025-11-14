const {google} = require('googleapis')

function oauthClientFromTokens(tokens){
  const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  o.setCredentials(tokens)
  return o
}

async function createCalendarEvent(tokens, event){
  const o = oauthClientFromTokens(tokens)
  const calendar = google.calendar({version:'v3', auth:o})
  const res = await calendar.events.insert({calendarId:'primary', requestBody: event})
  return res.data
}

async function sendGmail(tokens, rawMessage){
  const o = oauthClientFromTokens(tokens)
  const gmail = google.gmail({version:'v1', auth:o})
  const res = await gmail.users.messages.send({userId:'me', requestBody:{raw: rawMessage}})
  return res.data
}

async function createTask(tokens, task){
  const o = oauthClientFromTokens(tokens)
  const tasks = google.tasks({version:'v1', auth:o})
  const res = await tasks.tasks.insert({tasklist:'@default', requestBody:task})
  return res.data
}

module.exports = { createCalendarEvent, sendGmail, createTask }
