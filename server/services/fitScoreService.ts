/**
 * Minimal stub for FitScore calculation service.
 * This file is only meant to satisfy imports and prevent runtime failures.
 */

export interface FitScoreResult {
  date: string;
  score: number;
  components: {
    recovery: number;
    sleep: number;
    strain: number;
    nutrition: number;
  };
  result: {
    fitScore: number;
  };
  isCached: boolean;
}

export interface FormattedFitScore {
  table: string;
  summary: string;
}

export const fitScoreService = {
  /**
   * Get today's FitScore for a user
   */
  async getTodaysFitScore(
    userId: string,
    date: string,
    mealAnalyses: any[]
  ): Promise<FitScoreResult> {
    // Minimal stub - returns default values
    return {
      date,
      score: 0,
      components: {
        recovery: 0,
        sleep: 0,
        strain: 0,
        nutrition: 0,
      },
      result: {
        fitScore: 0,
      },
      isCached: false,
    };
  },

  /**
   * Format FitScore result as markdown table
   */
  formatAsMarkdownTable(result: FitScoreResult): FormattedFitScore {
    // Minimal stub - returns empty table
    return {
      table: '',
      summary: '',
    };
  },
};

