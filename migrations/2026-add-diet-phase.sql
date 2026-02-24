ALTER TABLE user_context
  ADD COLUMN IF NOT EXISTS tier2_diet_phase TEXT NOT NULL DEFAULT 'Maintenance';
