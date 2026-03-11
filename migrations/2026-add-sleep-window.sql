ALTER TABLE user_context
  ADD COLUMN IF NOT EXISTS sleep_bedtime TEXT,
  ADD COLUMN IF NOT EXISTS sleep_wake_time TEXT;
