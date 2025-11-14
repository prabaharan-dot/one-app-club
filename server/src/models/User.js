const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  googleId: {type:String, index:true, unique:true, sparse:true},
  email: {type:String, index:true, unique:true, sparse:true},
  name: String,
  avatar: String,
  tokens: Object, // store OAuth tokens
  connectedApps: [String],
  createdAt: {type:Date, default:Date.now}
})

module.exports = mongoose.model('User', UserSchema)
