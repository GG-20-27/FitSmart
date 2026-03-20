-- Add completed_at column to user_goals table
-- Null = active goal, non-null = completed/archived goal
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
