-- Add meal type, notes, and analysis result columns to meals table
ALTER TABLE meals
ADD COLUMN IF NOT EXISTS meal_type TEXT,
ADD COLUMN IF NOT EXISTS meal_notes TEXT,
ADD COLUMN IF NOT EXISTS analysis_result TEXT;
