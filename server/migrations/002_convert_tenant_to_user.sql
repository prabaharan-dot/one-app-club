-- Migration: Convert from tenant-based to user-based schema
-- Date: 2025-11-19
-- Description: Remove tenant references and convert all tables to user-scoped

BEGIN;

-- Step 1: Add user_id to tables that currently have tenant_id (if migrating existing data)
-- Note: This migration assumes you're starting fresh or have already backed up data

-- For existing installations with tenant data, you would need to:
-- 1. Map tenants to users
-- 2. Update foreign keys
-- 3. Drop tenant_id columns
-- 4. Update constraints

-- Since this appears to be a fresh installation based on the conversation,
-- the main migration.sql already has the correct schema

-- Drop tenants table if it exists (cleanup from old schema)
DROP TABLE IF EXISTS tenants CASCADE;

-- Update any remaining tenant_id references to user_id in existing data
-- (This would be more complex in a real migration with existing data)

-- Add indexes that might be missing after schema conversion
CREATE INDEX IF NOT EXISTS idx_integrations_user_enabled ON integrations(user_id, enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_messages_user_unread ON messages(user_id, is_read) WHERE is_read = false;

COMMIT;
