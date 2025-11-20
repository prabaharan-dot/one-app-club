const axios = require('axios')

async function testChat() {
  try {
    console.log('Testing chat functionality...')
    
    // Test the intelligent endpoint with a simple greeting
    const response = await axios.post('http://localhost:4000/api/llm/intelligent', {
      message: 'hello',
      context: {}
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=s%3A2f7c8b1e-567d-8a2b-9c1e-3b4a5f6c7d8e.abcd1234efgh5678ijkl9012mnop3456qrst7890' // Mock session
      }
    })
    
    console.log('Response status:', response.status)
    console.log('Response data:', JSON.stringify(response.data, null, 2))
    
  } catch (error) {
    if (error.response) {
      console.error('Error response:', error.response.status, error.response.data)
    } else {
      console.error('Error:', error.message)
    }
  }
}

testChat()
