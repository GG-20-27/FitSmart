/**
 * Recovery Score Service - Calculates recovery quality score (1-10)
 *
 * Scoring Formula:
 * - 40% Recovery % (WHOOP recovery score)
 * - 40% Sleep Quality (sleep hours + sleep score)
 * - 20% HRV Trend (vs 7-day baseline)
 * Reduced recovery% weight (was 50%) to avoid double-counting — WHOOP recovery already reflects HRV + sleep internally.
 */

export interface RecoveryScoreInput {
  // WHOOP recovery data
  recoveryPercent?: number; // 0-100
  sleepHours?: number;
  sleepScorePercent?: number; // 0-100
  hrv?: number; // ms
  hrvBaseline?: number; // 7-day average HRV
}

export interface RecoveryScoreResult {
  score: number; // 1-10
  breakdown: {
    recoveryScaled: number; // 0-10 (40% weight)
    sleepQuality: number; // 0-10 (40% weight)
    hrvScaled: number; // 0-10 (20% weight)
  };
  analysis: string;
  recoveryZone: 'green' | 'yellow' | 'red';
}

export class RecoveryScoreService {
  /**
   * Calculate recovery score for a day
   */
  calculateRecoveryScore(input: RecoveryScoreInput): RecoveryScoreResult {
    // Calculate each component
    const recoveryScaled = this.calculateRecoveryScaled(input.recoveryPercent);
    const sleepQuality = this.calculateSleepQuality(input.sleepHours, input.sleepScorePercent);
    const hrvScaled = this.calculateHrvScaled(input.hrv, input.hrvBaseline);

    // Determine recovery zone based on WHOOP recovery %
    const recoveryZone = this.getRecoveryZone(input.recoveryPercent);

    // Apply weighted formula (0.40 / 0.40 / 0.20)
    const totalScore =
      (recoveryScaled * 0.40) +
      (sleepQuality * 0.40) +
      (hrvScaled * 0.20);

    // Generate analysis
    const analysis = this.generateAnalysis(
      totalScore,
      recoveryZone,
      input,
      { recoveryScaled, sleepQuality, hrvScaled }
    );

    return {
      score: Math.max(1, Math.min(10, Math.round(totalScore * 10) / 10)),
      breakdown: {
        recoveryScaled,
        sleepQuality,
        hrvScaled,
      },
      analysis,
      recoveryZone,
    };
  }

  /**
   * Get recovery zone based on WHOOP thresholds
   */
  private getRecoveryZone(recoveryPercent?: number): 'green' | 'yellow' | 'red' {
    if (!recoveryPercent && recoveryPercent !== 0) return 'yellow';

    if (recoveryPercent >= 67) return 'green';  // 67-100%
    if (recoveryPercent >= 34) return 'yellow'; // 34-66%
    return 'red';                                // 0-33%
  }

  /**
   * Scale recovery % to 1-10 (50% weight)
   * Linear mapping: recovery_scaled = (recovery_percent / 100) * 10
   */
  private calculateRecoveryScaled(recoveryPercent?: number): number {
    if (!recoveryPercent && recoveryPercent !== 0) {
      return 5; // Default to neutral if missing
    }

    const scaled = (recoveryPercent / 100) * 10;
    return Math.max(0, Math.min(10, Math.round(scaled * 10) / 10));
  }

  /**
   * Calculate sleep quality score (35% weight)
   * Combines sleep hours (0-6 points) + sleep score (0-4 points)
   */
  private calculateSleepQuality(sleepHours?: number, sleepScorePercent?: number): number {
    let hoursPoints = 0;
    let sleepScorePoints = 0;

    // Sleep hours points (0-6)
    if (sleepHours !== undefined && sleepHours !== null) {
      if (sleepHours >= 8.0) {
        hoursPoints = 6;
      } else if (sleepHours >= 7.0) {
        hoursPoints = 5;
      } else if (sleepHours >= 6.0) {
        hoursPoints = 4;
      } else if (sleepHours >= 5.0) {
        hoursPoints = 3;
      } else if (sleepHours >= 4.0) {
        hoursPoints = 2;
      } else {
        hoursPoints = 1;
      }
    } else {
      hoursPoints = 3; // Default to neutral if missing
    }

    // Sleep score points (0-4)
    if (sleepScorePercent !== undefined && sleepScorePercent !== null) {
      sleepScorePoints = Math.round((sleepScorePercent / 100) * 4);
    } else {
      sleepScorePoints = 2; // Default to neutral if missing
    }

    // Total sleep quality (0-10)
    const sleepQuality = hoursPoints + sleepScorePoints;
    return Math.max(0, Math.min(10, sleepQuality));
  }

  /**
   * Calculate HRV trend score (15% weight)
   * Compares today's HRV with 7-day baseline
   * Returns 3-7 range (centered at 5 = neutral)
   */
  private calculateHrvScaled(hrv?: number, hrvBaseline?: number): number {
    // If no HRV data, return neutral
    if (!hrv || !hrvBaseline) {
      return 5;
    }

    const delta = hrv - hrvBaseline;

    // Apply tiered scoring
    let deltaPoints = 0;
    if (delta >= 8) {
      deltaPoints = 2;
    } else if (delta >= 3) {
      deltaPoints = 1;
    } else if (delta >= -2) {
      deltaPoints = 0;
    } else if (delta >= -7) {
      deltaPoints = -1;
    } else {
      deltaPoints = -2;
    }

    // Scale to 0-10 range (centered at 5)
    const hrvScaled = 5 + deltaPoints;
    return Math.max(3, Math.min(7, hrvScaled));
  }

  /**
   * Generate human-readable analysis
   */
  private generateAnalysis(
    totalScore: number,
    recoveryZone: 'green' | 'yellow' | 'red',
    input: RecoveryScoreInput,
    breakdown: {
      recoveryScaled: number;
      sleepQuality: number;
      hrvScaled: number;
    }
  ): string {
    const parts: string[] = [];

    // Overall assessment
    if (totalScore >= 8) {
      parts.push('Excellent recovery state');
    } else if (totalScore >= 6) {
      parts.push('Good recovery');
    } else if (totalScore >= 4) {
      parts.push('Moderate recovery');
    } else {
      parts.push('Recovery needs attention');
    }

    // Recovery zone feedback
    if (recoveryZone === 'green') {
      parts.push('Your body is well-recovered and ready for high-intensity training');
    } else if (recoveryZone === 'yellow') {
      parts.push('Moderate recovery suggests balanced training intensity today');
    } else {
      parts.push('Low recovery indicates prioritizing rest or light activity');
    }

    // Sleep feedback
    if (input.sleepHours !== undefined) {
      if (input.sleepHours >= 7.5) {
        parts.push(`${input.sleepHours.toFixed(1)} hours of sleep provides a strong foundation`);
      } else if (input.sleepHours >= 6) {
        parts.push(`${input.sleepHours.toFixed(1)} hours of sleep is adequate but more would help`);
      } else {
        parts.push(`${input.sleepHours.toFixed(1)} hours of sleep is below optimal for recovery`);
      }
    }

    // HRV feedback
    if (input.hrv && input.hrvBaseline) {
      const delta = input.hrv - input.hrvBaseline;
      if (delta >= 3) {
        parts.push('HRV trending above baseline indicates good adaptation');
      } else if (delta <= -3) {
        parts.push('HRV below baseline may indicate accumulated stress');
      }
    }

    return parts.join('. ') + '.';
  }
}

export const recoveryScoreService = new RecoveryScoreService();
