-- Phase 1 Features Migration: Email Templates, Snoozing, and Enhanced Search
-- Run Date: 2024-12-04

BEGIN;

-- Email Templates for Quick Responses
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject_template TEXT,
  body_template TEXT NOT NULL,
  category TEXT DEFAULT 'general', -- 'meeting_decline', 'follow_up', 'thank_you', 'general'
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Email Snoozing and Follow-up Features
ALTER TABLE messages ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS follow_up_reminder TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_snoozed BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS snooze_count INTEGER DEFAULT 0;

-- Saved Searches for Enhanced Search
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  search_type TEXT DEFAULT 'semantic', -- 'semantic', 'keyword', 'advanced'
  filters JSONB DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Search History for Analytics
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  search_type TEXT DEFAULT 'semantic',
  results_count INTEGER DEFAULT 0,
  clicked_result_id UUID REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_email_templates_user_category ON email_templates(user_id, category);
CREATE INDEX IF NOT EXISTS idx_messages_snoozed ON messages(user_id, snoozed_until) WHERE is_snoozed = true;
CREATE INDEX IF NOT EXISTS idx_messages_follow_up ON messages(user_id, follow_up_reminder) WHERE follow_up_reminder IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_user_time ON search_history(user_id, created_at DESC);

-- Update function to handle snooze expiration
CREATE OR REPLACE FUNCTION check_snoozed_messages()
RETURNS VOID AS $$
BEGIN
  UPDATE messages 
  SET is_snoozed = false, snoozed_until = NULL
  WHERE is_snoozed = true AND snoozed_until <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE email_templates IS 'User-defined email templates for quick responses';
COMMENT ON COLUMN messages.snoozed_until IS 'Timestamp when snoozed email should reappear';
COMMENT ON COLUMN messages.follow_up_reminder IS 'Timestamp for follow-up reminder on sent emails';
COMMENT ON TABLE saved_searches IS 'User saved search queries with semantic and keyword options';

COMMIT;
