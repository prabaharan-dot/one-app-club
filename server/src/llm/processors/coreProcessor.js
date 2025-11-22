/**
 * Core processor orchestrator - coordinates different processing modules
 */

const { extractJson } = require('../utils/jsonUtils');
const { 
  processEmailActions, 
  processEmailReply, 
  extractEmailKeyInfo 
} = require('./emailProcessors');
const { 
  processChatMeetingCreation, 
  parseMeetingRequirements 
} = require('./meetingProcessors');
const { 
  processGeneralChat, 
  processTaskCreation, 
  processQuickAction,
  analyzeTextSentiment 
} = require('./generalProcessors');
const { 
  getComprehensiveContext 
} = require('./contextCollectors');
const { 
  sanitizeInput, 
  normalizeActionData,
  formatUserContextForPrompt,
  extractErrorDetails
} = require('./dataHelpers');

/**
 * Main LLM processor orchestrator
 */
class LLMProcessor {
  constructor(llmClient, db) {
    this.llmClient = llmClient;
    this.db = db;
    this.processingStats = {
      requests: 0,
      errors: 0,
      lastProcessed: null
    };
  }

  /**
   * Main processing entry point
   */
  async processLLMRequest(input, context, options = {}) {
    const startTime = Date.now();
    this.processingStats.requests++;
    
    try {
      // Sanitize input
      const cleanInput = sanitizeInput(input);
      if (!cleanInput) {
        throw new Error('Invalid or empty input');
      }

      // Detect processor type
      const processorType = await this.detectProcessorType(cleanInput, context, options);
      console.log('Detected processor type:', processorType);

      // Route to appropriate processor
      let result;
      switch (processorType) {
        case 'email_actions':
          result = await this.processEmailRequest(cleanInput, context, options);
          break;
        case 'create_meeting':
          result = await this.processMeetingRequest(cleanInput, context, options);
          break;
        case 'create_task':
          result = await this.processTaskRequest(cleanInput, context, options);
          break;
        case 'general_chat':
        default:
          result = await this.processGeneralRequest(cleanInput, context, options);
          break;
      }

      // Add metadata
      result.processingTime = Date.now() - startTime;
      result.processorType = processorType;
      this.processingStats.lastProcessed = new Date().toISOString();

      return result;
    } catch (error) {
      this.processingStats.errors++;
      console.error('processLLMRequest error:', extractErrorDetails(error));
      
      return {
        type: 'error',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Detect the appropriate processor type for the input using LLM
   */
  async detectProcessorType(input, context = {}, options = {}) {
    try {
      // If we have email context, prioritize email processing
      if (context.emailData || context.messageId) {
        return 'email_actions';
      }

      // Always use LLM for intelligent detection
      if (options.apiKey) {
        return await this.detectWithLLM(input, context, options);
      }

      // Fallback to general chat if no API key available
      console.warn('No API key provided for LLM detection, falling back to general_chat');
      return 'general_chat';
    } catch (error) {
      console.error('detectProcessorType error:', error);
      return 'general_chat';
    }
  }

  /**
   * Use LLM to intelligently detect processor type
   */
  async detectWithLLM(input, context, options) {
    const systemPrompt = `You are an intelligent request classifier for a productivity assistant. Analyze the user input and context to determine what type of processing is needed.

Available processor types:
- email_actions: User wants to take actions on emails (reply, flag, delete, etc.)
- create_meeting: User wants to create, schedule, or book meetings/appointments/events (including recurring ones)
- create_task: User wants to create tasks, reminders, or to-do items
- general_chat: General questions, conversation, or requests that don't fit other categories

Context information:
- User has email integration: ${context.user ? 'yes' : 'no'}
- Current time: ${new Date().toISOString()}
- User timezone: ${context.user?.timezone || 'unknown'}

Examples:
- "schedule a meeting tomorrow at 2pm" → create_meeting
- "create weekly standup every thursday" → create_meeting  
- "remind me to call John" → create_task
- "add task: review documents" → create_task
- "what's the weather today?" → general_chat
- "help me reply to this email" → email_actions

Return ONLY the processor type (one word), nothing else.`;

    const userPrompt = `User input: "${input}"

Additional context: ${JSON.stringify({
      hasEmailContext: !!(context.emailData || context.messageId),
      userDisplayName: context.user?.displayName,
      timeOfDay: new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'
    })}

What processor type should handle this request?`;

    try {
      const response = await this.llmClient.chat(systemPrompt, userPrompt, {
        apiKey: options.apiKey,
        model: options.model || 'gpt-4o-mini',
        temperature: 0.1, // Low temperature for consistent classification
        maxTokens: 10     // We only need one word
      });

      const detectedType = response.toLowerCase().trim();
      const validTypes = ['email_actions', 'create_meeting', 'create_task', 'general_chat'];
      
      if (validTypes.includes(detectedType)) {
        console.log(`LLM detected processor type: ${detectedType} for input: "${input.substring(0, 50)}..."`);
        return detectedType;
      }
      
      console.warn(`LLM returned invalid processor type: "${detectedType}", falling back to general_chat`);
      return 'general_chat';
    } catch (error) {
      console.error('detectWithLLM error:', error);
      return 'general_chat';
    }
  }

  /**
   * Process email-related requests
   */
  async processEmailRequest(input, context, options) {
    if (context.emailData) {
      // Process specific email for actions
      return await processEmailActions(context.user, context.emailData, {
        llmClient: this.llmClient,
        ...options
      });
    } else {
      // General email management query
      return await processGeneralChat(input, context, {
        llmClient: this.llmClient,
        ...options
      });
    }
  }

  /**
   * Process meeting creation requests
   */
  async processMeetingRequest(input, context, options) {
    try {
      const meetingData = await processChatMeetingCreation(input, {
        llmClient: this.llmClient,
        ...options
      });

      return {
        type: 'create_meeting',
        content: `I can help you create a meeting: "${meetingData.title}"`,
        data: meetingData,
        actions: [{
          type: 'create_meeting',
          label: 'Create Meeting',
          data: meetingData
        }]
      };
    } catch (error) {
      console.error('processMeetingRequest error:', error);
      return {
        type: 'error',
        content: 'I had trouble understanding the meeting details. Could you provide more specific information like date, time, and title?'
      };
    }
  }

  /**
   * Process task creation requests
   */
  async processTaskRequest(input, context, options) {
    try {
      const taskData = await processTaskCreation(input, {
        llmClient: this.llmClient,
        ...options
      });

      return {
        type: 'create_task',
        content: `I can help you create this task: "${taskData.title}"`,
        data: taskData,
        actions: [{
          type: 'create_task',
          label: 'Create Task',
          data: taskData
        }]
      };
    } catch (error) {
      console.error('processTaskRequest error:', error);
      return {
        type: 'error',
        content: 'I had trouble understanding the task details. Could you provide more information?'
      };
    }
  }

  /**
   * Process general chat requests
   */
  async processGeneralRequest(input, context, options) {
    return await processGeneralChat(input, context, {
      llmClient: this.llmClient,
      ...options
    });
  }

  /**
   * Get processor statistics
   */
  getStats() {
    return { ...this.processingStats };
  }

  /**
   * Reset processor statistics
   */
  resetStats() {
    this.processingStats = {
      requests: 0,
      errors: 0,
      lastProcessed: null
    };
  }
}

// Legacy function exports for backward compatibility
async function processEmail(user, emailData, options = {}) {
  const processor = new LLMProcessor(options.llmClient);
  return await processEmailActions(user, emailData, options);
}

module.exports = {
  LLMProcessor,
  processEmail, // Legacy export
  extractJson,
  parseMeetingRequirements,
  analyzeTextSentiment,
  sanitizeInput,
  normalizeActionData
};
