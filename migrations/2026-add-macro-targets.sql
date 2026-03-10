-- Add body metrics and macro targets to user_context
ALTER TABLE user_context
  ADD COLUMN IF NOT EXISTS weight_kg REAL,
  ADD COLUMN IF NOT EXISTS height_cm REAL,
  ADD COLUMN IF NOT EXISTS protein_target INTEGER,
  ADD COLUMN IF NOT EXISTS calorie_target INTEGER,
  ADD COLUMN IF NOT EXISTS macro_target_overridden BOOLEAN NOT NULL DEFAULT FALSE;
