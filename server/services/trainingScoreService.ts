/**
 * Training Score Service - Calculates training quality score (1-10)
 *
 * Scoring Formula:
 * - 40% Strain Appropriateness (adjusted for recovery zone)
 * - 30% Session Quality (duration, intensity, comment sentiment)
 * - 20% Goal Alignment (matches user's fitness goal)
 * - 10% Injury Safety Modifier
 */

export interface TrainingScoreInput {
  // Training session data
  type: string;
  duration: number; // minutes
  intensity?: string; // 'Low', 'Moderate', 'High'
  goal?: string; // Training goal
  comment?: string; // User comment
  skipped: boolean;

  // WHOOP data for the date
  recoveryScore?: number; // 0-100
  strainScore?: number; // WHOOP strain (typically 0-21)

  // User's fitness goal from user_goals table
  fitnessGoal?: string;
}

export interface TrainingScoreResult {
  score: number; // 1-10
  breakdown: {
    strainAppropriatenessScore: number; // 0-4 (40%)
    sessionQualityScore: number; // 0-3 (30%)
    goalAlignmentScore: number; // 0-2 (20%)
    injurySafetyModifier: number; // 0-1 (10%)
  };
  analysis: string;
  recoveryZone: 'green' | 'yellow' | 'red';
}

export class TrainingScoreService {
  /**
   * Calculate training score for a session
   */
  calculateTrainingScore(input: TrainingScoreInput): TrainingScoreResult {
    if (input.skipped) {
      return {
        score: 0,
        breakdown: {
          strainAppropriatenessScore: 0,
          sessionQualityScore: 0,
          goalAlignmentScore: 0,
          injurySafetyModifier: 0,
        },
        analysis: 'Training was skipped',
        recoveryZone: 'red',
      };
    }

    // Determine recovery zone
    const recoveryZone = this.getRecoveryZone(input.recoveryScore);

    // Calculate each component
    const strainAppropriatenessScore = this.calculateStrainAppropriateness(
      input.strainScore,
      recoveryZone,
      input.recoveryScore
    );

    const sessionQualityScore = this.calculateSessionQuality(
      input.duration,
      input.intensity,
      input.comment
    );

    const goalAlignmentScore = this.calculateGoalAlignment(
      input.type,
      input.goal,
      input.fitnessGoal
    );

    const injurySafetyModifier = this.calculateInjurySafety(
      input.recoveryScore,
      input.intensity,
      input.comment
    );

    // Total score (0-10 scale)
    const totalScore =
      strainAppropriatenessScore +
      sessionQualityScore +
      goalAlignmentScore +
      injurySafetyModifier;

    // Generate analysis
    const analysis = this.generateAnalysis(
      totalScore,
      recoveryZone,
      input,
      {
        strainAppropriatenessScore,
        sessionQualityScore,
        goalAlignmentScore,
        injurySafetyModifier,
      }
    );

    return {
      score: Math.max(1, Math.min(10, Math.round(totalScore * 10) / 10)),
      breakdown: {
        strainAppropriatenessScore,
        sessionQualityScore,
        goalAlignmentScore,
        injurySafetyModifier,
      },
      analysis,
      recoveryZone,
    };
  }

  /**
   * Determine recovery zone based on recovery score
   */
  private getRecoveryZone(recoveryScore?: number): 'green' | 'yellow' | 'red' {
    if (!recoveryScore) return 'yellow'; // Default to caution

    if (recoveryScore >= 70) return 'green';   // 70-100%: Ready
    if (recoveryScore >= 40) return 'yellow';  // 40-69%: Monitor
    return 'red';                               // 0-39%: Rest
  }

