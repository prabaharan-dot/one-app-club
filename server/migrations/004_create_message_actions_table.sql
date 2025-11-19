-- Migration: Create message_actions table for LLM suggestions
-- Date: 2025-11-19
-- Description: Create table to store LLM-suggested actions separately from messages

BEGIN;

-- Create message_actions table if it doesn't exist
CREATE TABLE IF NOT EXISTS message_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggested_actions JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  acted BOOLEAN DEFAULT false
);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_message_actions_user ON message_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_message_actions_message ON message_actions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_actions_acted ON message_actions(user_id, acted) WHERE acted = false;

-- Add comments for documentation
COMMENT ON TABLE message_actions IS 'Stores LLM-suggested actions for messages - allows multiple suggestion sets per message';
COMMENT ON COLUMN message_actions.suggested_actions IS 'JSON array of suggested actions from LLM processing';
COMMENT ON COLUMN message_actions.acted IS 'True if user has acted on these suggestions';

COMMIT;
