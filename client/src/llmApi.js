// LLM API utilities for One App Club client

const SERVER_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost') ? 
  `${window.location.protocol}//${window.location.hostname}:4000` : ''

export const LLMApi = {
  // Generic LLM processor
  async process(type, params = {}) {
    const res = await fetch(`${SERVER_BASE}/api/llm/process`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, params })
    })
    if (!res.ok) throw new Error('LLM processing failed')
    return res.json()
  },

  // Email summary (quick endpoint)
  async getEmailSummary(timeframe = 'today', limit = 50) {
    const res = await fetch(`${SERVER_BASE}/api/llm/summary/${timeframe}?limit=${limit}`, {
      credentials: 'include'
    })
    if (!res.ok) throw new Error('Email summary failed')
    return res.json()
  },

  // Daily briefing (cached)
  async getDailyBriefing() {
    const res = await fetch(`${SERVER_BASE}/api/llm/briefing`, {
      credentials: 'include'
    })
    if (!res.ok) throw new Error('Daily briefing failed')
    return res.json()
  },

  // Chat interaction
  async sendChatMessage(message, context = {}) {
    const res = await fetch(`${SERVER_BASE}/api/llm/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context })
    })
    if (!res.ok) throw new Error('Chat processing failed')
    return res.json()
  },

  // Get processor stats and available types
  async getStats() {
    const res = await fetch(`${SERVER_BASE}/api/llm/stats`, {
      credentials: 'include'
    })
    if (!res.ok) throw new Error('Stats retrieval failed')
    return res.json()
  },

  // Specialized processor calls
  async processEmailActions(email) {
    return this.process('email_actions', { email })
  },

  async processMeetingNotes(meetingId, transcript) {
    return this.process('meeting_notes', { meetingId, transcript })
  }
}

export default LLMApi