  /**
   * Calculate strain appropriateness (40% of total score = 0-4 points)
   * Evaluates if the strain level was appropriate for the recovery state
   */
  private calculateStrainAppropriateness(
    strainScore?: number,
    recoveryZone: 'green' | 'yellow' | 'red' = 'yellow',
    recoveryScore?: number
  ): number {
    // If no strain data available, return moderate score
    if (!strainScore) {
      return 2.4; // 60% of 4 points
    }

    // Define optimal strain ranges for each recovery zone
    // WHOOP strain typically ranges 0-21
    const optimalRanges = {
      green: { min: 8, max: 18, ideal: 13 },   // Can handle high strain
      yellow: { min: 5, max: 12, ideal: 8.5 }, // Moderate strain
      red: { min: 0, max: 8, ideal: 4 },       // Light activity or rest
    };

    const range = optimalRanges[recoveryZone];

    // Calculate how well the strain matches the optimal range
    let score = 0;

    if (strainScore >= range.min && strainScore <= range.max) {
      // Within optimal range - calculate how close to ideal
      const distanceFromIdeal = Math.abs(strainScore - range.ideal);
      const maxDistance = (range.max - range.min) / 2;
      score = 4 - (distanceFromIdeal / maxDistance) * 1; // 3-4 points
    } else if (strainScore < range.min) {
      // Under-training
      const underBy = range.min - strainScore;
      score = Math.max(1.5, 3 - (underBy / range.min) * 1.5); // 1.5-3 points
    } else {
      // Over-training (more problematic)
      const overBy = strainScore - range.max;
      const penalty = (overBy / range.max) * 3;
      score = Math.max(0.5, 3 - penalty); // 0.5-3 points

      // Extra penalty for high strain in red zone
      if (recoveryZone === 'red' && strainScore > 10) {
        score = Math.max(0.5, score - 1);
      }
    }

    return Math.max(0, Math.min(4, score));
  }

  /**
   * Calculate session quality (30% of total score = 0-3 points)
   * Based on duration, intensity, and comment sentiment
   */
  private calculateSessionQuality(
    duration: number,
    intensity?: string,
    comment?: string
  ): number {
    let score = 0;

    // Duration scoring (0-1.2 points)
    if (duration >= 30 && duration <= 90) {
      score += 1.2; // Optimal duration
    } else if (duration >= 20 && duration < 30) {
      score += 0.9; // Short but acceptable
    } else if (duration > 90 && duration <= 120) {
      score += 1.0; // Long session
    } else if (duration > 120) {
      score += 0.7; // Very long (potential overtraining)
    } else {
      score += 0.4; // Very short
    }

    // Intensity scoring (0-1.0 points)
    const intensityLower = intensity?.toLowerCase();
    if (intensityLower === 'moderate') {
      score += 1.0; // Ideal for most sessions
    } else if (intensityLower === 'high') {
      score += 0.9; // Good if recovery supports it
    } else if (intensityLower === 'low') {
      score += 0.7; // Light activity
    } else {
      score += 0.6; // No intensity specified
    }

    // Comment sentiment (0-0.8 points)
    if (comment) {
      const sentiment = this.analyzeCommentSentiment(comment);
      score += sentiment * 0.8;
    } else {
      score += 0.4; // No comment = neutral
    }

    return Math.max(0, Math.min(3, score));
  }

  /**
   * Calculate goal alignment (20% of total score = 0-2 points)
   * Evaluates if training aligns with user's fitness goal
   */
  private calculateGoalAlignment(
    trainingType: string,
    trainingGoal?: string,
    fitnessGoal?: string
  ): number {
    // If no goals specified, return moderate score
    if (!trainingGoal && !fitnessGoal) {
      return 1.2; // 60% of 2 points
    }

    const type = trainingType.toLowerCase();
    const tGoal = trainingGoal?.toLowerCase() || '';
    const fGoal = fitnessGoal?.toLowerCase() || '';

    // Define goal-activity alignments
    const alignments = {
      strength: ['strength', 'weights', 'resistance', 'muscle', 'power', 'lifting'],
      endurance: ['endurance', 'cardio', 'running', 'cycling', 'stamina', 'aerobic'],
      weight_loss: ['weight loss', 'fat loss', 'cardio', 'hiit', 'running'],
      flexibility: ['flexibility', 'yoga', 'stretching', 'mobility'],
      general: ['health', 'fitness', 'wellness', 'general'],
    };

    let alignmentScore = 0;

    // Check if training type matches fitness goal
    for (const [goalCategory, keywords] of Object.entries(alignments)) {
      const matchesFitnessGoal = keywords.some(keyword => fGoal.includes(keyword));
      const matchesTrainingGoal = keywords.some(keyword => tGoal.includes(keyword));
      const matchesTrainingType = keywords.some(keyword => type.includes(keyword));

      if (matchesFitnessGoal && (matchesTrainingType || matchesTrainingGoal)) {
        alignmentScore = 2.0; // Perfect alignment
        break;
      } else if (matchesFitnessGoal || (matchesTrainingType && matchesTrainingGoal)) {
        alignmentScore = Math.max(alignmentScore, 1.5); // Good alignment
      } else if (matchesTrainingType || matchesTrainingGoal) {
        alignmentScore = Math.max(alignmentScore, 1.0); // Partial alignment
      }
    }

    // If no alignment found, give moderate score
    if (alignmentScore === 0) {
      alignmentScore = 1.2; // 60% - training is still valuable
    }

    return Math.max(0, Math.min(2, alignmentScore));
  }

