# Database Migration Guide

This directory contains SQL migration files for the One App Club project. Migrations are numbered sequentially and should be applied in order.

## Migration Files

### 001_add_last_gmail_poll.sql
- Adds `last_gmail_poll` column to users table
- Enables incremental Gmail polling per user
- Safe to run on existing installations

### 002_convert_tenant_to_user.sql
- Converts schema from tenant-based to user-based model
- Removes tenants table
- Adds user-scoped indexes
- **Warning**: This is a breaking change for existing tenant-based data

### 003_add_message_action_tracking.sql
- Adds action tracking columns to messages table
- Enables LLM action suggestion workflow
- Adds necessary indexes for performance

### 004_create_message_actions_table.sql
- Creates dedicated table for storing LLM-suggested actions
- Allows multiple action sets per message
- Includes performance indexes

### 005_fix_unique_constraints.sql
- Updates unique constraints for user-scoped model
- Ensures data integrity in new schema
- Replaces old tenant-based constraints

## Running Migrations

### Method 1: Manual Execution
Run each migration file in order using psql:
```bash
psql -d your_database -f migrations/001_add_last_gmail_poll.sql
psql -d your_database -f migrations/002_convert_tenant_to_user.sql
# ... continue with remaining files
```

### Method 2: Using the main migration file
The `migration.sql` file in the src directory contains all schema definitions and can be run as a complete setup:
```bash
psql -d your_database -f src/migration.sql
```

## Important Notes

1. **Backup First**: Always backup your database before running migrations
2. **Test Environment**: Test migrations in a development environment first
3. **Breaking Changes**: Migration 002 removes the tenant-based model - ensure your application code is updated
4. **Idempotent**: All migrations use `IF NOT EXISTS` and similar patterns to be safe for re-running

## Migration Strategy for Existing Data

If you have existing tenant-based data, you'll need a data migration strategy:

1. Export existing data
2. Map tenants to users (1:1 or based on business logic)
3. Update foreign key references
4. Import data into new schema
5. Verify data integrity

## Rollback Strategy

These migrations don't include rollback scripts. For production use, consider:
- Creating rollback scripts for each migration
- Using a migration tool like Flyway, Liquibase, or node-pg-migrate
- Implementing proper backup/restore procedures
