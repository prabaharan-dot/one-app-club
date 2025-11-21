const llmProcessor = require('../src/llm/processor')

// Test the enhanced email actions processing
async function testEnhancedEmailActions() {
  console.log('Testing enhanced email actions processing...')
  
  const testUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    display_name: 'Test User',
    preferences: {
      high_priority_senders: ['boss@company.com', 'urgent@client.com'],
      auto_archive_newsletters: true
    }
  }
  
  const testEmails = [
    {
      id: 'test-email-1',
      from: 'boss@company.com',
      subject: 'URGENT: Project deadline moved to Friday',
      snippet: 'Hi team, due to client requirements the project deadline has been moved up...',
      body: `Hi team,

Due to client requirements, the project deadline has been moved up to this Friday. We need to:

1. Complete the final testing by Wednesday
2. Prepare the deployment package by Thursday morning
3. Schedule a team meeting for tomorrow at 2 PM to discuss the accelerated timeline

Please confirm your availability for the meeting and let me know if you have any concerns about meeting the new deadline.

Best regards,
Sarah`
    },
    {
      id: 'test-email-2', 
      from: 'newsletter@techcrunch.com',
      subject: 'Daily Newsletter: Top Tech Stories',
      snippet: 'Here are today\'s top technology stories and startup news...',
      body: `Welcome to TechCrunch Daily Newsletter

Here are today's top technology stories:

• AI startup raises $50M Series A
• New iPhone features leaked ahead of launch
• Tech giants report Q3 earnings
• Cybersecurity breach affects millions

Read more at techcrunch.com

Unsubscribe | Manage preferences`
    },
    {
      id: 'test-email-3',
      from: 'client@importantcorp.com', 
      subject: 'Meeting request for next week',
      snippet: 'I would like to schedule a meeting to discuss the project proposal...',
      body: `Hi,

I would like to schedule a meeting next week to discuss the project proposal we submitted last month. 

Would Tuesday or Wednesday afternoon work for you? The meeting should take about 1 hour and we can do it via Zoom or in person at our office.

Please let me know your availability.

Thanks,
John Smith
Important Corp`
    }
  ]
  
  // Test each email
  for (const email of testEmails) {
    console.log(`\n--- Processing: ${email.subject} ---`)
    
    try {
      const result = await llmProcessor.processLLMRequest('email_actions', testUser, { email }, {
        apiKey: process.env.OPENAI_API_KEY || 'test-key',
        model: 'gpt-4o-mini'
      })
      
      console.log('✅ Result:', JSON.stringify(result, null, 2))
      
      // Validate structure
      if (result.type === 'email_actions') {
        console.log(`📊 Summary: ${result.summary}`)
        console.log(`🎯 Priority: ${result.priority_level}`)
        console.log(`📁 Category: ${result.category}`)
        console.log(`😊 Sentiment: ${result.sentiment}`)
        console.log(`🔧 Actions (${result.suggested_actions.length}):`)
        
        result.suggested_actions.forEach((action, idx) => {
          console.log(`   ${idx + 1}. ${action.title} (${action.type}) - Confidence: ${action.confidence}`)
          console.log(`      Reasoning: ${action.reasoning}`)
        })
      }
      
    } catch (error) {
      console.error('❌ Error processing email:', error.message)
    }
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testEnhancedEmailActions().catch(console.error)
}

module.exports = { testEnhancedEmailActions }
