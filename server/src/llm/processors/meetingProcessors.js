const { extractJson } = require('../utils/jsonUtils');

/**
 * Meeting and calendar-specific processor functions
 */

/**
 * Process chat input for meeting creation
 */
async function processChatMeetingCreation(input, options = {}) {
  const { llmClient } = options;

  const systemPrompt = `You are a calendar assistant. Parse meeting requests from natural language.

Extract meeting details and return ONLY valid JSON:
{
  "title": "meeting title",
  "description": "meeting description", 
  "start_datetime": "ISO string (YYYY-MM-DDTHH:mm:ss)",
  "end_datetime": "ISO string (YYYY-MM-DDTHH:mm:ss)",
  "location": "location if mentioned",
  "recurrence": {
    "frequency": "daily|weekly|monthly|yearly",
    "interval": 1,
    "until": "ISO date string (YYYY-MM-DD)",
    "count": 10
  }
}

Rules:
- Use current year if not specified
- Default duration: 30 minutes
- For recurring: include recurrence object
- For one-time: omit recurrence
- Always use 24-hour format
- Location is optional`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input }
    ];
    
    const response = await llmClient.chat(messages, {
      apiKey: options.apiKey,
      model: options.model
    });

    const result = extractJson(response);
    if (!result || !result.title) {
      throw new Error('Invalid meeting data extracted');
    }

    return result;
  } catch (error) {
    console.error('processChatMeetingCreation error:', error);
    throw new Error('Could not parse meeting request');
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
  validateMeetingData
};
