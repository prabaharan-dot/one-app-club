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
  parseMeetingRequirements,
  formatMeetingForCalendar 
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
const { createCalendarEvent } = require('../../integrations/google/actions');
const integrationUtils = require('../../utils/integrations');

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
- Has conversation history: ${context.conversationHistory?.length > 0 ? 'yes' : 'no'}

Examples:
- "schedule a meeting tomorrow at 2pm" → create_meeting
- "create weekly standup every thursday" → create_meeting  
- "remind me to call John" → create_task
- "add task: review documents" → create_task
- "what's the weather today?" → general_chat
- "help me reply to this email" → email_actions

When analyzing follow-up messages, consider the conversation history to understand context and intent.

Return ONLY the processor type (one word), nothing else.`;

    // Build conversation context for classification
    let conversationContext = '';
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      conversationContext = '\n\nRecent conversation:\n' + 
        context.conversationHistory.slice(-3).map(msg => `${msg.role}: ${msg.content.substring(0, 100)}...`).join('\n');
    }

    const userPrompt = `User input: "${input}"${conversationContext}

Additional context: ${JSON.stringify({
      hasEmailContext: !!(context.emailData || context.messageId),
      userDisplayName: context.user?.displayName,
      timeOfDay: new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening',
      conversationLength: context.conversationHistory?.length || 0
    })}

What processor type should handle this request?`;

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      
      const response = await this.llmClient.chat(messages, {
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
  async createMeetingAutomatically(meetingData, context, options) {
    try {
      console.log('🔍 Checking user authentication and Google integration...');
      
      // Get user ID from context
      const userId = context.user?.id;
      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Validate Google integration using centralized utility
      console.log('� Validating Gmail integration for user:', userId);
      const validation = await integrationUtils.validateUserIntegration(userId, 'gmail', true);

      if (!validation.hasIntegration) {
        console.warn('❌ No Gmail integration found for user:', userId);
        throw new Error('Google integration not found');
      }

      if (!validation.hasValidTokens) {
        console.warn('🔐 Invalid Gmail tokens for user:', userId);
        throw new Error(validation.errorCode === 'INVALID_TOKENS' ? 'Google authentication expired' : 'OAuth tokens not available');
      }

      const tokens = validation.integration.tokens;

      console.log('🗓️ Creating calendar event via Google Calendar API...');
      
      // Format meeting data for Google Calendar
      const calendarEvent = formatMeetingForCalendar(meetingData);
      console.log('📋 Formatted calendar event:', {
        summary: calendarEvent.summary,
        start: calendarEvent.start,
        end: calendarEvent.end
      });

      // Create the calendar event
      const createdEvent = await createCalendarEvent(tokens, calendarEvent);
      
      console.log('✅ Calendar event created successfully:', {
        eventId: createdEvent.id,
        htmlLink: createdEvent.htmlLink,
        title: createdEvent.summary
      });

      return {
        success: true,
        eventId: createdEvent.id,
        link: createdEvent.htmlLink,
        calendarEvent: createdEvent
      };

    } catch (error) {
      console.error('🚨 createMeetingAutomatically error:', {
        message: error.message,
        userId: context.user?.id,
        platform: 'gmail'
      });
      throw error;
    }
  }

  formatDateTimeForUser(datetime, timezone = 'UTC') {
    try {
      const date = new Date(datetime);
      if (isNaN(date.getTime())) {
        return datetime; // Return original if invalid
      }

      const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
        timeZone: timezone
      };

      return date.toLocaleString('en-US', options);
    } catch (error) {
      console.warn('formatDateTimeForUser error:', error);
      return datetime; // Fallback to original value
    }
  }

  async processMeetingRequest(input, context, options) {
    try {
      const meetingData = await processChatMeetingCreation(input, context, {
        llmClient: this.llmClient,
        ...options
      });

      // Automatically create the meeting if we have sufficient details
      console.log('📅 Meeting data ready, attempting to create automatically...');
      
      try {
        const createdMeeting = await this.createMeetingAutomatically(meetingData, context, options);
        
        if (createdMeeting.success) {
          const formattedDateTime = this.formatDateTimeForUser(meetingData.start_datetime, context.user?.timezone);
          
          console.log('✅ Meeting created automatically:', {
            title: meetingData.title,
            eventId: createdMeeting.eventId,
            user: context.user?.email
          });
          
          return {
            type: 'meeting_created',
            content: `✅ **Meeting Created Successfully!**

