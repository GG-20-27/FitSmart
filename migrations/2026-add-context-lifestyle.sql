-- Add lifestyle context fields to user_context table
ALTER TABLE user_context
  ADD COLUMN IF NOT EXISTS work_hours_per_week TEXT,
  ADD COLUMN IF NOT EXISTS training_sessions_per_week TEXT;
