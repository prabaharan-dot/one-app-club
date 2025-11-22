/**
 * Data helper functions for formatting, validation, and transformation
 */

/**
 * Format messages for LLM processing
 */
function formatMessageForLLM(message) {
  return {
    id: message.id,
    sender: message.sender || 'Unknown Sender',
    subject: message.subject || 'No Subject',
    body: (message.body_plain || '').substring(0, 2000), // Limit length for LLM
    receivedAt: message.received_at,
    platform: message.platform || 'email'
  };
}

/**
 * Format user context for LLM prompts
 */
function formatUserContextForPrompt(userContext) {
  const { user, activity, integrations } = userContext;
  
  return `User: ${user.displayName || user.email}
Timezone: ${user.timezone}
Connected: ${integrations.map(i => i.platform).join(', ')}
Pending emails: ${activity.pendingEmails}
Last activity: ${activity.lastActivity ? new Date(activity.lastActivity).toLocaleString() : 'None'}`;
}

/**
 * Sanitize and validate input for processing
 */
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove excessive whitespace
  input = input.trim().replace(/\s+/g, ' ');
  
  // Limit length to prevent token overflow
  if (input.length > 5000) {
    input = input.substring(0, 5000) + '...';
  }
  
  // Remove potentially harmful content
  input = input.replace(/[<>]/g, '');
  
  return input;
}

/**
 * Validate email data structure
 */
function validateEmailData(emailData) {
  const errors = [];
  
  if (!emailData.sender) {
    errors.push('Missing sender');
  }
  
  if (!emailData.subject && !emailData.body_plain) {
    errors.push('Missing both subject and body');
  }
  
  if (emailData.received_at && isNaN(new Date(emailData.received_at).getTime())) {
    errors.push('Invalid received_at date');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalize action data from LLM responses
 */
function normalizeActionData(actionData) {
  if (!actionData || typeof actionData !== 'object') {
    return { actions: [], summary: '' };
  }
  
  const normalized = {
    actions: Array.isArray(actionData.actions) ? actionData.actions : [],
    summary: actionData.summary || actionData.content || ''
  };
  
  // Normalize individual actions
  normalized.actions = normalized.actions.map(action => {
    if (typeof action !== 'object') {
      return { type: 'unknown', reason: String(action), priority: 3 };
    }
    
    return {
      type: action.type || 'unknown',
      reason: action.reason || action.description || '',
      priority: Math.max(1, Math.min(5, parseInt(action.priority) || 3)),
      data: action.data || {}
    };
  }).filter(action => action.type !== 'unknown');
  
  return normalized;
}

/**
 * Convert database rows to structured objects
 */
function mapDatabaseRows(rows, schema) {
  return rows.map(row => {
    const mapped = {};
    for (const [key, dbField] of Object.entries(schema)) {
      mapped[key] = row[dbField];
    }
    return mapped;
  });
}

/**
 * Format date/time for different contexts
 */
function formatDateTime(dateTime, format = 'iso', timezone = 'UTC') {
  const date = new Date(dateTime);
  
  if (isNaN(date.getTime())) {
    return null;
  }
  
  switch (format) {
    case 'iso':
      return date.toISOString();
    case 'local':
      return date.toLocaleString('en-US', { timeZone: timezone });
    case 'date':
      return date.toLocaleDateString('en-US', { timeZone: timezone });
    case 'time':
      return date.toLocaleTimeString('en-US', { timeZone: timezone });
    case 'calendar':
      return {
        dateTime: date.toISOString(),
        timeZone: timezone
      };
    default:
      return date.toISOString();
  }
}

/**
 * Calculate processing metrics
 */
function calculateProcessingMetrics(startTime, endTime, inputLength, outputLength) {
  const duration = endTime - startTime;
  const throughput = inputLength / (duration / 1000); // chars per second
  
  return {
    duration: Math.round(duration),
    inputLength,
    outputLength,
    throughput: Math.round(throughput),
    efficiency: outputLength / inputLength
  };
}

/**
 * Merge user settings with defaults
 */
function mergeWithDefaults(userSettings, defaults) {
  const merged = { ...defaults };
  
  for (const [key, value] of Object.entries(userSettings)) {
    if (value !== null && value !== undefined) {
      merged[key] = value;
    }
  }
  
  return merged;
}

/**
 * Create safe copy of sensitive data for logging
 */
function createSafeCopy(data, sensitiveFields = ['password', 'token', 'key', 'secret']) {
  const safe = JSON.parse(JSON.stringify(data));
  
  function redactSensitive(obj, path = '') {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }
    
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${key}` : key;
      
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        obj[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redactSensitive(value, fullPath);
      }
    }
  }
  
  redactSensitive(safe);
  return safe;
}

/**
 * Extract error details for logging
 */
function extractErrorDetails(error) {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 5).join('\n'), // Limit stack trace
    code: error.code,
    status: error.status,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  formatMessageForLLM,
  formatUserContextForPrompt,
  sanitizeInput,
  validateEmailData,
  normalizeActionData,
  mapDatabaseRows,
  formatDateTime,
  calculateProcessingMetrics,
  mergeWithDefaults,
  createSafeCopy,
  extractErrorDetails
};
