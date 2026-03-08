-- Plan habits: habits auto-generated when a user activates an improvement plan
CREATE TABLE IF NOT EXISTS plan_habits (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id INT NOT NULL REFERENCES improvement_plans(id) ON DELETE CASCADE,
  habit_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, plan_id, habit_key)
);

-- Habit checkins: daily check-in state for each plan habit
CREATE TABLE IF NOT EXISTS habit_checkins (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  habit_key TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  checked BOOLEAN NOT NULL DEFAULT false,
  source TEXT DEFAULT 'plan',
  UNIQUE(user_id, habit_key, date)
);

CREATE INDEX IF NOT EXISTS idx_plan_habits_plan ON plan_habits(plan_id);
CREATE INDEX IF NOT EXISTS idx_habit_checkins_user_date ON habit_checkins(user_id, date);
