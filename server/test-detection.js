// Test intelligent processor type detection
const llm = require('./src/llm/llmClient')

// Mock user and database for testing
const mockUser = {
  id: 'test-user',
  email: 'test@example.com',
  display_name: 'Test User',
  timezone: 'UTC'
}

// Mock LLM response for testing
const mockLLM = {
  async chat(messages, opts) {
    const userMessage = messages[1].content.toLowerCase()
    
    // Simple mock responses based on content
    if (userMessage.includes('summarize') && userMessage.includes('email')) {
      return 'email_summary'
    } else if (userMessage.includes('brief') && userMessage.includes('day')) {
      return 'daily_briefing'  
    } else if (userMessage.includes('reply') && userMessage.includes('email')) {
      return 'email_actions'
    } else if (userMessage.includes('meeting') && userMessage.includes('notes')) {
      return 'meeting_notes'
    } else {
      return 'chat_response'
    }
  }
}

// Test cases
const testMessages = [
  'Hello, how are you?',
  'Can you summarize my emails from today?',
  'I need a daily briefing to start my day',
  'Help me reply to emails from my boss',
  'Process these meeting notes from our standup',
  'What should I focus on today?',
  'Show me yesterday\'s email summary',
  'Brief me for the morning'
]

async function testProcessorDetection() {
  console.log('Testing Intelligent Processor Type Detection\n')
  
  // Import the fallback detection function
  function fallbackProcessorDetection(message) {
    const msg = message.toLowerCase().trim()
    
    // Email summary patterns
    if (msg.match(/\b(summarize?|summary|overview|digest)\b.*\b(email|mail|message)s?\b/i) ||
        msg.match(/\b(today'?s?|yesterday'?s?|this week'?s?)\s+(email|mail|message)s?\b/i) ||
        msg.match(/\bwhat.*email.*received?\b/i) ||
        msg.match(/\bhow many.*email/i)) {
      return 'email_summary'
    }
    
    // Daily briefing patterns  
    if (msg.match(/\b(brief|briefing|prep|prepare|ready|start|begin).*day\b/i) ||
        msg.match(/\b(morning|daily)\s+(brief|briefing|update|overview|summary)\b/i) ||
        msg.match(/\bwhat.*today\b/i) ||
        msg.match(/\bget.*ready.*day\b/i) ||
        msg.match(/\bpriority|priorities.*today\b/i)) {
      return 'daily_briefing'
    }
    
    // Email actions patterns
    if (msg.match(/\b(reply|respond|answer|forward|delete|archive|flag|mark)\b.*\b(email|mail|message)\b/i) ||
        msg.match(/\b(create|schedule|add).*\b(task|event|meeting|appointment)\b.*\bemail\b/i) ||
        msg.match(/\baction.*email/i)) {
      return 'email_actions'
    }
    
    // Meeting notes patterns
    if (msg.match(/\b(meeting|call|conference)\s+(notes?|transcript|summary|minutes)\b/i) ||
        msg.match(/\bprocess.*\b(meeting|transcript|notes?)\b/i) ||
        msg.match(/\b(action items?|decisions?|takeaways?).*meeting\b/i)) {
      return 'meeting_notes'
    }
    
    // Default to chat response
    return 'chat_response'
  }
  
  for (const message of testMessages) {
    const detectedType = fallbackProcessorDetection(message)
    console.log(`Message: "${message}"`)
    console.log(`Detected: ${detectedType}\n`)
  }
}

testProcessorDetection()
