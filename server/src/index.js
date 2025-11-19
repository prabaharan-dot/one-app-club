require('dotenv').config()
const express = require('express')
const cors = require('cors')
const session = require('express-session')
const authRoutes = require('./routes/auth')
const settingsRoutes = require('./routes/settings')
const googlePoller = require('./integrations/google/poller')
const llmProcessingJob = require('./jobs/llmProcessingJob')
const db = require('./db')
const fs = require('fs')

const app = express()
app.use(cors({origin:process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials:true}))
app.use(express.json())
app.use(session({secret:process.env.SESSION_SECRET || 'secret', resave:true, saveUninitialized:false}))

app.use('/api/auth', authRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/messages', require('./routes/messages'))
app.use('/api/llm', require('./routes/llm'))

async function start(){
  try{
    // run migrations if file exists
    const migration = fs.readFileSync(__dirname + '/migration.sql','utf8')
    await db.query(migration)
    console.log('migrations applied')

    const port = process.env.PORT || 4000
    app.listen(port, ()=>{
      console.log('server listening', port)
      
      // Start background jobs
      googlePoller.start()
      // llmProcessingJob.start()
    })
  }catch(e){
    console.error('failed to start', e)
    process.exit(1)
  }
}

start()
