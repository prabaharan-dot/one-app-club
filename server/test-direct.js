// Simple test script to test LLM processor directly
require('dotenv').config()
const llmProcessor = require('./src/llm/processor')

async function testChatDirect() {
  try {
    console.log('Testing LLM processor directly...')
    
    // Mock user object
    const user = {
      id: 'test-user-123',
      email: 'test@example.com',
      display_name: 'Test User'
    }
    
    // Test parameters
    const params = {
      message: 'hello',
      context: {}
    }
    
    const result = await llmProcessor.processLLMRequest('chat_response', user, params, {})
    
    console.log('Direct LLM result:', JSON.stringify(result, null, 2))
    
  } catch (error) {
    console.error('Direct test error:', error.message)
    console.error('Stack:', error.stack)
  }
}

testChatDirect()
