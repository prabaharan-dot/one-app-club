# GitHub Copilot Instructions for One App Club

## Project Overview

One App Club is a unified AI-powered assistant platform that manages emails, cross-platform messaging, and calendar events through intelligent automation. The system integrates with Google services (Gmail, Calendar, Tasks) and provides LLM-powered action suggestions for productivity management.

**Core Mission**: "One TRUE assistant" that consolidates email prioritization, calendar management, task creation, and cross-platform messaging into a single intelligent interface.

## Architecture Overview

### Technology Stack
- **Frontend**: React 18 + Vite, ReactMarkdown, react-router-dom, react-icons, date-fns
- **Backend**: Node.js + Express with session-based authentication
- **Database**: PostgreSQL with pgvector extension for vector embeddings
- **Auth**: Google OAuth2 via googleapis (Gmail, Calendar, Tasks scopes)
- **AI**: OpenAI SDK with global server-side API keys
- **Real-time**: Polling-based architecture with widget event system

### Project Structure
```
├── client/src/
│   ├── components/
│   │   ├── ChatWindow.jsx        # Main chat interface with streaming & lazy sessions
│   │   ├── ConversationHistory.jsx # Modern card-based history with modal viewer
│   │   ├── widgets/              # Gmail, Slack, Teams, Jira, Github widgets
│   │   └── [NotificationPanel, PersonalizationPanel, etc.]
│   ├── App.jsx                   # Router + authentication state management
│   └── styles.css               # CSS custom properties, glass morphism, gradients
├── server/src/
│   ├── llm/
│   │   ├── processor.js         # Modular LLM processing with context collectors
│   │   ├── llmClient.js         # Global OpenAI API key management
│   │   └── processors/          # Specialized processors by domain
│   ├── integrations/google/     # Gmail polling, OAuth token management
│   ├── routes/                  # API endpoints with consistent error handling
│   └── migration.sql           # Complete database schema (consolidated)
```

## Core Patterns & Conventions

### 1. User-Scoped Architecture (NOT Tenant-Based)
**CRITICAL**: Everything belongs to individual users, not tenants.
```sql
-- Every table references user_id directly
users (id) → messages (user_id) → message_actions (message_id, user_id)
users (id) → integrations (user_id) → chat_sessions (user_id)
```
- Always use `req.session.userId` for authorization
- All data operations are user-scoped
- Unique constraints prevent duplicate data per user

### 2. Store-First Email Processing
**Pattern**: Store → Process → Suggest → Execute
```js
// 1. Gmail poller stores raw messages
await upsertMessage(userId, 'gmail', messageId, metadata)

// 2. LLM job processes stored messages
const actions = await llmProcessor.processEmailActions(user, email)

// 3. Store suggestions in message_actions table
await db.query('INSERT INTO message_actions ...')

// 4. User confirms and executes via /api/messages/:id/action
```

### 3. Lazy Session Management
**Pattern**: Only create chat sessions when users actually send messages
```js
// ChatWindow.jsx - Don't create session until user sends first message
async function send() {
  let sessionId = currentSessionId
  if (!sessionId) {
    sessionId = await initializeSession() // Create session on first message
  }
  // Continue with message processing...
}
```

### 4. LLM Processing with Context History
**Pattern**: Include conversation history for contextual responses
```js
// Automatic conversation history retrieval in /api/llm/intelligent
const conversationHistory = await db.query(`
  SELECT message_role, content FROM chat_messages
  WHERE session_id = $1 AND context_relevant = TRUE
  ORDER BY created_at DESC LIMIT 10
`)
// Format and include in LLM context
```

### 5. Two-Phase Action System
**Simple Actions** (immediate): `mark_read`, `delete`
**Complex Actions** (LLM-assisted): `create_event`, `create_meeting`, `draft_reply`
```js
// Frontend pattern in ChatWindow.jsx
if(['mark_read', 'delete'].includes(actionType)) {
  // Execute immediately
  await performAction(messageId, actionType)
} else {
  // Prepare with LLM suggestions first
  await prepareAction(messageId, actionType) // → Show confirmation UI
}
```

## Critical Integrations & Data Flow

### 1. Gmail Polling & Incremental Sync
**Key Pattern**: Use `last_gmail_poll` timestamp for incremental fetching
```js
// poller.js - Incremental polling to avoid reprocessing
const lastPoll = await getLastPollTime(userId)
let query = 'is:unread'
if(lastPoll) {
  const afterDate = new Date(lastPoll).toISOString().split('T')[0].replace(/-/g,'/')
  query += ` after:${afterDate}`
}
```

### 2. OAuth Token Management
**Storage**: Encrypted BYTEA in `integrations.oauth_token_encrypted`
**Scopes Required**: email, profile, gmail.readonly, gmail.send, calendar, tasks
```js
// Authentication flow: /api/auth/signup → /api/auth/oauth2callback
const oauth2Client = oauthClientFromTokens(row.oauth_token_encrypted.toString())
```

### 3. Global LLM Configuration
**Pattern**: Server-side OpenAI API keys (not per-user)
```js
// llmClient.js - Global configuration
const GLOBAL_OPENAI_KEY = process.env.OPENAI_API_KEY
const GLOBAL_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
```

### 4. Widget Event System
**Pattern**: Widgets communicate with ChatWindow via custom events
```js
// Gmail widget dispatches events
window.dispatchEvent(new CustomEvent('showPendingMessages'))

// ChatWindow listens for widget interactions
window.addEventListener('showPendingMessages', loadPendingMessages)
```

## Database Schema Essentials

