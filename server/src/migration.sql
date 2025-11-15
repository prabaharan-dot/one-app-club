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

-- Message actions table to store LLM suggested actions (do not auto-execute)
CREATE TABLE IF NOT EXISTS message_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggested_actions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  acted BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_message_actions_user ON message_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_action_required ON messages(user_id) WHERE action_required = true;

-- Embeddings (for RAG / semantic search) using pgvector
CREATE TABLE IF NOT EXISTS message_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model TEXT,
  embedding vector(1536), -- adjust dim to model
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI Chat Messages (user <> assistant chat with the UI)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT,
  metadata JSONB,
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
  created_at TIMESTAMPTZ DEFAULT now()
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

COMMIT;

-- Notes:
-- 1) Using IF NOT EXISTS and a transaction makes repeated runs safe on restarts.
-- 2) For schema migrations (alter columns, add/remove columns) prefer a migration tool (sqitch, flyway, goose, or node-pg-migrate) rather than editing this file in place.
-- 3) oauth_token_encrypted stored as BYTEA here: replace with an encrypted KMS/secret-manager pointer in production.
-- 4) The unique index on (platform, external_account_id, user_id) will make ON CONFLICT work. If external_account_id can be NULL, ON CONFLICT will not match those rows — consider marking external_account_id NOT NULL if appropriate.
