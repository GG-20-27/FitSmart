-- FitLook Daily: Stores one immutable morning outlook per user per day
CREATE TABLE IF NOT EXISTS fitlook_daily (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_local TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fitlook_daily_user_date_unique UNIQUE (user_id, date_local)
);

CREATE INDEX IF NOT EXISTS idx_fitlook_daily_user_date
  ON fitlook_daily(user_id, date_local);
