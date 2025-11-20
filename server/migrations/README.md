# Database Migrations

**NOTICE:** Individual migration files have been consolidated into `../src/migration.sql`.

## Schema Setup

For new installations or complete database recreation, use the consolidated migration file:

```bash
# Drop and recreate database (if needed)
psql -h localhost -U username -c "DROP DATABASE IF EXISTS oneappclub;"
psql -h localhost -U username -c "CREATE DATABASE oneappclub;"

# Apply complete schema
psql -h localhost -U username -d oneappclub -f ../src/migration.sql
```

## What's Included

The consolidated `migration.sql` file includes all features from the previous individual migrations:

- **User-scoped data model** (converted from tenant-based)
- **Gmail polling timestamps** for incremental sync
- **Message action tracking** for LLM-suggested actions  
- **Chat persistence** with sessions and context-aware messages
- **LLM processing status** tracking with retry logic
- **Daily briefing cache** for performance
- **Enhanced indexes** for optimal query performance
- **Audit logging** and user settings
- **Calendar events** and task management tables

## Migration History

Previous individual migration files (now consolidated):
- 001_add_last_gmail_poll.sql
- 002_convert_tenant_to_user.sql  
- 003_add_message_action_tracking.sql
- 004_chat_persistence.sql
- 004_create_message_actions_table.sql
- 005_fix_unique_constraints.sql
- 006-enhanced-llm-support.sql
- 007-llm-processing-status.sql

## Development Notes

1. **Backup First**: Always backup your database before running migrations
2. **Test Environment**: Test migrations in a development environment first
3. **Breaking Changes**: Migration 002 removes the tenant-based model - ensure your application code is updated
4. **Idempotent**: All migrations use `IF NOT EXISTS` and similar patterns to be safe for re-running

- The migration file uses `IF NOT EXISTS` and transactions for safe repeated runs
- All tables include proper indexes for performance
- Foreign key constraints ensure data integrity
- Comments are included for all major columns and tables
- The schema supports chat persistence with immediate database sync
- LLM processing includes retry logic and error handling
