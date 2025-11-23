# Meeting Creation Debugging Guide

## Error: `processChatMeetingCreation error: Error: Invalid meeting data extracted`

### Root Cause Analysis

This error occurs when the LLM response cannot be parsed into valid meeting data. Here's how to debug and fix it:

### 1. **Check LLM Response Format**

The system expects JSON in this format:
```json
{
  "title": "Meeting Title",
  "start_datetime": "2025-11-23T14:00:00",
  "end_datetime": "2025-11-23T14:30:00",
  "description": "Optional description",
  "location": "Optional location"
}
```

### 2. **Debug Steps Applied**

✅ **Enhanced Error Logging**: Added detailed console logs to track:
- Input message sent to LLM
- Raw LLM response
- Extracted JSON result
- Validation results

✅ **Improved System Prompt**: 
- Added current date/time context
- Provided clear examples
- Specified required fields more explicitly
- Simplified output requirements

✅ **Better Fallback Handling**:
- Creates default title if missing
- Adds default meeting time (tomorrow 2 PM) if no time specified
- More graceful error messages for users

✅ **Fixed LLM Client**: Updated to use user's API key when provided

### 3. **Enhanced User Experience**

When meeting creation fails, users now see helpful guidance:
```
I'd like to help you create a meeting! To schedule it properly, could you please provide:

• Meeting title - What should we call this meeting?
• Date and time - When would you like to schedule it?
• Duration - How long will it be? (default: 30 minutes)

For example: "Schedule team standup tomorrow at 10am for 30 minutes"
```

### 4. **Testing Meeting Creation**

Try these example inputs:
- `"schedule a meeting tomorrow at 2pm"`
- `"book team standup friday 9am"`
- `"create quarterly review next monday 3pm for 1 hour"`

### 5. **Debug Console Output**

When a meeting creation is attempted, you'll see logs like:
```
📅 Meeting creation - sending to LLM: { input: "schedule meeting", historyCount: 2 }
🤖 LLM call with model: gpt-4o-mini
📅 Meeting creation - LLM response: {"title":"Meeting",...}
📅 Meeting creation - extracted JSON: {title: "Meeting", start_datetime: "2025-11-23T14:00:00"}
```

### 6. **Common Issues & Solutions**

**Issue**: LLM returns non-JSON response
**Solution**: Enhanced system prompt with strict JSON-only instructions

**Issue**: Missing required fields (title, times)  
**Solution**: Added fallback values and validation

**Issue**: Invalid datetime format
**Solution**: Improved examples in system prompt with proper ISO format

**Issue**: API key problems
**Solution**: Fixed LLM client to use user's API key when available

### 7. **Conversation History Integration**

The meeting processor now uses conversation history to:
- Understand context from previous messages
- Gather meeting details across multiple exchanges
- Provide better follow-up responses

Example conversation:
```
User: "I need to schedule a meeting"
AI: "I can help! What's the meeting about and when?"
User: "team review tomorrow 3pm"  
AI: ✅ Meeting created: "Team review" - Tomorrow 3:00 PM
```

The debugging enhancements should resolve the meeting creation errors and provide much better user experience.
