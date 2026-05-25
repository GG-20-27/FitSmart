-- Add user_id to team_training_plan for per-user session assignments
-- Also drop the old team_id+plan_date unique constraint (was preventing per-user rows)

ALTER TABLE team_training_plan
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

-- Drop the old unique constraint that was enforcing one session per team per day
-- (now we allow one team-wide + optional per-user overrides)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_training_plan_team_id_plan_date_key'
  ) THEN
    ALTER TABLE team_training_plan
      DROP CONSTRAINT team_training_plan_team_id_plan_date_key;
  END IF;
END $$;
