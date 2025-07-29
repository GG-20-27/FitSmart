-- Migration to fix database constraints
-- Add proper PRIMARY and UNIQUE constraints

-- 1. Add primary key constraint to whoop_tokens if not exists
DO $$ 
BEGIN
    -- Check if primary key constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_type = 'PRIMARY KEY' 
        AND table_name = 'whoop_tokens'
    ) THEN
        -- Remove duplicates first - keep most recent token per user
        DELETE FROM whoop_tokens 
        WHERE (user_id, created_at) NOT IN (
            SELECT user_id, MAX(created_at) 
            FROM whoop_tokens 
            GROUP BY user_id
        );
        
        -- Add primary key constraint
        ALTER TABLE whoop_tokens ADD CONSTRAINT whoop_tokens_pkey PRIMARY KEY (user_id);
    END IF;
END $$;

-- 2. Add composite primary key constraint to whoop_data if not exists  
DO $$
BEGIN
    -- Check if primary key constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_type = 'PRIMARY KEY' 
        AND table_name = 'whoop_data'
    ) THEN
        -- Remove duplicates first - keep most recent data per user/date
        DELETE FROM whoop_data 
        WHERE (user_id, date, last_sync) NOT IN (
            SELECT user_id, date, MAX(last_sync) 
            FROM whoop_data 
            GROUP BY user_id, date
        );
        
        -- Add composite primary key constraint
        ALTER TABLE whoop_data ADD CONSTRAINT whoop_data_pkey PRIMARY KEY (user_id, date);
    END IF;
END $$;

-- 3. Add foreign key constraints if they don't exist
DO $$
BEGIN
    -- whoop_tokens foreign key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.referential_constraints 
        WHERE constraint_name = 'whoop_tokens_user_id_fkey'
    ) THEN
        ALTER TABLE whoop_tokens ADD CONSTRAINT whoop_tokens_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    -- whoop_data foreign key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.referential_constraints 
        WHERE constraint_name = 'whoop_data_user_id_fkey'
    ) THEN
        ALTER TABLE whoop_data ADD CONSTRAINT whoop_data_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;