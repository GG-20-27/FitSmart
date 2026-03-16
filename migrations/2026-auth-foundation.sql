-- Phase 1: Auth Foundation — internal user model fields
-- Adds authProvider, dataSource, passwordHash; relaxes whoopUserId NOT NULL constraint

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'whoop';
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'whoop';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ALTER COLUMN whoop_user_id DROP NOT NULL;
