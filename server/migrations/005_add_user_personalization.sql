-- Migration: Add personalization columns to users table
-- Date: 2025-11-21

-- Add profile personalization columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_note TEXT;

-- Add comments for documentation
COMMENT ON COLUMN users.location IS 'User location for personalized assistance (e.g., San Francisco, CA)';
COMMENT ON COLUMN users.personal_note IS 'Personal note for LLM to understand user context, preferences, and work style';

-- Index for potential future location-based queries
CREATE INDEX IF NOT EXISTS idx_users_location ON users(location) WHERE location IS NOT NULL;
