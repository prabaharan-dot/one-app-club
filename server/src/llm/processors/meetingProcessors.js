const { extractJson } = require('../utils/jsonUtils');

/**
 * Meeting and calendar-specific processor functions
 */

/**
 * Process chat input for meeting creation
 */
async function processChatMeetingCreation(input, context, options = {}) {
  const { llmClient } = options;

  const systemPrompt = `You are a calendar assistant. Parse meeting requests from natural language and return ONLY valid JSON.

Current date/time: ${new Date().toISOString()}

IMPORTANT: Only generate a meeting if the request contains SPECIFIC date and time information. If date/time is missing or vague, return: {"error": "missing_datetime"}

Required JSON format when date/time is present:
{
  "title": "meeting title",
  "description": "optional description", 
  "start_datetime": "ISO string (YYYY-MM-DDTHH:mm:ss)",
  "end_datetime": "ISO string (YYYY-MM-DDTHH:mm:ss)",
  "location": "optional location"
}

Examples:
Input: "schedule a meeting tomorrow at 2pm"
Output: {"title":"Meeting","start_datetime":"2025-11-24T14:00:00","end_datetime":"2025-11-24T14:30:00"}

Input: "create a meeting tomorrow 9am"
Output: {"title":"Meeting","start_datetime":"2025-11-24T09:00:00","end_datetime":"2025-11-24T09:30:00"}

Input: "book team standup friday 9am"
Output: {"title":"Team standup","start_datetime":"2025-11-29T09:00:00","end_datetime":"2025-11-29T09:30:00"}

Input: "schedule a meeting" (no time specified)
Output: {"error": "missing_datetime"}

Input: "let's meet sometime" (vague time)
Output: {"error": "missing_datetime"}

Rules:
- ONLY create meeting JSON if specific date AND time are provided
- Accept various time formats: "9am", "9:00am", "09:00", "9 am"
- Accept date keywords: "tomorrow", "today", day names (monday, friday, etc.)
- Tomorrow = ${new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0]}
- Use current year ${new Date().getFullYear()} for dates
- Default duration: 30 minutes if not specified
- Convert to ISO string format (YYYY-MM-DDTHH:mm:ss)
- Return error JSON if date/time missing or vague
- Return ONLY the JSON object, no other text`;

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
    
    console.log('📅 Meeting creation - sending to LLM:', { 
      input, 
      historyCount: context?.conversationHistory?.length || 0,
      currentDate: new Date().toISOString(),
      tomorrowDate: new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0]
    });
    
    const response = await llmClient.chat(messages, {
      apiKey: options.apiKey,
      model: options.model
    });

    console.log('📅 Meeting creation - LLM response:', response);
    console.log('📅 Meeting creation - LLM response type:', typeof response);

    const result = extractJson(response);
    console.log('📅 Meeting creation - extracted JSON:', result);

    if (!result) {
      console.error('❌ No JSON extracted from LLM response');
      throw new Error('Could not extract meeting data from response');
    }

    // Check if LLM returned an error (missing datetime)
    if (result.error === 'missing_datetime') {
      console.log('⚠️ LLM detected missing date/time information');
      throw new Error('MISSING_DATETIME');
    }

    // Check if we have the minimum requirements (date/time)
    const hasDateTime = result.start_datetime && result.end_datetime;
    
    if (!hasDateTime) {
      console.log('⚠️ Missing date/time information in result, asking for clarification');
      throw new Error('MISSING_DATETIME');
    }

    // Handle title - try to infer from context or previous conversation
    if (!result.title) {
      console.log('⚠️ Missing meeting title, attempting to infer from context');
      result.title = inferMeetingTitle(input, context);
    }

    // Additional validation and fixing of datetime if needed
    if (result.start_datetime && result.end_datetime) {
      const startDate = new Date(result.start_datetime);
      const endDate = new Date(result.end_datetime);
      
      // Check if dates are valid
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error('❌ Invalid date formats detected, attempting to fix...');
        // Try to parse the input manually as fallback
        const manualParse = parseManualDateTime(input);
        if (manualParse.success) {
          result.start_datetime = manualParse.start_datetime;
          result.end_datetime = manualParse.end_datetime;
          console.log('✅ Fixed datetime using manual parsing:', { start: result.start_datetime, end: result.end_datetime });
        } else {
          throw new Error('VALIDATION_ERROR: Invalid datetime format');
        }
      }
    }

    // Validate the extracted meeting data
    const validation = validateMeetingData(result);
    if (!validation.valid) {
      console.error('❌ Invalid meeting data:', validation.errors);
      throw new Error(`VALIDATION_ERROR: ${validation.errors.join(', ')}`);
    }

    console.log('✅ Meeting creation successful:', { title: result.title, start: result.start_datetime, end: result.end_datetime });
    return result;
  } catch (error) {
    console.error('processChatMeetingCreation error:', error);
    console.error('Error details:', { input, context: !!context, options: !!options });
    
    // Handle specific error types for better user experience
    if (error.message === 'MISSING_DATETIME') {
      throw new Error('MISSING_DATETIME');
    }
    
    if (error.message.startsWith('VALIDATION_ERROR')) {
      throw new Error(error.message);
    }
    
    throw new Error(`Could not parse meeting request: ${error.message}`);
  }
}

