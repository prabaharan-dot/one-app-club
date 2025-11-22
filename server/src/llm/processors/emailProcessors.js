const { extractJson } = require('../utils/jsonUtils');

/**
 * Email-specific processor functions for handling email analysis and action generation
 */

/**
 * Process emails for action suggestions
 */
async function processEmailActions(user, emailData, options = {}) {
  const { llmClient } = options;

  const systemPrompt = `You are an email assistant. Analyze this email and suggest specific, actionable steps.

Available actions:
- flag: Mark important emails
- create_task: Create a task from email content
- create_event: Create calendar event
- reply: Suggest a reply
- mark_read: Mark as read
- set_priority: Set priority level

Return only valid JSON in this exact format:
{
  "actions": [
    {"type": "action_type", "reason": "why this action", "priority": 1-5}
  ],
  "summary": "brief email summary"
}`;

  const userPrompt = `Email from: ${emailData.sender}
Subject: ${emailData.subject}
Content: ${emailData.body_plain}

Analyze and suggest actions.`;

  try {
    const response = await llmClient.chat(systemPrompt, userPrompt, {
      apiKey: options.apiKey,
      model: options.model
    });

    const result = extractJson(response);
    return result || { actions: [], summary: emailData.subject };
  } catch (error) {
    console.error('processEmailActions error:', error);
    return { actions: [], summary: emailData.subject };
  }
}

/**
 * Process email for reply generation
 */
async function processEmailReply(user, emailData, replyInstruction, options = {}) {
  const { llmClient } = options;

  const systemPrompt = `You are an email assistant helping to compose replies. 
Generate a professional, appropriate response based on the original email and user instruction.

Return only valid JSON:
{
  "reply_content": "the suggested reply text",
  "subject": "suggested subject line",
  "tone": "professional|casual|formal"
}`;

  const userPrompt = `Original Email:
From: ${emailData.sender}
Subject: ${emailData.subject}
Content: ${emailData.body_plain}

User wants to: ${replyInstruction}

Generate an appropriate reply.`;

  try {
    const response = await llmClient.chat(systemPrompt, userPrompt, {
      apiKey: options.apiKey,
      model: options.model
    });

    return extractJson(response) || { 
      reply_content: "Thank you for your email. I'll get back to you soon.",
      subject: `Re: ${emailData.subject}`,
      tone: "professional"
    };
  } catch (error) {
    console.error('processEmailReply error:', error);
    return {
      reply_content: "Thank you for your email. I'll get back to you soon.",
      subject: `Re: ${emailData.subject}`,
      tone: "professional"
    };
  }
}

/**
 * Extract key information from email content
 */
function extractEmailKeyInfo(emailData) {
  const info = {
    hasDate: false,
    hasTime: false,
    hasLocation: false,
    hasMeeting: false,
    hasTask: false,
    urgency: 'normal'
  };

  const content = (emailData.subject + ' ' + emailData.body_plain).toLowerCase();

  // Check for date/time patterns
  info.hasDate = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}|\d{1,2}-\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(content);
  info.hasTime = /\b(\d{1,2}:\d{2}|\d{1,2}\s?(am|pm)|\d{1,2}\s?o'?clock)\b/i.test(content);
  
  // Check for location indicators
  info.hasLocation = /\b(room|office|building|address|location|meet at|conference|zoom|teams|skype)\b/i.test(content);
  
  // Check for meeting indicators
  info.hasMeeting = /\b(meeting|call|conference|appointment|session|discussion|briefing)\b/i.test(content);
  
  // Check for task indicators
  info.hasTask = /\b(task|todo|action|complete|finish|deliver|deadline|due)\b/i.test(content);
  
  // Check urgency indicators
  if (/\b(urgent|asap|immediately|critical|emergency|rush)\b/i.test(content)) {
    info.urgency = 'high';
  } else if (/\b(when you can|no rush|whenever|low priority)\b/i.test(content)) {
    info.urgency = 'low';
  }

  return info;
}

module.exports = {
  processEmailActions,
  processEmailReply,
  extractEmailKeyInfo
};
