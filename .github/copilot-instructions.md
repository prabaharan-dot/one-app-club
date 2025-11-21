# GitHub Copilot Instructions for One App Club

## Project Overview

One App Club is a unified assistant platform that helps users manage emails, cross-platform messaging, and calendar events through AI-powered automation. The system integrates with Google services (Gmail, Calendar, Tasks) and provides intelligent action suggestions for email management.

**Core Mission**: "One TRUE assistant" for email prioritization, drafting, calendar management, and cross-platform messaging.

## Architecture Overview

### Technology Stack
- **Frontend**: React 18 + Vite, react-icons, date-fns
- **Backend**: Node.js + Express
- **Database**: PostgreSQL with pgvector extension
- **Auth**: Google OAuth2 via googleapis
- **AI**: OpenAI SDK with per-user API keys
- **Deployment**: Designed for Azure (Container Apps, App Service, AKS)

### Project Structure
```
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── widgets/       # Gmail, Slack, Teams, Jira, Github widgets
│   │   │   ├── ChatWindow.jsx # Main chat interface with streaming
│   │   │   ├── CalendarPane.jsx
│   │   │   └── LLMKeyModal.jsx
│   │   ├── App.jsx
│   │   ├── api.js
│   │   └── styles.css         # CSS variables, responsive design
├── server/                     # Express backend
│   ├── src/
│   │   ├── integrations/google/ # Gmail polling and actions
│   │   ├── llm/               # OpenAI client and processor
│   │   ├── routes/            # API endpoints
│   │   ├── services/          # Business logic layer
│   │   └── migration.sql      # Database schema
│   └── migrations/            # Structured migration files
```

## Key Patterns & Conventions

### 1. User-Scoped Data Model
**CRITICAL**: The system is user-scoped (not tenant-based). All tables reference `user_id` directly.
- Primary entity: `users` table with unique email
- All data (messages, integrations, settings) belongs to specific users
- Use `req.session.userId` for authorization in all endpoints

### 2. Store-First Architecture
**Email Processing Pattern**:
1. **Store**: Upsert messages to `messages` table first
2. **Process**: Run LLM analysis to generate suggested actions
3. **Persist**: Store suggestions in `message_actions` table
4. **Execute**: User manually approves and executes actions

```sql
-- Core tables relationship
users (id) 
  ← messages (user_id)
    ← message_actions (message_id, user_id)
  ← integrations (user_id)
  ← user_settings (user_id)
```

### 3. Incremental Polling System
Gmail polling uses `last_gmail_poll` in users table for incremental fetching:
```js
// Check last poll time before fetching
const userRes = await db.query('SELECT last_gmail_poll FROM users WHERE id = $1', [userId])
const lastPoll = userRes.rows[0].last_gmail_poll
// Use lastPoll to filter messages, then update timestamp
```

### 4. Action Execution Flow
**Simple Actions** (immediate): `mark_read`, `delete`
**Complex Actions** (LLM-assisted): `create_event`, `create_task`, `reply`, `forward`

```js
// Client pattern in ChatWindow.jsx
if(actionType === 'mark_read' || actionType === 'delete'){
  // Execute immediately via /api/messages/:id/action
} else {
  // First call /api/messages/:id/prepare for LLM suggestions
  // Then present options to user for confirmation
}
```

## Critical Integration Points

### 1. Google OAuth & Token Management
- Tokens stored as BYTEA in `integrations.oauth_token_encrypted`
- Scopes: email, profile, gmail.readonly, gmail.send, calendar, tasks
- Auth flow: `/api/auth/signup` → `/api/auth/oauth2callback`

### 2. LLM Integration (OpenAI)
- Per-user API keys stored in `user_settings.llm_key_encrypted`
- Processor enforces strict JSON schema for actions
- Models supported via user preference in `llm_model` field

```js
// LLM processor pattern
const result = await llmProcessor.processEmail(user, email, {apiKey, model})
const actions = result.actions || []
// Actions: flag, create_task, create_event, reply, mark_read, set_priority
```

