-- Add analysis_result column to training_data table to store AI-generated training analysis
ALTER TABLE training_data
ADD COLUMN IF NOT EXISTS analysis_result TEXT;

-- Add training_score column to store the calculated score (1-10)
ALTER TABLE training_data
ADD COLUMN IF NOT EXISTS training_score REAL;
