/**
 * JSON utility functions for LLM response parsing
 */

/**
 * Extract JSON from LLM response text
 */
function extractJson(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // First, try to parse the entire text as JSON
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // If that fails, try to find JSON within the text
  }

  // Look for JSON blocks within code fences
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch (e) {
      // Continue to other methods
    }
  }

  // Look for JSON objects in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      // Try to clean up common issues
      let cleanJson = jsonMatch[0];
      
      // Remove trailing commas
      cleanJson = cleanJson.replace(/,(\s*[}\]])/g, '$1');
      
      // Fix unquoted keys
      cleanJson = cleanJson.replace(/(\w+):/g, '"$1":');
      
      // Fix single quotes
      cleanJson = cleanJson.replace(/'/g, '"');
      
      try {
        return JSON.parse(cleanJson);
      } catch (e2) {
        console.error('JSON extraction failed:', e2.message, 'Original text:', text.substring(0, 200));
        return null;
      }
    }
  }

  console.error('No JSON found in text:', text.substring(0, 200));
  return null;
}

/**
 * Validate JSON structure matches expected schema
 */
function validateJsonStructure(json, requiredFields) {
  if (!json || typeof json !== 'object') {
    return { valid: false, errors: ['Invalid JSON object'] };
  }

  const errors = [];
  
  for (const field of requiredFields) {
    if (!(field in json)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Safely stringify JSON with circular reference handling
 */
function safeStringify(obj, space = null) {
  const seen = new Set();
  
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  }, space);
}

/**
 * Parse JSON with error handling and fallback
 */
function safeParse(jsonString, fallback = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('JSON parse error:', error.message);
    return fallback;
  }
}

/**
 * Clean and normalize JSON strings
 */
function normalizeJsonString(str) {
  if (!str || typeof str !== 'string') {
    return str;
  }
  
  return str
    .trim()
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

module.exports = {
  extractJson,
  validateJsonStructure,
  safeStringify,
  safeParse,
  normalizeJsonString
};
