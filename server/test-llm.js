const llmProcessor = require('./src/llm/processor')
const db = require('./src/db')

async function testLLMParsing() {
  console.log('🧪 Testing LLM meeting parsing...')
  
  // Mock user object
  const user = {
    id: 'ec5ea4d4-ab0d-414c-9caf-4a65c44c634b',
    email: 'praba.happyfox@gmail.com',
    timezone: 'Europe/London'
  }
  
  const meetingText = 'every thursday 9 to 9.30am'
  
  try {
    // Get user's LLM key
    const llmKey = await db.query('SELECT llm_key_encrypted FROM user_settings WHERE user_id = $1', [user.id])
    
    if (llmKey.rows[0]?.llm_key_encrypted) {
      const apiKey = llmKey.rows[0].llm_key_encrypted.toString()
      console.log(`📋 User has LLM key: ${apiKey ? 'YES' : 'NO'}`)
      
      console.log(`📝 Testing with input: "${meetingText}"`)
      const result = await llmProcessor.parseMeetingRequirements(user, meetingText, { apiKey })
      
      console.log('✅ LLM parsing result:', JSON.stringify(result, null, 2))
    } else {
      console.log('❌ No LLM key found for user')
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error('Full error:', error)
  }
  
  process.exit(0)
}

testLLMParsing()
