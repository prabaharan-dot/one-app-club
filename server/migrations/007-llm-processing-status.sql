-- Migration 007: Add LLM processing status tracking to messages

-- Add LLM processing status columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS llm_processed BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS llm_processing_attempts INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS llm_last_attempt TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS llm_error TEXT;

-- Index for finding unprocessed messages
CREATE INDEX IF NOT EXISTS idx_messages_llm_unprocessed ON messages(user_id, llm_processed, received_at DESC) WHERE llm_processed = false;

-- Index for retry logic
CREATE INDEX IF NOT EXISTS idx_messages_llm_retry ON messages(llm_processing_attempts, llm_last_attempt) WHERE llm_processed = false;