/**
 * Infer meeting title from input and conversation context
 */
function inferMeetingTitle(input, context) {
  // First, try to extract a title from the input itself
  let title = input
    .replace(/^(schedule|create|book|set up|plan)\s+(a\s+)?(meeting|call|appointment|session)/i, '')
    .replace(/\b(for|about|with|on)\s+/gi, '')
    .replace(/\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week)\b/gi, '')
    .replace(/\b\d{1,2}(:\d{2})?\s?(am|pm)\b/gi, '')
    .replace(/\bat\s+/gi, '')
    .trim();

  // If we got something meaningful from the input, use it
  if (title.length > 3 && !title.match(/^(meeting|call|appointment)$/i)) {
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  // Try to infer from conversation history
  if (context?.conversationHistory && context.conversationHistory.length > 0) {
    const recentMessages = context.conversationHistory.slice(-5);
    
    // Look for meeting-related topics in recent conversation
    for (const msg of recentMessages.reverse()) {
      if (msg.role === 'user' && msg.content) {
        const content = msg.content.toLowerCase();
        
        // Look for project names, team names, or topics
        const projectMatches = content.match(/\b(project|team|review|standup|sync|discussion|planning)\s+(\w+)/i);
        if (projectMatches) {
          return `${projectMatches[1]} ${projectMatches[2]}`.replace(/^\w/, c => c.toUpperCase());
        }
        
        // Look for "about" or "for" topics
        const topicMatch = content.match(/\b(?:about|for|regarding|discuss)\s+([^.,!?]+)/i);
        if (topicMatch) {
          const topic = topicMatch[1].trim().substring(0, 50);
          if (topic.length > 3) {
            return topic.charAt(0).toUpperCase() + topic.slice(1);
          }
        }
      }
    }
  }

  // Default title for ad-hoc requests
  return 'Meeting';
}

/**
 * Manual datetime parsing as fallback when LLM fails
 */
function parseManualDateTime(input) {
  try {
    const lowerInput = input.toLowerCase();
    
    // Extract time
    const timeMatch = lowerInput.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    if (!timeMatch) {
      return { success: false };
    }
    
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2] || '0');
    const ampm = timeMatch[3];
    
    // Convert to 24-hour format
    if (ampm === 'pm' && hours !== 12) {
      hours += 12;
    } else if (ampm === 'am' && hours === 12) {
      hours = 0;
    }
    
    // Extract date
    let targetDate = new Date();
    
    if (lowerInput.includes('tomorrow')) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (lowerInput.includes('today')) {
      // Keep current date
    } else {
      // Check for day names
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      for (let i = 0; i < dayNames.length; i++) {
        if (lowerInput.includes(dayNames[i])) {
          const today = targetDate.getDay();
          const targetDay = i;
          let daysToAdd = targetDay - today;
          if (daysToAdd <= 0) daysToAdd += 7; // Next week
          targetDate.setDate(targetDate.getDate() + daysToAdd);
          break;
        }
      }
    }
    
    // Set the time
    targetDate.setHours(hours, minutes, 0, 0);
    
    // Create end time (30 minutes later)
    const endDate = new Date(targetDate);
    endDate.setMinutes(endDate.getMinutes() + 30);
    
    return {
      success: true,
      start_datetime: targetDate.toISOString().slice(0, 19), // Remove Z
      end_datetime: endDate.toISOString().slice(0, 19)       // Remove Z
    };
    
  } catch (error) {
    console.error('Manual datetime parsing failed:', error);
    return { success: false };
  }
}

