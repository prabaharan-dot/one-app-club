-- Migration: Add last_gmail_poll column to users table
-- Date: 2025-11-19
-- Description: Track last Gmail polling time per user for incremental polling

BEGIN;

-- Add last_gmail_poll column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_gmail_poll TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN users.last_gmail_poll IS 'Timestamp of last Gmail polling for this user - used for incremental polling';

COMMIT;
