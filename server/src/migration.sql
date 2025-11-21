BEGIN;

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector; -- pgvector

-- Users (top-level, single-tenant per user model)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT DEFAULT 'user', -- user/admin
  timezone TEXT DEFAULT 'UTC',
  last_gmail_poll TIMESTAMPTZ, -- track last gmail polling time per user
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Integrations (per-user: Gmail, Outlook, Slack, Teams)
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'gmail','outlook','slack','teams'
  external_account_id TEXT, -- e.g., team id, workspace id
  oauth_token_encrypted BYTEA, -- store encrypted blob / secret manager pointer
  config JSONB, -- config options, webhook URLs, scopes
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Threads across platforms (normalized conversation threads)
CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_thread_id TEXT, -- platform-specific thread id
  title TEXT,
  channel TEXT, -- channel or mailbox
  platform TEXT,
  metadata JSONB, -- e.g., thread participants
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Messages (individual messages / emails / chat messages)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES threads(id) ON DELETE SET NULL,
  platform TEXT NOT NULL, -- 'outlook','slack','teams','gmail'
  external_message_id TEXT, -- platform's message id
  sender TEXT,
  recipient JSONB, -- array or object for recipients
  subject TEXT,
  body TEXT,
  body_plain TEXT, -- plaintext for embedding / search
  attachments JSONB,
  is_read BOOLEAN DEFAULT false,
  is_flagged BOOLEAN DEFAULT false,
  importance TEXT, -- 'low','normal','high'
  received_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ, -- when ingested and summarized
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure unique index for platform + external_message_id + user_id for upserts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_messages_platform_external') THEN
    EXECUTE 'CREATE UNIQUE INDEX idx_messages_platform_external ON messages(platform, external_message_id, user_id)';
  END IF;
END$$;

-- Add action-tracking columns to messages if missing
ALTER TABLE messages ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS action_suggested JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS actioned BOOLEAN DEFAULT false;

-- Add LLM processing status columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS llm_processed BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS llm_processing_attempts INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS llm_last_attempt TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS llm_error TEXT;

-- Message actions table to store LLM suggested actions (do not auto-execute)
CREATE TABLE IF NOT EXISTS message_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggested_actions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  acted BOOLEAN DEFAULT false
);

-- Add unique constraint for ON CONFLICT to work
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_actions_unique_message_user ON message_actions(message_id, user_id);

CREATE INDEX IF NOT EXISTS idx_message_actions_user ON message_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_message_actions_message ON message_actions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_actions_acted ON message_actions(user_id, acted) WHERE acted = false;
CREATE INDEX IF NOT EXISTS idx_messages_action_required ON messages(user_id) WHERE action_required = true;
CREATE INDEX IF NOT EXISTS idx_messages_actioned ON messages(user_id, actioned) WHERE action_required = true;

-- LLM processing status indexes
CREATE INDEX IF NOT EXISTS idx_messages_llm_unprocessed ON messages(user_id, llm_processed, received_at DESC) WHERE llm_processed = false;
CREATE INDEX IF NOT EXISTS idx_messages_llm_retry ON messages(llm_processing_attempts, llm_last_attempt) WHERE llm_processed = false;

-- Embeddings (for RAG / semantic search) using pgvector
CREATE TABLE IF NOT EXISTS message_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model TEXT,
  embedding vector(1536), -- adjust dim to model
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chat sessions table for persistent conversations
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT 'New Chat',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AI Chat Messages (user <> assistant chat with the UI) - Enhanced for persistence
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_role VARCHAR(20) NOT NULL CHECK (message_role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'chat_response',
  metadata JSONB DEFAULT '{}',
  context_relevant BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- LLM calls / billing telemetry (optional)
CREATE TABLE IF NOT EXISTS llm_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  model TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  cost_estimate NUMERIC(12,6),
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processor_type TEXT,
  input_size INT,  
  processing_time_ms INT
);

-- Notifications / quick counts (cache)
CREATE TABLE IF NOT EXISTS notification_counters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID, -- null for account-wide
  platform TEXT, -- email/slack/teams
  unread_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Calendar / events
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_event_id TEXT,
  organizer TEXT,
  attendees JSONB,
  title TEXT,
  description TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  location TEXT,
  platform TEXT, -- outlook, google
  meeting_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit logs (message actions like read/reply/snooze)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  action TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User settings (store LLM key pointer / encrypted blob)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  llm_key_encrypted BYTEA,
  llm_model TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);