### 3. Real-time Updates
- Gmail widget polls `/api/messages/pending` every minute
- Window events: `showPendingMessages` from widgets to ChatWindow
- Chat streaming: artificial delays (400-500ms) for UX

## Database Schema Essentials

### Key Tables
```sql
-- Core user entity
users (id, email, display_name, timezone, last_gmail_poll)

-- OAuth integrations per user
integrations (user_id, platform, external_account_id, oauth_token_encrypted)

-- Email messages with action flags
messages (user_id, platform, external_message_id, sender, subject, body_plain, 
         action_required, actioned, received_at)

-- LLM-generated action suggestions
message_actions (message_id, user_id, suggested_actions, created_at, acted)

-- Per-user LLM configuration
user_settings (user_id, llm_key_encrypted, llm_model)
```

### Unique Constraints
```sql
-- Prevent duplicate messages per user
UNIQUE INDEX ON messages(platform, external_message_id, user_id)

-- One integration per platform per user
UNIQUE INDEX ON integrations(user_id, platform, external_account_id)
```

## Frontend Patterns

### 1. Chat Interface (`ChatWindow.jsx`)
- **Streaming simulation**: Uses setTimeout delays for message appearance
- **Keyboard shortcuts**: Alt+1/2/3 for suggestion buttons
- **Action rendering**: Messages with `messageData` show action buttons
- **Event handling**: Listens for `showPendingMessages` from widgets

### 2. Widget System (`components/widgets/`)
- **Consistent structure**: icon-circle, title, description
- **Data fetching**: Widgets call `/api/messages/pending` independently
- **Accessibility**: All widgets have proper ARIA labels and keyboard support

### 3. Responsive Design (`styles.css`)
- **CSS Variables**: `--bg1`, `--bg2`, `--card`, `--muted`, `--accent`, `--glass`
- **Grid Layout**: `grid-template-columns: 260px 1fr 360px`
- **Mobile**: Collapses to single column, hides sidebars

## API Patterns

### Authentication
```js
// All protected routes check session
if(!req.session.userId) return res.status(401).json({error:'not_logged_in'})
const userId = req.session.userId
```

### Error Handling
```js
// Consistent error responses
try {
  // business logic
} catch(e) {
  console.error('operation_name error', e)
  res.status(500).json({error: 'server_error'})
}
```

### Message Endpoints
- `GET /api/messages/pending` - Returns counts and actionable items
- `POST /api/messages/:id/prepare` - LLM analysis for complex actions
- `POST /api/messages/:id/action` - Execute approved actions

## Development Guidelines

### 1. Adding New Integrations
1. Create service in `server/src/integrations/{platform}/`
2. Add OAuth flow in `server/src/routes/auth.js`
3. Update `integrations` table with new platform
4. Create corresponding widget in `client/src/components/widgets/`

### 2. Database Changes
- Use structured migration files in `server/migrations/`
- Always include `IF NOT EXISTS` for idempotent operations
- Update `server/src/migration.sql` as master schema

### 3. LLM Action Types
When adding new action types to `llm/processor.js`:
1. Update allowed types in system prompt
2. Add execution logic in `/api/messages/:id/action` endpoint
3. Handle in ChatWindow action buttons
4. Test with various email scenarios

### 4. UI Components
- Follow existing CSS class patterns (`.widget`, `.chat-input`, `.fade-in`)
- Include accessibility attributes (`role`, `tabIndex`, `aria-label`)
- Add hover states and transitions for all interactive elements
- Test responsive behavior on mobile breakpoints

## Environment Setup

### Required Environment Variables
```bash
# Server (.env)
GOOGLE_CLIENT_ID=           # Google OAuth client ID
GOOGLE_CLIENT_SECRET=       # Google OAuth client secret
GOOGLE_REDIRECT=            # OAuth callback URL
CLIENT_ORIGIN=              # Frontend URL for CORS
SESSION_SECRET=             # Session encryption key
DATABASE_URL=               # PostgreSQL connection string
GOOGLE_POLL_INTERVAL=       # Polling frequency (default: 300000ms)

# Client
VITE_SERVER_URL=            # Backend URL (optional, auto-detected)
```

