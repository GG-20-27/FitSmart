-- fit_scores had no primary key column; Drizzle schema expects id SERIAL PRIMARY KEY
-- This caused all FitScore inserts to fail silently (non-fatal catch block)
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;
