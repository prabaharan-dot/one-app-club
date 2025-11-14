require('dotenv').config()
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const session = require('express-session')
const authRoutes = require('./routes/auth')

const app = express()
app.use(cors({origin:process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials:true}))
app.use(express.json())
app.use(session({secret:process.env.SESSION_SECRET || 'secret', resave:false, saveUninitialized:false}))

app.use('/api/auth', authRoutes)

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/oneappclub'
mongoose.connect(MONGO).then(()=>{
  console.log('mongo connected')
  const port = process.env.PORT || 4000
  app.listen(port, ()=> console.log('server listening', port))
}).catch(err=>{console.error(err); process.exit(1)})
