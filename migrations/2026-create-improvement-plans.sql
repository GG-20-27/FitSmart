CREATE TABLE IF NOT EXISTS improvement_plans (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pillar TEXT NOT NULL,
  status TEXT NOT NULL,
  activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  rolling_avg_at_completion REAL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_improvement_plans_user ON improvement_plans(user_id, status);
