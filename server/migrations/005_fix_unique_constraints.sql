-- Migration: Fix unique constraints for user-scoped schema
-- Date: 2025-11-19
-- Description: Update unique indexes to work with user-scoped data model

BEGIN;

-- Drop old indexes if they exist (from tenant-based schema)
DROP INDEX IF EXISTS idx_messages_platform_external;
DROP INDEX IF EXISTS idx_integrations_platform_account;

-- Create new user-scoped unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_platform_external_user 
  ON messages(platform, external_message_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_user_platform_account 
  ON integrations(user_id, platform, external_account_id);

-- Add constraint comments
COMMENT ON INDEX idx_messages_platform_external_user IS 'Ensures unique messages per user per platform';
COMMENT ON INDEX idx_integrations_user_platform_account IS 'Ensures unique integrations per user per platform';

COMMIT;
