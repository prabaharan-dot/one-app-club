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

Keep responses conversational and actionable.`;

  try {
    const response = await llmClient.chat(systemPrompt, input, {
      apiKey: options.apiKey,
      model: options.model
    });

    return {
      type: 'general_response',
      content: response,
      actions: []
    };
  } catch (error) {
    console.error('processGeneralChat error:', error);
    return {
      type: 'general_response',
      content: 'I apologize, but I encountered an error processing your request. Please try again.',
      actions: []
    };
  }
}

/**
 * Process task creation requests
 */
async function processTaskCreation(input, options = {}) {
  const { llmClient } = options;

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
- Choose appropriate category`;

  try {
    const response = await llmClient.chat(systemPrompt, input, {
      apiKey: options.apiKey,
      model: options.model
    });

    const result = extractJson(response);
    if (!result || !result.title) {
      throw new Error('Invalid task data extracted');
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
    const response = await llmClient.chat(systemPrompt, input, {
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
    const response = await llmClient.chat(systemPrompt, contextPrompt, {
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
  processQuickAction,
  generateSmartSuggestions,
  analyzeTextSentiment
};
