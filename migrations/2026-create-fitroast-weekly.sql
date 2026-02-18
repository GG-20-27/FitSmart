-- FitRoast: weekly roast stored once per user per week
CREATE TABLE IF NOT EXISTS fitroast_weekly (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL, -- YYYY-MM-DD (Monday, Zurich)
  week_end TEXT NOT NULL,   -- YYYY-MM-DD (Sunday, Zurich)
  payload_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fitroast_weekly_user_week_unique UNIQUE (user_id, week_end)
);

CREATE INDEX IF NOT EXISTS idx_fitroast_weekly_user_week
  ON fitroast_weekly(user_id, week_end);
