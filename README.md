# OneApp Club

One TRUE assistant that you need.

## Features

1. **Email Management**
   - Reads your emails and prioritizes them
   - Identifies emails requiring immediate action
   - Schedules calendar slots for follow-ups
   - Drafts email responses

2. **Multi-platform Messaging**
   - Reads messages from Slack, Teams, and other platforms
   - Sends and drafts replies
   - Provides contextual reminders

3. **Calendar Management**
   - Manages your calendar intelligently
   - Schedules meetings and follow-ups

4. **Integrations**
   - GitHub, Jira, DataDog integration
   - And many more coming soon

## LLM Processing Capabilities

The system now supports generic LLM processing for various use cases:
- **Email Actions**: Extract action items from emails
- **Email Summaries**: Summarize emails by timeframe (today, yesterday, week)
- **Daily Briefing**: Get prepared for your day with AI insights (cached for 2 hours)
- **Meeting Notes**: Process and organize meeting notes
- **Chat Response**: General chat interactions with AI

## Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd one-app-club
   ```

2. **Server Setup**
   ```bash
   cd server
   npm install
   cp .env.example .env
   ```

3. **Configure Environment Variables**
   Edit `server/.env` with your configuration:
   ```env
   DATABASE_URL=postgres://username:password@localhost:5432/oneappclub
   SESSION_SECRET=your-random-session-secret-here
   OPENAI_API_KEY=sk-your-openai-api-key-here
   OPENAI_MODEL=gpt-4o-mini
   ```

4. **Client Setup**
   ```bash
   cd client
   npm install
   ```

5. **Start the Application**
   ```bash
   # Terminal 1 - Start server
   cd server && npm start

   # Terminal 2 - Start client
   cd client && npm run dev
   ```

## Architecture

The system uses a job-based architecture:
- **Gmail Poller Job**: Continuously polls for new emails and stores them in the database
- **LLM Processing Job**: Processes unprocessed emails with AI, includes retry logic for failed processing
- **Global API Keys**: Uses server-side OpenAI API keys for all users (no per-user key collection)

## API Endpoints

### LLM Processing
- `POST /api/llm/process` - Generic LLM processing with different processor types
- `GET /api/llm/summary/:timeframe` - Get email summaries (today, yesterday, week)
- `GET /api/llm/briefing` - Get daily briefing (cached)
- `POST /api/llm/chat` - Chat with AI
- `GET /api/llm/stats` - Get LLM processing statistics
- `GET /api/llm/processing-status` - Check processing status
- `POST /api/llm/retry-failed` - Retry failed LLM processing

### Authentication & Settings
- `POST /api/auth/signin` - Sign in with Google
- `GET /api/settings/llm` - Check LLM availability (always true with global keys)