### Core Tables & Relationships
```sql
-- User-centric model
users (id, email, timezone, last_gmail_poll, personal_note)
integrations (user_id, platform, oauth_token_encrypted)
messages (user_id, external_message_id, action_required, actioned)
message_actions (message_id, user_id, suggested_actions)

-- Chat persistence with conversation history
chat_sessions (user_id, title, created_at, updated_at)
chat_messages (session_id, user_id, message_role, content, context_relevant)
```

### Critical Unique Constraints
```sql
-- Prevent duplicate messages per user per platform
UNIQUE(platform, external_message_id, user_id) ON messages

-- One integration per platform per user
UNIQUE(user_id, platform, external_account_id) ON integrations
```

### Performance Indexes
```sql
-- Essential for email management performance
idx_messages_user_recv ON messages(user_id, received_at DESC)
idx_chat_messages_context ON chat_messages(session_id, context_relevant, created_at)
```

## Frontend Architecture Patterns

### 1. Modern Chat Interface (ChatWindow.jsx)
- **Lazy session creation**: Don't hit DB until user sends message
- **Streaming simulation**: setTimeout delays (400-500ms) for natural UX
- **Action buttons**: Dynamic rendering based on `messageData.showActions`
- **Keyboard shortcuts**: Alt+1/2/3 for quick email actions

### 2. Card-Based Conversation History
- **Modern design**: CSS gradients, glass morphism effects
- **Modal viewing**: Click card → open conversation in modal
- **Responsive grid**: Auto-fill columns with mobile breakpoints

### 3. Widget System Architecture
- **Consistent structure**: Icon circle + title + description
- **Independent polling**: Each widget polls `/api/messages/pending` every 60s
- **Event dispatch**: Widgets trigger ChatWindow actions via custom events

### 4. CSS Custom Properties System
```css
:root {
  --bg1: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --glass: rgba(255, 255, 255, 0.1);
  --card: rgba(255, 255, 255, 0.95);
}
```

## API Design Patterns

### Authentication & Authorization
```js
// Consistent session validation across all routes
if(!req.session.userId) return res.status(401).json({error:'not_logged_in'})
const userId = req.session.userId
```

### Error Handling with Permission Management
```js
function handlePermissionError(actionType, error) {
  return {
    error: 'insufficient_permissions',
    actionType,
    requiredPermission: permissionRequiredMap[actionType],
    reauthUrl: '/api/auth/reauth'
  }
}
```

### Conversation Context Retrieval
```js
// GET /api/chat/sessions/:id/context - Format for LLM consumption
const conversationHistory = result.rows.reverse().map(msg => ({
  role: msg.message_role === 'user' ? 'user' : 'assistant',
  content: msg.content
}))
```

## Development Workflows

### 1. Adding New Email Actions
```js
// 1. Update LLM processor with new action type
const processors = {
  'new_action': processNewAction
}

// 2. Add execution logic in routes/messages.js
case 'new_action':
  await executeNewAction(messageId, payload)

// 3. Add UI button in ChatWindow action grid
<button onClick={() => performAction(messageId, 'new_action')}>
  🆕 New Action
</button>
```

### 2. Database Migrations
- **Master schema**: `server/src/migration.sql` (consolidated)
- **Incremental changes**: Add to `server/migrations/` directory
- **Idempotent patterns**: Always use `IF NOT EXISTS`

### 3. LLM Processing Enhancement
```js
// Context collectors pattern in processor.js
const contextCollectors = {
  'email_summary': async (user, params) => {
    const emails = await getEmailsForTimeframe(user.id, params.timeframe)
    return { user, emails, type: 'email_batch' }
  }
}
```

## Testing & Debugging

### Common Issues & Solutions
1. **"not_logged_in" errors**: Check session middleware configuration
2. **Gmail API failures**: Verify OAuth token validity and scopes
3. **LLM parsing errors**: Use `extractJson()` helper for response parsing
4. **Missing conversation history**: Check `context_relevant` flag in chat_messages

### Debug Endpoints
```bash
GET /api/auth/me              # Check user session
GET /api/messages/debug       # Email counts and sample data
GET /api/llm/processing-status # LLM job status
```

### Database Debug Queries
```sql
-- Check user's email processing status
SELECT COUNT(*), AVG(CASE WHEN llm_processed THEN 1 ELSE 0 END) as processed_ratio
FROM messages WHERE user_id = 'user-uuid';

-- Review conversation context
SELECT message_role, content, context_relevant 
FROM chat_messages WHERE session_id = 'session-uuid' 
ORDER BY created_at DESC LIMIT 10;
```

## Performance & Scalability

### 1. Polling Optimization
- **Incremental sync**: Use `last_gmail_poll` timestamps
- **Batch processing**: Limit to 50 messages per poll
- **Separate jobs**: Gmail poller + LLM processor run independently

### 2. LLM Cost Management
- **Global API keys**: Server-side OpenAI configuration
- **Context limiting**: Use last 10 messages for conversation history
- **Caching**: Daily briefing cache with 2-hour TTL

### 3. Frontend Performance
- **Lazy loading**: Chat sessions created on first user message
- **Event-driven**: Widget updates via custom events, not polling
- **CSS optimization**: Use transforms and opacity for animations

## Security Considerations

- **OAuth tokens**: Encrypted BYTEA storage (enhance with KMS in production)
- **Session-based auth**: No JWT tokens in frontend
- **User data isolation**: All queries filtered by `user_id`
- **CORS configuration**: Restrict to specific client origins

---

**Remember**: This is a user-centric system with conversation history, lazy session management, and intelligent email processing. Always maintain user context and leverage the modular LLM processing architecture for new features.

**CRITICAL**: Never modify environment variables or execute tests/commands directly.