/**
 * FitScore v3 calculator with proper component structure.
 * Updated to match the expected structure in routes.ts
 */

export interface FitScoreV3Result {
  fitScore: number;
  components: {
    recovery: { score: number; details?: string };
    sleep: { score: number; details?: string };
    cardioBalance: { score: number; details?: string };
    strain: { score: number; details?: string };
    nutrition: { score: number; details?: string };
  };
  recommendations: string[];
}

export const fitScoreCalculatorV3 = {
  /**
   * Calculate FitScore from WHOOP data and nutrition
   */
  calculate(params: {
    sleepHours?: number;
    targetSleepHours?: number;
    recoveryPercent?: number;
    currentHRV?: number;
    baselineHRV?: number;
    currentRHR?: number;
    baselineRHR?: number;
    actualStrain?: number;
    targetStrain?: number;
    meals?: any[];
  }, date?: string): FitScoreV3Result {
    // Extract parameters with defaults
    const sleepHours = params.sleepHours || 0;
    const targetSleepHours = params.targetSleepHours || 8;
    const recoveryPercent = params.recoveryPercent || 0;
    const currentHRV = params.currentHRV || 0;
    const currentRHR = params.currentRHR || 0;
    const actualStrain = params.actualStrain || 0;

    // Calculate component scores (1-10 scale)

    // Sleep score: based on hours vs target
    const sleepRatio = sleepHours / targetSleepHours;
    const sleepScore = Math.min(10, Math.max(0, sleepRatio * 10));

    // Recovery score: convert percentage to 1-10 scale
    const recoveryScore = Math.min(10, Math.max(0, (recoveryPercent / 100) * 10));

    // Cardio balance: based on HRV and RHR
    const hrvScore = currentHRV > 0 ? Math.min(10, (currentHRV / 100) * 10) : 5;
    const rhrScore = currentRHR > 0 ? Math.min(10, Math.max(0, 10 - (currentRHR - 40) / 10)) : 5;
    const cardioScore = (hrvScore + rhrScore) / 2;

    // Strain score: reasonable strain is 10-15
    const strainScore = actualStrain > 0 ? Math.min(10, (actualStrain / 15) * 10) : 5;

    // Nutrition score: placeholder
    const nutritionScore = 7;

    // Overall FitScore (1-10 scale)
    const fitScore = (
      sleepScore * 0.25 +
      recoveryScore * 0.25 +
      cardioScore * 0.20 +
      strainScore * 0.20 +
      nutritionScore * 0.10
    );

    return {
      fitScore: Math.round(fitScore * 10) / 10,
      components: {
        recovery: { score: Math.round(recoveryScore * 10) / 10 },
        sleep: { score: Math.round(sleepScore * 10) / 10 },
        cardioBalance: { score: Math.round(cardioScore * 10) / 10 },
        strain: { score: Math.round(strainScore * 10) / 10 },
        nutrition: { score: Math.round(nutritionScore * 10) / 10 },
      },
      recommendations: [],
    };
  },

  /**
   * Generate forecast based on current data
   */
  async generateForecast(params: {
    userId: string;
    sleepHours?: number;
    recoveryPercent?: number;
    currentHRV?: number;
    currentRHR?: number;
    actualStrain?: number;
  }): Promise<{
    forecast: number;
    trend: 'up' | 'down' | 'stable';
    message: string;
  }> {
    const result = this.calculate({
      sleepHours: params.sleepHours,
      targetSleepHours: 8,
      recoveryPercent: params.recoveryPercent,
      currentHRV: params.currentHRV,
      currentRHR: params.currentRHR,
      actualStrain: params.actualStrain,
    });

    return {
      forecast: result.fitScore,
      trend: 'stable',
      message: `Your current FitScore is ${result.fitScore}/10. Keep up the good work!`,
    };
  },
};
