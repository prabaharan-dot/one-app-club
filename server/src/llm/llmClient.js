const { OpenAI } = require('openai')

const GLOBAL_OPENAI_KEY = process.env.OPENAI_API_KEY
const GLOBAL_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

if (!GLOBAL_OPENAI_KEY) {
  console.warn('OPENAI_API_KEY not set — LLM calls will fail.')
}

async function chat(messages = [], opts = {}) {
  const apiKey = GLOBAL_OPENAI_KEY
  const model =  GLOBAL_MODEL
  
  if (!apiKey) throw new Error('Missing OpenAI API key for LLM call')
  console.log(model)

  const client = new OpenAI({ apiKey })

  const payload = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 800,
    temperature: opts.temperature,
    ...opts.extra
  }

  try {
    const res = await client.chat.completions.create(payload)
    // support typical response shape
    const content = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content
    return content
  } catch (err) {
    // surface useful error text
    const msg = err && err.message ? err.message : String(err)
    throw new Error(`LLM error: ${msg}`)
  }
}

module.exports = { chat }