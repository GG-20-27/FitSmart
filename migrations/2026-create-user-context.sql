-- User context: stores AI persona context inputs per user (upsert-based, one row per user)
CREATE TABLE IF NOT EXISTS user_context (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Tier 1: Identity
  tier1_goal TEXT NOT NULL DEFAULT 'Holistic balance',
  tier1_priority TEXT NOT NULL DEFAULT 'Balanced with life',

  -- Tier 2: Current Phase + Constraints
  tier2_phase TEXT NOT NULL DEFAULT 'Maintenance',
  tier2_emphasis TEXT NOT NULL DEFAULT 'General health',
  injury_type TEXT,
  injury_location TEXT,
  rehab_stage TEXT,

  -- Tier 3: This Week
  tier3_week_load TEXT NOT NULL DEFAULT 'Normal',
  tier3_stress TEXT NOT NULL DEFAULT 'Medium',
  tier3_sleep_expectation TEXT NOT NULL DEFAULT 'Uncertain'
);

CREATE INDEX IF NOT EXISTS idx_user_context_user_id ON user_context(user_id);