### Database Setup
1. Install PostgreSQL with pgvector extension
2. Run `server/src/migration.sql` for initial schema
3. Run files in `server/migrations/` directory in order

## Performance Considerations

### 1. Polling Optimization
- Use `last_gmail_poll` timestamps to avoid reprocessing
- Limit message fetching (default: 10 recent unread)
- Consider implementing webhook alternatives for real-time updates

### 2. LLM Usage
- Cache frequent action patterns
- Implement token usage tracking via `llm_calls` table
- Use user-provided API keys to distribute costs

### 3. Database Indexing
```sql
-- Critical indexes for performance
idx_messages_user_recv ON messages(user_id, received_at DESC)
idx_messages_unread ON messages(user_id) WHERE is_read = false
idx_messages_action_required ON messages(user_id) WHERE action_required = true
```

## Security Practices

### 1. Token Storage
- OAuth tokens stored as encrypted BYTEA (enhance with proper encryption)
- LLM API keys stored per-user (not shared)
- Session-based authentication (no JWT tokens in frontend)

### 2. API Security
- All endpoints validate `req.session.userId`
- SQL queries use parameterized statements
- CORS configured for specific client origin

### 3. Data Privacy
- User-scoped data isolation
- No cross-user data access
- Audit logging for all message actions

## Testing Strategies

### 1. Integration Testing
- Test Google OAuth flow end-to-end
- Verify email polling and LLM processing
- Test action execution across all types

### 2. Frontend Testing
- Chat streaming and keyboard shortcuts
- Widget data refresh cycles
- Mobile responsive behavior

### 3. Database Testing
- Migration idempotency
- Unique constraint enforcement
- Index performance with realistic data volumes

## Common Pitfalls & Solutions

### 1. OAuth Token Expiry
**Problem**: Tokens expire, breaking integrations
**Solution**: Implement refresh token handling in poller error catching

### 2. LLM Response Parsing
**Problem**: Non-JSON responses break action processing
**Solution**: Use `extractJson()` helper with fallback error handling

### 3. Race Conditions in Polling
**Problem**: Multiple poller instances processing same messages
**Solution**: Use database-level locks or single poller instance

### 4. Mobile UI Overflow
**Problem**: Fixed sidebar widths break mobile layouts
**Solution**: Use CSS Grid with responsive breakpoints, hide sidebars on mobile

## Future Extension Points

### 1. Multi-Platform Support
- Slack, Microsoft Teams, Outlook integrations
- Unified message interface across platforms
- Cross-platform action coordination

### 2. Advanced AI Features
- Semantic search with message embeddings
- Smart scheduling based on calendar analysis
- Context-aware reply generation

### 3. Real-time Capabilities
- WebSocket connections for instant updates
- Push notifications for urgent actions
- Live collaboration features

## Debugging Tips

### 1. Common Issues
- **"not_logged_in" errors**: Check session middleware and cookie settings
- **Gmail API failures**: Verify OAuth scopes and token validity
- **LLM parsing errors**: Check OpenAI API key and response format
- **Missing messages**: Verify poller is running and `last_gmail_poll` updates

### 2. Debug Endpoints
- `GET /api/auth/me` - Check user session
- `GET /api/messages/pending` - Verify message processing
- `GET /api/settings/llm` - Check LLM key configuration

### 3. Database Queries for Debugging
```sql
-- Check user integrations
SELECT * FROM integrations WHERE user_id = 'user-uuid';

-- Check unprocessed messages  
SELECT * FROM messages WHERE user_id = 'user-uuid' AND action_required = true;

-- Check LLM action suggestions
SELECT * FROM message_actions WHERE user_id = 'user-uuid' ORDER BY created_at DESC;
```

Remember: This is a user-centric system where every action, message, and integration belongs to a specific user. Always validate user context and maintain data isolation.

# CRITICAL
never modify env file, environment variables. dont execute any tests or commands.