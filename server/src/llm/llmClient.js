const fetch = global.fetch || require('node-fetch')

const GLOBAL_OPENAI_KEY = process.env.OPENAI_API_KEY
const GLOBAL_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

if (!GLOBAL_OPENAI_KEY) {
  console.warn('OPENAI_API_KEY not set — LLM calls will fail until provided unless per-user keys are supplied.')
}

async function chat(messages = [], opts = {}) {
  const apiKey = opts.apiKey || GLOBAL_OPENAI_KEY
  const model = opts.model || GLOBAL_MODEL
  if (!apiKey) throw new Error('Missing OpenAI API key for LLM call')

  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 800,
    ...opts.extra
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`LLM error ${res.status}: ${t}`)
  }

  const json = await res.json()
  const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content
  return content
}

module.exports = { chat }