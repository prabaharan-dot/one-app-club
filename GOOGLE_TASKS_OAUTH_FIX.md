# Google Tasks OAuth Fix Summary

## Issue Identified
The Google Tasks API integration was failing with `invalid_request` error because:
- OAuth2Client was not being initialized with Google Client ID and Secret
- The request showed empty `client_id=&client_secret=` parameters
- Missing proper OAuth credential setup for Google APIs

## Root Cause
```javascript
// ❌ INCORRECT - Missing client credentials
const oauth2Client = new google.auth.OAuth2();

// ✅ CORRECT - With proper client credentials  
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
```

## Fixes Applied

### 1. Fixed Google Tasks Integration in `generalProcessors.js`
**Before:**
```javascript
const oauth2Client = new google.auth.OAuth2();
oauth2Client.setCredentials(JSON.parse(tokenData.toString()));
```

**After:**
```javascript
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials(tokens);
```

### 2. Added Google Tasks Action Handler in `routes/llm.js`
Added complete `create_task` action handler in the `/api/llm/execute-action` endpoint:
- Proper OAuth2Client initialization with credentials
- Google Tasks API integration
- Task creation with title, description, and due dates
- Comprehensive error handling
- Success response with task details

### 3. Consistent OAuth Pattern
Now both Google Calendar and Google Tasks use the same OAuth pattern:
1. Query user's OAuth tokens from `integrations` table
2. Initialize OAuth2Client with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
3. Set user credentials with `oauth2Client.setCredentials(tokens)`
4. Create API service instance with authenticated client

## Required Environment Variables
Ensure these are set in your `.env` file:
```bash
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

## Required OAuth Scopes
Make sure your Google OAuth configuration includes the Tasks scope:
```javascript
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/tasks',           // ✅ Google Tasks
  'https://www.googleapis.com/auth/calendar',        // Calendar integration  
  'https://www.googleapis.com/auth/gmail.readonly',  // Gmail integration
  'https://www.googleapis.com/auth/userinfo.email',  // User profile
  'https://www.googleapis.com/auth/userinfo.profile' // User profile
];
```

## API Endpoints Enhanced

### POST /api/llm/chat
- ✅ Detects task creation requests
- ✅ Automatically creates Google Tasks
- ✅ Returns success confirmation with task ID

### POST /api/llm/execute-action  
- ✅ Added `create_task` action type handler
- ✅ Manual task creation from chat action buttons
- ✅ Consistent with existing calendar integration

## Expected Behavior After Fix

### Successful Task Creation
```json
{
  "success": true,
  "response": {
    "type": "create_task",
    "content": "✅ Task created successfully in Google Tasks: \"Review documents\"",
    "data": {
      "title": "Review documents",
      "created": true,
      "googleTaskId": "MTIzNDU2Nzg5",
      "platform": "google_tasks"
    }
  },
  "taskCreated": true
}
```

### Error Handling
- **No Integration**: Clear message to connect Google account
- **API Errors**: Detailed error messages for troubleshooting
- **Invalid Data**: Validation errors with guidance

## Testing
After this fix, test with:
```
User: "create a task with title Review documents"
Expected: ✅ Task created successfully in Google Tasks
```

The OAuth authentication should now work properly with Google Tasks API, matching the successful pattern used by the calendar integration.
