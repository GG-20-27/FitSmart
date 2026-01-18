-- Create training_data table
CREATE TABLE IF NOT EXISTS training_data (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL, -- YYYY-MM-DD format
  type TEXT NOT NULL, -- Training type (e.g., "Morning Run", "Strength Training")
  duration INTEGER NOT NULL, -- Duration in minutes
  goal TEXT, -- Training goal (e.g., "Endurance", "Strength")
  intensity TEXT, -- Low, Moderate, High
  comment TEXT, -- Optional user comment
  skipped BOOLEAN NOT NULL DEFAULT FALSE, -- Whether training was skipped
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add index on user_id and date for faster queries
CREATE INDEX IF NOT EXISTS idx_training_data_user_date ON training_data(user_id, date);
