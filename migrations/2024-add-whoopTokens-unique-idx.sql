-- Make ON CONFLICT (userId) work
-- Add unique constraint to whoop_tokens userId if it doesn't exist
DO $$
BEGIN
    -- Check if the unique constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'whoop_tokens_userid_uq' 
        AND table_name = 'whoop_tokens'
    ) THEN
        -- Add the unique constraint
        ALTER TABLE whoop_tokens
        ADD CONSTRAINT whoop_tokens_userid_uq UNIQUE (user_id);
    END IF;
END $$;