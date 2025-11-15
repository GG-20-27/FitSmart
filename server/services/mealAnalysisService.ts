/**
 * Minimal stub for meal analysis service.
 * This file is only meant to satisfy imports and prevent runtime failures.
 */

export interface MealAnalysisOptions {
  imageUrls: string[];
  userGoals?: {
    targetCalories?: number;
    targetProtein?: number;
    fitnessGoal?: string;
  };
  mealNumber?: number;
}

export interface MealAnalysis {
  mealNumber: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  summary?: string;
}

export const mealAnalysisService = {
  /**
   * Analyze meal images for nutrition information
   */
  async analyzeMeals(options: MealAnalysisOptions): Promise<MealAnalysis> {
    // Minimal stub - returns default values
    return {
      mealNumber: options.mealNumber || 1,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      summary: 'Meal analysis unavailable',
    };
  },
};

