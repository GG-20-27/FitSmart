-- Drop the old constraint first
ALTER TABLE meals
DROP CONSTRAINT IF EXISTS meals_meal_type_check;

-- Update existing lowercase values to capitalized format
UPDATE meals
SET meal_type = CASE
  WHEN meal_type = 'breakfast' THEN 'Breakfast'
  WHEN meal_type = 'brunch' THEN 'Brunch'
  WHEN meal_type = 'lunch' THEN 'Lunch'
  WHEN meal_type = 'dinner' THEN 'Dinner'
  WHEN meal_type = 'snack' THEN 'Snack #1'
  WHEN meal_type = 'pre-workout' THEN 'Snack #1'
  ELSE meal_type
END
WHERE meal_type IS NOT NULL;

-- Add new constraint with correct meal type values
ALTER TABLE meals
ADD CONSTRAINT meals_meal_type_check
CHECK (meal_type IN ('Breakfast', 'Brunch', 'Lunch', 'Dinner', 'Snack #1', 'Snack #2'));
