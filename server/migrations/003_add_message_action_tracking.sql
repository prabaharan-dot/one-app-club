-- Migration: Add message processing and action tracking columns
-- Date: 2025-11-19
-- Description: Add columns for LLM action processing and tracking

BEGIN;

-- Add action tracking columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS action_suggested JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS actioned BOOLEAN DEFAULT false;

-- Add processed_at column if missing
ALTER TABLE messages ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Add indexes for action tracking
CREATE INDEX IF NOT EXISTS idx_messages_action_required ON messages(user_id) WHERE action_required = true;
CREATE INDEX IF NOT EXISTS idx_messages_actioned ON messages(user_id, actioned) WHERE action_required = true;

-- Add comments for documentation
COMMENT ON COLUMN messages.action_required IS 'True if this message requires user action based on LLM analysis';
COMMENT ON COLUMN messages.action_suggested IS 'JSON array of LLM-suggested actions for this message';
COMMENT ON COLUMN messages.actioned IS 'True if user has taken action on this message';
COMMENT ON COLUMN messages.processed_at IS 'Timestamp when message was processed by LLM';

COMMIT;
