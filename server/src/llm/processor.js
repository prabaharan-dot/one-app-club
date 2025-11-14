const llm = require('./llmClient')

/*
 Expected output from the model: must be valid JSON object ONLY, e.g.

 {
   "actions": [
     {"type":"flag","reason":"from VIP","labels":["HIGH_PRIORITY"]},
     {"type":"create_task","title":"Follow up on invoice","notes":"..."},
     {"type":"create_event","title":"Discuss billing","start":"2025-11-15T15:00:00Z","end":"2025-11-15T15:30:00Z"},
     {"type":"reply","subject":"Re: ...","body":"Thanks — I'll take this up.", "send":true}
   ]
 }
*/
async function processEmail(user = {}, email = {}) {
  const prefs = user.preferences || {}
  const sys = `You are an assistant that decides programmatic actions for incoming emails based on a user's preferences.
Return a JSON object with an "actions" array. Allowed action types: flag, create_task, create_event, reply, mark_read, set_priority.
Do not include explanation or text outside the JSON. Each action should include only fields necessary for execution.`

  const userMessage = `
User preferences: ${JSON.stringify(prefs)}
Email:
- id: ${email.id || ''}
- from: ${email.from || ''}
- subject: ${email.subject || ''}
- snippet: ${email.snippet || ''}
- body: ${email.body ? email.body.slice(0, 4000) : ''}
Decide what automated actions should be taken now. Consider:
- If sender is in high_priority_senders list mark priority.
- If content implies an immediate task create_task with title and notes.
- If content implies scheduling create_event with approximate times (ISO).
- If reply is simple canned ack include reply action.
Return strict JSON only.
  `

  try {
    const raw = await llm.chat([
      {role: 'system', content: sys},
      {role: 'user', content: userMessage}
    ], {temperature: 0})

    // Safely parse JSON — sometimes LLMs include surrounding text, so extract first JSON blob.
    const jsonText = extractJson(raw)
    const parsed = JSON.parse(jsonText)
    return parsed
  } catch (err) {
    console.error('LLM processing failed', err.message || err)
    return { actions: [] }
  }
}

function extractJson(text = '') {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('No JSON found in LLM response')
  return text.slice(first, last + 1)
}

module.exports = { processEmail }