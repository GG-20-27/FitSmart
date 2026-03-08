ALTER TABLE fit_scores
  ADD COLUMN IF NOT EXISTS nutrition_score REAL,
  ADD COLUMN IF NOT EXISTS training_score REAL,
  ADD COLUMN IF NOT EXISTS recovery_score REAL;

-- Deduplicate before adding unique constraint (keep newest row per user+date)
DELETE FROM fit_scores a USING fit_scores b
  WHERE a.id < b.id AND a.user_id = b.user_id AND a.date = b.date;

ALTER TABLE fit_scores
  ADD CONSTRAINT IF NOT EXISTS fit_scores_user_date_unique UNIQUE (user_id, date);
