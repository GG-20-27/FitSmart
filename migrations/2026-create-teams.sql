-- Team Competition tables

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  coach_token TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL DEFAULT 'assessment',
  week_start TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  group_name TEXT,
  joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS cheat_days (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  cheat_date TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, team_id, week_start)
);