/**
 * Parse meeting requirements from text
 */
function parseMeetingRequirements(text) {
  const requirements = {
    hasTitle: false,
    hasDateTime: false,
    hasRecurrence: false,
    isRecurring: false,
    confidence: 'low'
  };

  const lowerText = text.toLowerCase();

  // Check for meeting indicators
  const meetingKeywords = ['meeting', 'call', 'appointment', 'session', 'standup', 'sync', 'review'];
  const hasMeetingKeyword = meetingKeywords.some(keyword => lowerText.includes(keyword));

  // Check for time indicators
  const timePatterns = [
    /\b\d{1,2}:\d{2}\b/,           // 9:30
    /\b\d{1,2}\s?(am|pm)\b/,       // 9am, 9 pm
    /\b(morning|afternoon|evening|noon)\b/,
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  ];
  requirements.hasDateTime = timePatterns.some(pattern => pattern.test(lowerText));

  // Check for recurrence patterns
  const recurrencePatterns = [
    /\b(every|weekly|daily|monthly|recurring)\b/,
    /\b(each|all)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\bevery\s+(week|day|month|year)\b/
  ];
  requirements.hasRecurrence = recurrencePatterns.some(pattern => pattern.test(lowerText));
  requirements.isRecurring = requirements.hasRecurrence;

  // Check for title/subject
  requirements.hasTitle = hasMeetingKeyword || /\bfor\s+\w+/.test(lowerText) || text.length > 5;

  // Calculate confidence
  let confidence = 0;
  if (hasMeetingKeyword) confidence += 0.4;
  if (requirements.hasDateTime) confidence += 0.3;
  if (requirements.hasTitle) confidence += 0.2;
  if (requirements.hasRecurrence) confidence += 0.1;

  if (confidence >= 0.7) {
    requirements.confidence = 'high';
  } else if (confidence >= 0.4) {
    requirements.confidence = 'medium';
  } else {
    requirements.confidence = 'low';
  }

  return requirements;
}

/**
 * Format meeting data for Google Calendar API
 */
function formatMeetingForCalendar(meetingData, userTimezone = 'America/New_York') {
  const event = {
    summary: meetingData.title,
    description: meetingData.description || '',
    start: {
      dateTime: meetingData.start_datetime,
      timeZone: userTimezone
    },
    end: {
      dateTime: meetingData.end_datetime,
      timeZone: userTimezone
    }
  };

  if (meetingData.location) {
    event.location = meetingData.location;
  }

  // Handle recurrence
  if (meetingData.recurrence) {
    const recurrence = meetingData.recurrence;
    let rrule = `FREQ=${recurrence.frequency.toUpperCase()}`;
    
    if (recurrence.interval && recurrence.interval > 1) {
      rrule += `;INTERVAL=${recurrence.interval}`;
    }
    
    if (recurrence.until) {
      // Format until date for Google Calendar (YYYYMMDD)
      const untilDate = new Date(recurrence.until);
      const formattedUntil = untilDate.toISOString().split('T')[0].replace(/-/g, '');
      rrule += `;UNTIL=${formattedUntil}`;
    } else if (recurrence.count) {
      rrule += `;COUNT=${recurrence.count}`;
    }

    event.recurrence = [`RRULE:${rrule}`];
  }

  return event;
}

/**
 * Validate meeting data structure
 */
function validateMeetingData(meetingData) {
  const errors = [];

  if (!meetingData.title || typeof meetingData.title !== 'string') {
    errors.push('Missing or invalid title');
  }

  if (!meetingData.start_datetime) {
    errors.push('Missing start datetime');
  } else {
    const startDate = new Date(meetingData.start_datetime);
    if (isNaN(startDate.getTime())) {
      errors.push('Invalid start datetime format');
    }
  }

  if (!meetingData.end_datetime) {
    errors.push('Missing end datetime');
  } else {
    const endDate = new Date(meetingData.end_datetime);
    if (isNaN(endDate.getTime())) {
      errors.push('Invalid end datetime format');
    }
    
    if (meetingData.start_datetime && endDate <= new Date(meetingData.start_datetime)) {
      errors.push('End time must be after start time');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  processChatMeetingCreation,
  parseMeetingRequirements,
  formatMeetingForCalendar,
  validateMeetingData,
  inferMeetingTitle,
  parseManualDateTime
};
