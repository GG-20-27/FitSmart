-- Team coach training plan: one row per team per date
-- Stores the coach-prescribed session so FitLook can contextualise it against recovery

CREATE TABLE IF NOT EXISTS team_training_plan (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  plan_date      TEXT NOT NULL,             -- YYYY-MM-DD
  session_title  TEXT NOT NULL,
  type           TEXT NOT NULL,             -- strength | cardio | technique | rest | mobility | etc.
  duration_minutes INTEGER,
  intensity      TEXT,                      -- low | moderate | high
  description    TEXT,                      -- coach's detailed session notes
  coach_notes    TEXT,                      -- extra tips / motivation
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(team_id, plan_date)                -- one session per team per day
);
