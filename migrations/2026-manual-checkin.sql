-- Migration: add manual_checkins table for manual-mode users daily check-in
CREATE TABLE IF NOT EXISTS manual_checkins (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,           -- YYYY-MM-DD
  recovery INTEGER NOT NULL,    -- 1-10
  energy INTEGER NOT NULL,      -- 1-10
  sleep_hours REAL NOT NULL,    -- e.g. 7.5
  sleep_quality TEXT NOT NULL,  -- 'poor' | 'ok' | 'great'
  recovery_score REAL NOT NULL, -- computed: 0.5*recovery + 0.3*energy + 0.2*sleep_score
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, date)
);
