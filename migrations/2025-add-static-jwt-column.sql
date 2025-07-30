-- Add staticJwt column to whoop_tokens table for long-lived Bearer tokens
ALTER TABLE whoop_tokens ADD COLUMN IF NOT EXISTS "staticJwt" varchar(512);