  /**
   * Calculate injury safety modifier (10% of total score = 0-1 points)
   * Penalizes high intensity training when recovery is poor
   */
  private calculateInjurySafety(
    recoveryScore?: number,
    intensity?: string,
    comment?: string
  ): number {
    let score = 1.0; // Start with full points

    // Check for red flags in comment
    if (comment) {
      const redFlags = ['pain', 'hurt', 'injury', 'sore', 'ache', 'strain', 'pulled'];
      const commentLower = comment.toLowerCase();

      if (redFlags.some(flag => commentLower.includes(flag))) {
        score -= 0.4; // Penalty for pain/injury mentions
      }
    }

    // Check intensity vs recovery
    if (recoveryScore && intensity) {
      const intensityLower = intensity.toLowerCase();

      if (recoveryScore < 40 && intensityLower === 'high') {
        score -= 0.4; // High intensity in red zone
      } else if (recoveryScore < 55 && intensityLower === 'high') {
        score -= 0.2; // High intensity in lower yellow zone
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Analyze comment sentiment (0-1 scale)
   */
  private analyzeCommentSentiment(comment: string): number {
    const commentLower = comment.toLowerCase();

    // Positive indicators
    const positive = ['great', 'good', 'excellent', 'strong', 'easy', 'felt good', 'energized', 'amazing'];
    // Negative indicators
    const negative = ['hard', 'difficult', 'struggled', 'tired', 'exhausted', 'painful', 'bad'];

    let sentiment = 0.5; // Neutral

    const positiveCount = positive.filter(word => commentLower.includes(word)).length;
    const negativeCount = negative.filter(word => commentLower.includes(word)).length;

    if (positiveCount > negativeCount) {
      sentiment = 0.7 + (positiveCount * 0.1);
    } else if (negativeCount > positiveCount) {
      sentiment = 0.3 - (negativeCount * 0.1);
    }

    return Math.max(0, Math.min(1, sentiment));
  }

  /**
   * Generate human-readable analysis
   */
  private generateAnalysis(
    totalScore: number,
    recoveryZone: 'green' | 'yellow' | 'red',
    input: TrainingScoreInput,
    breakdown: {
      strainAppropriatenessScore: number;
      sessionQualityScore: number;
      goalAlignmentScore: number;
      injurySafetyModifier: number;
    }
  ): string {
    const parts: string[] = [];

    // Overall assessment
    if (totalScore >= 8) {
      parts.push('Excellent training session');
    } else if (totalScore >= 6) {
      parts.push('Good training session');
    } else if (totalScore >= 4) {
      parts.push('Moderate training session');
    } else {
      parts.push('Training could be optimized');
    }

    // Recovery zone feedback
    if (recoveryZone === 'green') {
      parts.push('Your recovery supports high-intensity training');
    } else if (recoveryZone === 'yellow') {
      parts.push('Consider monitoring training intensity with moderate recovery');
    } else {
      parts.push('Low recovery suggests prioritizing rest or light activity');
    }

    // Strain appropriateness feedback
    if (breakdown.strainAppropriatenessScore >= 3.5) {
      parts.push('Training load was well-matched to your recovery state');
    } else if (breakdown.strainAppropriatenessScore < 2) {
      if (input.strainScore && input.strainScore > 15 && recoveryZone !== 'green') {
        parts.push('Training strain may have been too high for your recovery level');
      } else {
        parts.push('Consider adjusting training intensity to better match recovery');
      }
    }

    // Session quality feedback
    if (breakdown.sessionQualityScore >= 2.5) {
      parts.push(`${input.duration} minutes at ${input.intensity || 'your chosen'} intensity was appropriate`);
    }

    // Goal alignment feedback
    if (breakdown.goalAlignmentScore >= 1.5 && input.fitnessGoal) {
      parts.push(`This session aligns well with your ${input.fitnessGoal} goal`);
    }

    // Injury safety warnings
    if (breakdown.injurySafetyModifier < 0.8) {
      parts.push('Take care to avoid overtraining and allow adequate recovery');
    }

    return parts.join('. ') + '.';
  }
}

export const trainingScoreService = new TrainingScoreService();
