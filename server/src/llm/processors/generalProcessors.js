const { extractJson } = require('../utils/jsonUtils');

/**
 * General-purpose processor functions for various chat and text processing tasks
 */

/**
 * Process general chat requests that don't fit other categories
 */
async function processGeneralChat(input, context, options = {}) {
  const { llmClient } = options;

  const systemPrompt = `You are a helpful assistant for a productivity app that manages emails, calendar, and tasks.

Provide helpful, concise responses. If the user is asking about:
- Email management: Suggest checking email widgets or processing pending messages
- Calendar events: Offer to help create meetings or check calendar
- Tasks: Suggest task creation or management
- General questions: Provide helpful information

Keep responses conversational and actionable. Use the conversation history to maintain context and provide relevant follow-up responses.`;

  try {
    // Build messages array with conversation history
    const messages = [{ role: 'system', content: systemPrompt }];

    // Include conversation history for context
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      // Add recent conversation history (last 5 messages to keep context manageable)
      const recentHistory = context.conversationHistory.slice(-5);
      messages.push(...recentHistory);
    }

    // Add current user input
    messages.push({ role: 'user', content: input });
    
    const response = await llmClient.chat(messages, {
      apiKey: options.apiKey,
      model: options.model
    });

    return {
      type: 'chat_response',
      response: response,
      content: response,
      actions: []
    };
  } catch (error) {
    console.error('processGeneralChat error:', error);
    return {
      type: 'chat_response',
      response: 'I apologize, but I encountered an error processing your request. Please try again.',
      content: 'I apologize, but I encountered an error processing your request. Please try again.',
      actions: []
    };
  }
}

/**
 * Create task in Google Tasks API
 */
async function createGoogleTask(taskData, googleAuth, options = {}) {
  try {
    const { google } = require('googleapis');
    const tasks = google.tasks({ version: 'v1', auth: googleAuth });

    // Prepare task for Google Tasks API
    const googleTask = {
      title: taskData.title,
      notes: taskData.description || '',
    };

    // Add due date if provided
    if (taskData.due_date) {
      const dueDate = new Date(taskData.due_date);
      if (!isNaN(dueDate.getTime())) {
        // Google Tasks expects RFC 3339 timestamp
        googleTask.due = dueDate.toISOString();
      }
    }

    // Create task in default task list
    const result = await tasks.tasks.insert({
      tasklist: '@default',
      resource: googleTask
    });

    console.log('✅ Google Task created:', result.data.id);
    
    return {
      success: true,
      taskId: result.data.id,
      title: result.data.title,
      googleTask: result.data
    };
  } catch (error) {
    console.error('❌ Google Tasks API error:', error);
    throw new Error(`Failed to create Google Task: ${error.message}`);
  }
}

/**
 * Process task creation requests and create in Google Tasks
 */
async function processTaskCreation(input, context, options = {}) {
  const { llmClient, user, db } = options;

  const systemPrompt = `You are a task management assistant. Parse task creation requests from natural language.

Extract task details and return ONLY valid JSON:
{
  "title": "task title",
  "description": "detailed description",
  "due_date": "ISO date string (YYYY-MM-DD) or null",
  "priority": "high|medium|low",
  "category": "work|personal|urgent|other"
}

Rules:
- Title should be concise and actionable
- Description can be more detailed
- Due date only if mentioned or implied
- Default priority is medium
- Choose appropriate category
- Use conversation history to gather complete task details`;

  try {
    // Build messages array with conversation history for better context
    const messages = [{ role: 'system', content: systemPrompt }];

    // Include recent conversation history for context (last 3 messages)
    if (context?.conversationHistory && context.conversationHistory.length > 0) {
      const recentHistory = context.conversationHistory.slice(-3);
      messages.push(...recentHistory);
    }

    // Add current user input
    messages.push({ role: 'user', content: input });
    
    const response = await llmClient.chat(messages, {
      apiKey: options.apiKey,
      model: options.model
    });

    const result = extractJson(response);
    if (!result || !result.title) {
      throw new Error('Invalid task data extracted');
    }

    // If user and db are provided, try to create the task in Google Tasks
    if (user && db) {
      try {
        // Get user's Google integration (use same pattern as calendar integration)
        const integrationRes = await db.query(
          'SELECT oauth_token_encrypted FROM integrations WHERE user_id = $1 AND platform = $2 AND enabled = true',
          [user.id, 'gmail']
        );

        if (integrationRes.rows.length > 0) {
          // Parse the stored OAuth tokens
          const tokens = JSON.parse(integrationRes.rows[0].oauth_token_encrypted.toString());
          
          // Create Google Auth with proper client credentials (same as calendar code)
          const { google } = require('googleapis');
          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
          );
          
          // Set the user's credentials
          oauth2Client.setCredentials(tokens);

          // Create the task in Google Tasks
          const googleTaskResult = await createGoogleTask(result, oauth2Client, options);
          
          // Add Google task info to result
          result.googleTaskId = googleTaskResult.taskId;
          result.created = true;
          result.platform = 'google_tasks';
        } else {
          console.warn('No Google integration found for user, task parsed but not created');
          result.created = false;
          result.reason = 'No Google Tasks integration';
        }
      } catch (googleError) {
        console.error('Failed to create Google Task, returning parsed data:', googleError);
        result.created = false;
        result.error = googleError.message;
      }
    } else {
      result.created = false;
      result.reason = 'No user context provided';
    }

    return result;
  } catch (error) {
    console.error('processTaskCreation error:', error);
    throw new Error('Could not parse task request');
  }
}