-- Daily briefing cache table for performance
CREATE TABLE IF NOT EXISTS daily_briefing_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  briefing_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_briefing_cache_user_date ON daily_briefing_cache(user_id, date);

-- Add preferences column to users for LLM personalization
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

-- Tasks table for task management (placeholder)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'normal',
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE status != 'completed';

-- Add last_gmail_poll column to users if missing (for existing tables)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_gmail_poll TIMESTAMPTZ;

-- Safety: only create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_messages_user_recv ON messages(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(user_id) WHERE is_read = false;
-- ensure integrations uniqueness so ON CONFLICT(platform, external_account_id) works per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_user_platform_account ON integrations(user_id, platform, external_account_id);
-- pgvector ivfflat index: if not supported by CREATE INDEX IF NOT EXISTS, ignore and it will error on older PG versions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_embeddings_vector') THEN
    EXECUTE 'CREATE INDEX idx_embeddings_vector ON message_embeddings USING ivfflat (embedding) WITH (lists = 100)';
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_calendar_user_time ON calendar_events(user_id, start_time);

-- Chat session and message indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON chat_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_context ON chat_messages(session_id, context_relevant, created_at ASC) WHERE context_relevant = TRUE;

-- Function to update session updated_at when messages are added
CREATE OR REPLACE FUNCTION update_chat_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessions 
  SET updated_at = NOW() 
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update session timestamp
DROP TRIGGER IF EXISTS trigger_update_chat_session_timestamp ON chat_messages;
CREATE TRIGGER trigger_update_chat_session_timestamp
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_session_timestamp();

-- Helper function to create initial chat message
DROP FUNCTION IF EXISTS create_initial_chat_message(UUID, UUID);
CREATE OR REPLACE FUNCTION create_initial_chat_message(p_session_id UUID, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO chat_messages (session_id, user_id, message_role, content, message_type, context_relevant)
  VALUES (p_session_id, p_user_id, 'assistant', 'Hi! I''m your assistant. How can I help today?', 'initial_message', FALSE);
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Column and table comments for documentation
COMMENT ON COLUMN messages.action_required IS 'True if this message requires user action based on LLM analysis';
COMMENT ON COLUMN messages.action_suggested IS 'JSON array of LLM-suggested actions for this message';
COMMENT ON COLUMN messages.actioned IS 'True if user has taken action on this message';
COMMENT ON COLUMN messages.processed_at IS 'Timestamp when message was processed by LLM';
COMMENT ON COLUMN messages.llm_processed IS 'True if message has been processed by LLM';
COMMENT ON COLUMN messages.llm_processing_attempts IS 'Number of LLM processing attempts for this message';
COMMENT ON COLUMN messages.llm_last_attempt IS 'Timestamp of last LLM processing attempt';
COMMENT ON COLUMN messages.llm_error IS 'Last error message from LLM processing';
COMMENT ON COLUMN users.last_gmail_poll IS 'Timestamp of last Gmail polling for this user - used for incremental polling';
COMMENT ON TABLE message_actions IS 'Stores LLM-suggested actions for messages - allows multiple suggestion sets per message';
COMMENT ON COLUMN message_actions.suggested_actions IS 'JSON array of suggested actions from LLM processing';
COMMENT ON COLUMN message_actions.acted IS 'True if user has acted on these suggestions';
COMMENT ON TABLE chat_sessions IS 'Persistent chat sessions for user conversations with AI assistant';
COMMENT ON TABLE chat_messages IS 'Individual messages within chat sessions with context tracking';
COMMENT ON COLUMN chat_messages.context_relevant IS 'Whether this message should be included in LLM context for future responses';

-- Add profile personalization columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_note TEXT;

-- Add comments for new columns
COMMENT ON COLUMN users.location IS 'User location for personalized assistance';
COMMENT ON COLUMN users.personal_note IS 'Personal note for LLM to understand user context and preferences';

-- Notes:
-- 1) Using IF NOT EXISTS and a transaction makes repeated runs safe on restarts.
-- 2) This file contains the complete schema consolidated from all migration files.
-- 3) oauth_token_encrypted stored as BYTEA here: replace with an encrypted KMS/secret-manager pointer in production.
-- 4) The unique index on (platform, external_account_id, user_id) will make ON CONFLICT work. If external_account_id can be NULL, ON CONFLICT will not match those rows — consider marking external_account_id NOT NULL if appropriate.
-- 5) Chat persistence system supports immediate database sync and conversation context for LLM.
-- 6) LLM processing status tracking allows for retry logic and error handling.