📅 **${meetingData.title}**
🕐 ${formattedDateTime}
${meetingData.location ? `📍 ${meetingData.location}` : ''}

🎉 **Added to your Google Calendar!** ${createdMeeting.link ? `[View Meeting](${createdMeeting.link})` : ''}`,
            data: {
              ...meetingData,
              calendarEventId: createdMeeting.eventId,
              calendarLink: createdMeeting.link,
              created: true,
              autoCreated: true
            }
          };
        }
      } catch (autoCreateError) {
        console.warn('⚠️ Auto-creation failed, falling back to manual confirmation:', autoCreateError.message);
        
        // Provide helpful error message based on the error type
        let errorMessage = '⚠️ I couldn\'t create it automatically, so please confirm to add it to your Google Calendar.';
        
        if (autoCreateError.message.includes('integration not found')) {
          errorMessage = '🔗 **Connect Google Account**: Go to Settings → Integrations → Connect Google Account to enable automatic meeting creation.';
        } else if (autoCreateError.message.includes('authentication expired')) {
          errorMessage = '🔄 **Reconnect Required**: Your Google account connection expired. Please reconnect in Settings → Integrations.';
        } else if (autoCreateError.message.includes('not authenticated')) {
          errorMessage = '🔐 **Login Required**: Please log in to create meetings automatically.';
        } else if (autoCreateError.message.includes('quota') || autoCreateError.message.includes('rate limit')) {
          errorMessage = '⏱️ **Temporarily Unavailable**: Google Calendar API is busy. Please try again in a moment.';
        }
        
        // If auto-creation fails, fall back to requiring user confirmation
        return {
          type: 'create_meeting',
          content: `I can help you create a meeting: "${meetingData.title}"

**Meeting Details:**
📅 **${meetingData.title}**
🕐 ${this.formatDateTimeForUser(meetingData.start_datetime, context.user?.timezone)}
📍 ${meetingData.location || 'No location specified'}

${errorMessage}`,
          data: meetingData,
          actions: [{
            type: 'create_meeting',
            label: 'Create Meeting',
            data: meetingData
          }]
        };
      }
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
      const taskData = await processTaskCreation(input, context, {
        llmClient: this.llmClient,
        user: context.user,
        db: this.db,
        ...options
      });

      // Generate appropriate response based on whether task was actually created
      let content, actions = [];
      
      if (taskData.created) {
        content = `✅ Task created successfully in Google Tasks: "${taskData.title}"`;
        if (taskData.googleTaskId) {
          content += `\n📝 Task ID: ${taskData.googleTaskId}`;
        }
      } else if (taskData.created === false && taskData.reason) {
        content = `📋 I've parsed your task: "${taskData.title}"\n⚠️ ${taskData.reason}`;
        actions = [{
          type: 'setup_integration',
          label: 'Setup Google Tasks',
          description: 'Connect Google Tasks to create tasks automatically'
        }];
      } else {
        content = `📋 I can help you create this task: "${taskData.title}"`;
        actions = [{
          type: 'create_task',
          label: 'Create Task',
          data: taskData
        }];
      }

      return {
        type: 'create_task',
        content,
        data: taskData,
        actions,
        success: taskData.created || false
      };
    } catch (error) {
      console.error('processTaskRequest error:', error);
      return {
        type: 'error',
        content: 'I had trouble understanding the task details. Could you provide more specific information like task title and any due date?',
        error: error.message
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