/**
 * Process quick actions and commands
 */
async function processQuickAction(input, options = {}) {
  const { llmClient } = options;

  const systemPrompt = `You are an action parser for a productivity app. Identify what action the user wants to take.

Return ONLY valid JSON:
{
  "action_type": "email_check|create_meeting|create_task|calendar_view|help|unknown",
  "confidence": 0.1-1.0,
  "parameters": {}
}

Action types:
- email_check: User wants to check or manage emails
- create_meeting: User wants to schedule a meeting
- create_task: User wants to create a task
- calendar_view: User wants to see calendar
- help: User needs help or instructions
- unknown: Cannot determine action`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input }
    ];
    
    const response = await llmClient.chat(messages, {
      apiKey: options.apiKey,
      model: options.model
    });

    return extractJson(response) || {
      action_type: 'unknown',
      confidence: 0.1,
      parameters: {}
    };
  } catch (error) {
    console.error('processQuickAction error:', error);
    return {
      action_type: 'unknown',
      confidence: 0.1,
      parameters: {}
    };
  }
}

/**
 * Generate smart suggestions based on user context
 */
async function generateSmartSuggestions(userContext, options = {}) {
  const { llmClient } = options;

  const systemPrompt = `You are a productivity assistant. Based on user context, generate helpful suggestions.

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "type": "email|calendar|task|general",
      "title": "suggestion title",
      "description": "what this does",
      "action": "specific action to take"
    }
  ]
}

Generate 2-4 relevant suggestions based on:
- Pending emails
- Upcoming calendar events  
- Current time/day
- User activity patterns`;

  const contextPrompt = `User context:
- Current time: ${new Date().toISOString()}
- Pending emails: ${userContext.pendingEmails || 0}
- Upcoming events: ${userContext.upcomingEvents || 0}
- Last activity: ${userContext.lastActivity || 'unknown'}

Generate helpful suggestions.`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextPrompt }
    ];
    
    const response = await llmClient.chat(messages, {
      apiKey: options.apiKey,
      model: options.model
    });

    const result = extractJson(response);
    return result?.suggestions || [];
  } catch (error) {
    console.error('generateSmartSuggestions error:', error);
    return [];
  }
}

/**
 * Analyze text sentiment and intent
 */
function analyzeTextSentiment(text) {
  const analysis = {
    sentiment: 'neutral',
    urgency: 'normal',
    intent: 'informational',
    confidence: 0.5
  };

  const lowerText = text.toLowerCase();

  // Sentiment analysis
  const positiveWords = ['great', 'excellent', 'good', 'happy', 'pleased', 'perfect', 'wonderful'];
  const negativeWords = ['bad', 'terrible', 'awful', 'disappointed', 'angry', 'frustrated', 'horrible'];
  
  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;

  if (positiveCount > negativeCount) {
    analysis.sentiment = 'positive';
  } else if (negativeCount > positiveCount) {
    analysis.sentiment = 'negative';
  }

  // Urgency analysis
  const urgentWords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'rush', 'quickly'];
  if (urgentWords.some(word => lowerText.includes(word))) {
    analysis.urgency = 'high';
  }

  // Intent analysis
  const actionWords = ['create', 'schedule', 'book', 'add', 'make', 'set up'];
  const questionWords = ['what', 'when', 'where', 'how', 'why', 'which'];

  if (actionWords.some(word => lowerText.includes(word))) {
    analysis.intent = 'action';
  } else if (questionWords.some(word => lowerText.includes(word))) {
    analysis.intent = 'question';
  } else if (lowerText.includes('?')) {
    analysis.intent = 'question';
  }

  // Calculate confidence based on keyword matches
  const totalKeywords = positiveWords.length + negativeWords.length + urgentWords.length + actionWords.length + questionWords.length;
  const matchedKeywords = positiveCount + negativeCount + 
    (urgentWords.some(word => lowerText.includes(word)) ? 1 : 0) +
    (actionWords.some(word => lowerText.includes(word)) ? 1 : 0) +
    (questionWords.some(word => lowerText.includes(word)) ? 1 : 0);

  analysis.confidence = Math.min(0.9, 0.3 + (matchedKeywords / totalKeywords) * 0.6);

  return analysis;
}

module.exports = {
  processGeneralChat,
  processTaskCreation,
  createGoogleTask,
  processQuickAction,
  generateSmartSuggestions,
  analyzeTextSentiment
};
