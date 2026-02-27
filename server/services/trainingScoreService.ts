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

  // Context from userContext table — determines expected strain band
  rehabStage?: string;    // e.g. 'Acute', 'Sub-acute', 'Rehab', 'Return to training'
  primaryGoal?: string;   // tier1Goal — e.g. 'Balanced Performance', 'High Performance', 'Rehab & Return'
  weeklyLoad?: string;    // tier3WeekLoad — e.g. 'Light', 'Normal', 'Heavy', 'Competition'
  injuryType?: string;    // e.g. 'Post-surgery', 'Muscle strain' — used for rehabActive detection
  sessionLocalHour?: number; // 0-23, Zurich local hour when session was logged
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
  rehabActive?: boolean;       // true when user is in any rehab/post-surgery context
  strainGuardApplied?: boolean; // true when early-day strain guard was applied
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

    // Determine rehabActive for result exposure (same logic as getExpectedStrainBand)
    const rehab = (input.rehabStage  || '').toLowerCase();
    const goal  = (input.primaryGoal || '').toLowerCase();
    const fg    = (input.fitnessGoal || '').toLowerCase();
    const inj   = (input.injuryType  || '').toLowerCase();
    const rehabActive =
      rehab.includes('acute')  ||
      rehab.includes('sub')    ||
      rehab.includes('rehab')  ||
      rehab.includes('return') ||
      goal.includes('rehab')   ||
      goal.includes('return')  ||
      fg.includes('surgery')   ||
      fg.includes('post-op')   ||
      fg.includes('post op')   ||
      fg.includes('recover from') ||
      inj.includes('post-surgery') ||
      inj.includes('post-op');

    // Calculate each component
    const strainAppropriatenessScore = this.calculateStrainAppropriateness(
      input.strainScore,
      recoveryZone,
      input.recoveryScore,
      input
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
      input.comment,
      rehabActive,
      input.type
    );

    // Total score (0-10 scale)
    let totalScore =
      strainAppropriatenessScore +
      sessionQualityScore +
      goalAlignmentScore +
      injurySafetyModifier;

    // Cap at 7.0 when WHOOP strain is missing — can't fully validate appropriateness
    if (!input.strainScore) {
      totalScore = Math.min(totalScore, 7.0);
    }

    // Universal severe pain cap — regardless of strain/recovery numbers, a session
    // where the user reports acute pain cannot score above 5.5.
    if (input.comment) {
      const commentLower = input.comment.toLowerCase();
      const hasSeverePain = TrainingScoreService.SEVERE_PAIN_KEYWORDS.some(k => commentLower.includes(k));
      if (hasSeverePain) {
        totalScore = Math.min(totalScore, 5.0);
      }
    }

    // Determine if early-day strain guard was applied
    // (mirrors the guard logic in calculateStrainAppropriateness)
    const band = input.strainScore !== undefined
      ? this.getExpectedStrainBand(recoveryZone, input)
      : null;
    const strainGuardApplied = !!(
      band &&
      input.strainScore !== undefined &&
      input.strainScore < band.min &&
      input.sessionLocalHour !== undefined &&
      input.sessionLocalHour < 18
    );

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
      rehabActive,
      strainGuardApplied,
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
   * Determine expected strain band based on user context.
   * Baseline daily movement (normal life, no training) ≈ 6–9 WHOOP strain.
   *
   * Priority order:
   * 1. rehabActive (post-surgery / rehab stage) → stage-specific band, ignores recovery zone
   * 2. Deload week → light band
   * 3. High performance week → elevated band by recovery zone
   * 4. Default → standard band by recovery zone
   */
  private getExpectedStrainBand(
    recoveryZone: 'green' | 'yellow' | 'red',
    input: TrainingScoreInput
  ): { min: number; max: number; ideal: number } {
    const rehab = (input.rehabStage  || '').toLowerCase();
    const goal  = (input.primaryGoal || '').toLowerCase();
    const load  = (input.weeklyLoad  || '').toLowerCase();
    const note  = (input.comment     || '').toLowerCase();
    const fg    = (input.fitnessGoal || '').toLowerCase();
    const inj   = (input.injuryType  || '').toLowerCase();

    // rehabActive: any rehab or post-surgery context overrides recovery-zone bands entirely.
    // A user recovering from surgery with green recovery is still in rehab — do not use green default bands.
    const rehabActive =
      rehab.includes('acute')  ||
      rehab.includes('sub')    ||
      rehab.includes('rehab')  ||
      rehab.includes('return') ||
      goal.includes('rehab')   ||
      goal.includes('return')  ||
      fg.includes('surgery')   ||
      fg.includes('post-op')   ||
      fg.includes('post op')   ||
      fg.includes('recover from') ||
      inj.includes('post-surgery') ||
      inj.includes('post-op');

    if (rehabActive) {
      // Use stage-specific rehab bands — recovery zone does NOT change the band.
      // Rehab sessions with green recovery are not "ready to push" — they're healing.
      if (rehab.includes('acute')) {
        // Acute: post-op / acute injury — baseline movement only, extra training is overreach
        return { min: 6, max: 11, ideal: 8 };
      }
      if (rehab.includes('sub')) {
        // Sub-acute: gentle controlled work beginning
        return { min: 7, max: 12, ideal: 9.5 };
      }
      if (rehab.includes('return') || goal.includes('return')) {
        // Return-to-training: progressive ramp, still below full load
        return { min: 9, max: 15, ideal: 12 };
      }
      // Default rehab band: covers 'Rehab' stage, post-surgery goal, post-op injury, unspecified stage
      return { min: 8, max: 13, ideal: 10.5 };
    }

    const isDeload   = load === 'light' || note.includes('deload') || note.includes('de-load');
    const isHighPerf = load === 'heavy' || load === 'competition' ||
                       goal.includes('high performance') || goal.includes('performance');

    if (isDeload) {
      // Reduced load is correct execution
      return { min: 5, max: 12, ideal: 8 };
    }
    if (isHighPerf) {
      // Elevated strain expected; low strain = missed opportunity
      return {
        green:  { min: 10, max: 19, ideal: 15 },
        yellow: { min: 8,  max: 14, ideal: 11 },
        red:    { min: 0,  max: 9,  ideal: 5  },
      }[recoveryZone];
    }
    // Default: standard ranges by recovery zone
    return {
      green:  { min: 8, max: 18, ideal: 13  },
      yellow: { min: 5, max: 12, ideal: 8.5 },
      red:    { min: 0, max: 8,  ideal: 4   },
    }[recoveryZone];
  }

  /**
   * Calculate strain appropriateness (40% of total score = 0-4 points)
   * Grades alignment between actual strain and the context-based expected band.
   */
  private calculateStrainAppropriateness(
    strainScore?: number,
    recoveryZone: 'green' | 'yellow' | 'red' = 'yellow',
    recoveryScore?: number,
    input: TrainingScoreInput = {} as TrainingScoreInput
  ): number {
    if (!strainScore) {
      return 2.0; // No WHOOP data — below neutral (can't score appropriateness without the signal)
    }

    const band = this.getExpectedStrainBand(recoveryZone, input);

    const distanceFromIdeal = Math.abs(strainScore - band.ideal);
    let score = 0;

    if (strainScore >= band.min && strainScore <= band.max) {
      // Inside band — piecewise distance from ideal
      if (distanceFromIdeal <= 2)      score = 4.0;
      else if (distanceFromIdeal <= 4) score = 3.5;
      else if (distanceFromIdeal <= 6) score = 3.0;
      else                             score = 2.5;
    } else if (strainScore < band.min) {
      // Below band — undertraining
      const underBy = band.min - strainScore;
      score = underBy <= 3 ? 2.0 : 1.5;

      // Early-day guard: WHOOP strain accumulates throughout the day.
      // If the session was logged before 18:00 Zurich, the day-level strain reading
      // does not yet reflect the full training load — clamp min to 2.0 to avoid
      // false undertraining penalties on morning and midday sessions.
      if (input.sessionLocalHour !== undefined && input.sessionLocalHour < 18) {
        score = Math.max(score, 2.0);
      }
    } else {
      // Above band — overtraining
      const overBy = strainScore - band.max;
      score = overBy <= 3 ? 2.0 : 1.0;

      // Extra penalty for dangerous overreach
      const isAcuteRehab = (input.rehabStage || '').toLowerCase().includes('acute');
      if ((recoveryZone === 'red' && strainScore > 10) || (isAcuteRehab && strainScore > 12)) {
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

    // Short-session inflation guard: token sessions can't score highly
    if (duration < 25 && (intensityLower === 'low' || !intensity)) {
      score = Math.min(score, 1.4);
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

    // Normalise training type using synonym aliases before matching.
    // This prevents misses like "weight training" failing to match "weights" (plural).
    const TYPE_ALIASES: Record<string, string> = {
      'weight training':    'weights',
      'weightlifting':      'lifting',
      'weight lifting':     'lifting',
      'gym session':        'strength',
      'gym':                'strength',
      'barbell':            'lifting',
      'dumbbell':           'weights',
      'resistance training':'resistance',
      'strength training':  'strength',
      'cross training':     'cardio',
      'crossfit':           'hiit',
      'boxing':             'hiit',
      'kickboxing':         'hiit',
      'rowing':             'cardio',
      'swim':               'cardio',
      'swimming':           'cardio',
      'walk':               'cardio',
      'walking':            'cardio',
      'hike':               'cardio',
      'hiking':             'cardio',
      'pilates':            'flexibility',
      'stretching':         'flexibility',
      'foam rolling':       'flexibility',
      'physical therapy':   'mobility',
    };
    const rawType = trainingType.toLowerCase();
    const type = Object.entries(TYPE_ALIASES).reduce(
      (acc, [alias, canonical]) => acc.replace(alias, canonical),
      rawType
    );
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

    // If no alignment found, penalise lightly — training is logged but goal mismatch is meaningful
    if (alignmentScore === 0) {
      alignmentScore = 0.8; // 40% — not punitive, but differentiated from partial alignment
    }

    return Math.max(0, Math.min(2, alignmentScore));
  }

  /**
   * Severe pain keywords — any of these in a comment indicate a safety-relevant event.
   * Used by both calculateInjurySafety and calculateTrainingScore.
   */
  private static readonly SEVERE_PAIN_KEYWORDS = [
    'hurt a lot', 'severe pain', 'sharp pain', "couldn't walk", "can't walk",
    'couldnt walk', 'excruciating', 'extreme pain', 'agony', 'unbearable pain',
    'stabbing', 'stabbing pain', 'throbbing', 'flare-up', 'flare up',
    'limping', 'swelling', 'tweaked', 'can\'t move', 'cannot move',
  ];

  /**
   * Calculate injury safety modifier (10% of total score = 0-1 points)
   * Penalizes high intensity training when recovery is poor
   */
  private calculateInjurySafety(
    recoveryScore?: number,
    intensity?: string,
    comment?: string,
    rehabActive?: boolean,
    type?: string
  ): number {
    const HIGH_IMPACT = ['sprint', 'plyometric', 'hiit', 'max effort', 'jump', 'explosive', 'box jump'];

    if (comment) {
      const commentLower = comment.toLowerCase();
      const hasSeverePain = TrainingScoreService.SEVERE_PAIN_KEYWORDS.some(k => commentLower.includes(k));

      // ── Universal severe pain: floor injurySafety regardless of rehab context ──
      // If a user reports severe/acute pain, the session is a safety concern no matter what.
      if (hasSeverePain) {
        // Additionally escalate to full 0.0 when combined with rehab context + high-impact type
        if (rehabActive && type) {
          const typeLower   = type.toLowerCase();
          const isHighImpact = HIGH_IMPACT.some(t => typeLower.includes(t));
          if (isHighImpact) {
            console.log('[TRAINING] injuryOverrideApplied: rehab + high-impact + severe pain → injurySafety = 0.0');
            return 0.0;
          }
        }
        // Severe pain alone (no rehab / no high-impact): still floor to 0.0
        console.log('[TRAINING] severePainDetected: universal override → injurySafety = 0.0');
        return 0.0;
      }
    }

    let score = 1.0; // Start with full points

    // Check for moderate red flags in comment
    if (comment) {
      const redFlags = ['pain', 'hurt', 'injury', 'sore', 'ache', 'strain', 'pulled',
                        'strained', 'aching', 'tender', 'bruised', 'swollen'];
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
    // Negative indicators — includes pain/discomfort language that reduces session quality
    const negative = [
      'hard', 'difficult', 'struggled', 'tired', 'exhausted', 'painful', 'bad',
      'pain', 'sore', 'agony', 'sharp', 'stabbing', 'throbbing', 'aching',
      'flare', 'limping', 'swelling', 'tweaked', 'strained',
    ];

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
   * Generate context-aware human-readable analysis
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
    const rehab   = (input.rehabStage  || '').toLowerCase();
    const goal    = (input.primaryGoal || '').toLowerCase();
    const load    = (input.weeklyLoad  || '').toLowerCase();
    const note    = (input.comment     || '').toLowerCase();
    const fg      = (input.fitnessGoal || '').toLowerCase();
    const inj     = (input.injuryType  || '').toLowerCase();

    const isAcuteRehab     = rehab.includes('acute');
    const isRehabFromStage = !isAcuteRehab && (rehab.includes('sub') || rehab.includes('rehab') || rehab.includes('return') || goal.includes('rehab'));
    const isRehabFromGoal  = fg.includes('surgery') || fg.includes('post-op') || fg.includes('post op') || fg.includes('recover from') || inj.includes('post-surgery') || inj.includes('post-op');
    const isRehabPhase     = isRehabFromStage || isRehabFromGoal;
    const isDeload         = load === 'light' || note.includes('deload');
    const isHighPerf       = load === 'heavy' || load === 'competition' || goal.includes('performance');
    const strainGoodFit    = breakdown.strainAppropriatenessScore >= 3;
    const strainOverreach  = input.strainScore != null && breakdown.strainAppropriatenessScore < 2 && input.strainScore > (this.getExpectedStrainBand(recoveryZone, input).max);

    const parts: string[] = [];

    // Context-aware primary statement
    if (isAcuteRehab) {
      if (strainGoodFit) {
        parts.push('Correct execution — staying within baseline movement is exactly right for acute recovery');
      } else if (strainOverreach) {
        parts.push('Overreach detected — strain exceeded what is appropriate for acute recovery; protect the healing process');
      } else {
        parts.push('Moderate effort during acute recovery — monitor how the body responds');
      }
    } else if (isRehabPhase) {
      if (strainGoodFit) {
        parts.push('Smart rehab execution — strain was well within the expected range for your recovery phase');
      } else if (strainOverreach) {
        parts.push('Training spike detected — aim to keep sessions controlled during rehabilitation to avoid setbacks');
      } else {
        parts.push('Session within acceptable rehab range — keep intensity gradual and progressive');
      }
    } else if (isDeload) {
      if (strainGoodFit) {
        parts.push('Deload executed correctly — reduced strain is exactly what this phase calls for');
      } else {
        parts.push('Moderate deload session — aim for intentional reduction to let the body absorb previous training');
      }
    } else if (isHighPerf) {
      if (strainGoodFit) {
        parts.push('Strong training load — well-matched to your performance phase');
      } else if (breakdown.strainAppropriatenessScore < 2 && input.strainScore != null && input.strainScore < 10) {
        parts.push('Missed training opportunity — this phase calls for elevated strain to drive adaptation');
      } else {
        parts.push('Training load recorded — check that session intensity aligns with your performance phase goals');
      }
    } else {
      // Standard fallback
      if (totalScore >= 8) {
        parts.push('Excellent training session');
      } else if (totalScore >= 6) {
        parts.push('Good training session');
      } else if (totalScore >= 4) {
        parts.push('Moderate training session');
      } else {
        parts.push('Training could be optimized');
      }

      if (recoveryZone === 'green') {
        parts.push('Your recovery supports high-intensity training');
      } else if (recoveryZone === 'yellow') {
        parts.push('Consider monitoring training intensity with moderate recovery');
      } else {
        parts.push('Low recovery suggests prioritizing rest or light activity');
      }
    }

    // Strain appropriateness (only for non-context-specific cases)
    if (!isAcuteRehab && !isRehabPhase && !isDeload && !isHighPerf) {
      if (breakdown.strainAppropriatenessScore >= 3.5) {
        parts.push('Training load was well-matched to your recovery state');
      } else if (breakdown.strainAppropriatenessScore < 2 && input.strainScore && input.strainScore > 15 && recoveryZone !== 'green') {
        parts.push('Training strain may have been too high for your recovery level');
      }
    }

    // Session quality
    if (breakdown.sessionQualityScore >= 2.5) {
      parts.push(`${input.duration} minutes at ${input.intensity || 'your chosen'} intensity was appropriate`);
    }

    // Goal alignment
    if (breakdown.goalAlignmentScore >= 1.5 && input.fitnessGoal) {
      parts.push(`This session aligns well with your ${input.fitnessGoal} goal`);
    }

    // Injury safety
    if (breakdown.injurySafetyModifier < 0.8) {
      parts.push('Take care to avoid overtraining and allow adequate recovery');
    }

    return parts.join('. ') + '.';
  }
}

export const trainingScoreService = new TrainingScoreService();
