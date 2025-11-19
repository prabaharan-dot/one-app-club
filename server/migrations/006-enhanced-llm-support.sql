-- Migration 006: Add daily briefing cache and enhanced LLM support

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

-- Add last_gmail_poll column to users table if not exists (for incremental polling)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_gmail_poll TIMESTAMPTZ;

-- Add preferences column to users for LLM personalization
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

-- Enhance llm_calls table with more metadata
ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS processor_type TEXT;
ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS input_size INT;
ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS processing_time_ms INT;

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
