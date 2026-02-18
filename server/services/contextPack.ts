/**
 * contextPack.ts - Context Aggregation Service
 *
 * Fetches and assembles all relevant user context for FitSmart persona responses:
 * - Latest WHOOP metrics (recovery, sleep, strain, HRV)
 * - User goals and focus areas
 * - Injuries and health status
 * - Preferred communication tone
 * - Recent chat summaries
 * - Upcoming calendar events
 * - FitScore history and trends
 */

import '../loadEnv';
import { db } from '../db';
import { users, whoopData, chatSummaries, userGoals } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { whoopApiService } from '../whoopApiService';
import { storage } from '../storage';
import type { WhoopTodayResponse } from '@shared/schema';

export interface ContextPack {
  // Core metrics (today)
  date: string;
  recoveryScore: number | null;
  sleepScore: number | null;
  strainScore: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
  sleepHours: number | null;

  // Yesterday's metrics
  yesterdayRecovery: number | null;
  yesterdaySleep: number | null;
  yesterdayStrain: number | null;
  yesterdayHrv: number | null;

  // Weekly averages
  weeklyAvgRecovery: number | null;
  weeklyAvgSleep: number | null;
  weeklyAvgStrain: number | null;
  weeklyAvgHrv: number | null;

  // User profile
  goalShort: string | null;
  goalLong: string | null;
  goalsContext: string | null; // Formatted goals from user_goals table
  trainingFrequency: number | null;
  trainingTypes: string[] | null;
  injuries: string | null;
  tone: string | null;

  // FitScore
  currentFitScore: number | null;
  fitScoreTrend: string | null; // "improving", "declining", "stable"

  // Calendar
  nextTraining: string | null; // Next event name or null

  // Recent context
  recentSummary: string | null;

  // Trend notes (7-day comparison)
  trendNotes: string | null;

  // User context (3-tier training profile)
  userContextSummary: string | null;
}

/**
 * Build a compact context pack for a user
 */
export async function buildContextPack(userId: string): Promise<ContextPack> {
  console.log(`[CTX] Building context pack for user ${userId}`);

  try {
    // 1. Fetch user profile
    const [userProfile] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userProfile) {
      throw new Error(`User ${userId} not found`);
    }

    // 2. Fetch latest WHOOP data (today, yesterday, weekly)
    let whoopMetrics: WhoopTodayResponse | null = null;
    let yesterdayMetrics: any = null;
    let weeklyMetrics: any = null;

    try {
      whoopMetrics = await whoopApiService.getTodaysData(userId);
      console.log(`[CTX] Fetched today's WHOOP data: recovery=${whoopMetrics.recovery_score}, sleep=${whoopMetrics.sleep_score}, strain=${whoopMetrics.strain_score}`);
    } catch (error) {
      console.warn('[CTX] Failed to fetch today WHOOP data:', error);
    }

    try {
      yesterdayMetrics = await whoopApiService.getYesterdaysData(userId);
      console.log(`[CTX] Fetched yesterday's WHOOP data: recovery=${yesterdayMetrics?.recovery_score}, strain=${yesterdayMetrics?.strain}`);
    } catch (error) {
      console.warn('[CTX] Failed to fetch yesterday WHOOP data:', error);
    }

    try {
      weeklyMetrics = await whoopApiService.getWeeklyAverages(userId);
      console.log(`[CTX] Fetched weekly WHOOP averages: recovery=${weeklyMetrics?.avg_recovery}, strain=${weeklyMetrics?.avg_strain}`);
    } catch (error) {
      console.warn('[CTX] Failed to fetch weekly WHOOP data:', error);
    }

    // 3. Fetch recent chat summary
    let recentSummary: string | null = null;
    try {
      const [latestSummary] = await db
        .select()
        .from(chatSummaries)
        .where(eq(chatSummaries.userId, userId))
        .orderBy(desc(chatSummaries.updatedAt))
        .limit(1);

      recentSummary = latestSummary?.summary || null;
      if (recentSummary) {
        console.log(`[CTX] Found recent summary: ${recentSummary.substring(0, 60)}...`);
      }
    } catch (error) {
      console.warn('[CTX] Failed to fetch chat summary:', error);
    }

    // 4. Calculate FitScore trend
    let fitScoreTrend: string | null = null;
    if (userProfile.fitScoreHistory && Array.isArray(userProfile.fitScoreHistory)) {
      const history = userProfile.fitScoreHistory as Array<{ date: string; score: number }>;
      if (history.length >= 2) {
        const recent = history.slice(-7); // Last 7 days
        const first = recent[0].score;
        const last = recent[recent.length - 1].score;
        const delta = last - first;

        if (delta > 5) fitScoreTrend = 'improving';
        else if (delta < -5) fitScoreTrend = 'declining';
        else fitScoreTrend = 'stable';

        console.log(`[CTX] FitScore trend: ${fitScoreTrend} (${first} → ${last}, Δ${delta})`);
      }
    }

    // 5. Build trend notes (7-day comparison)
    let trendNotes: string | null = null;
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateStr = sevenDaysAgo.toISOString().split('T')[0];

      const [oldData] = await db
        .select()
        .from(whoopData)
        .where(eq(whoopData.userId, userId))
        .orderBy(desc(whoopData.date))
        .limit(1);

      if (oldData && whoopMetrics?.recovery_score) {
        const recoveryDelta = whoopMetrics.recovery_score - oldData.recoveryScore;
        const hrvDelta = whoopMetrics.hrv && oldData.hrv ? whoopMetrics.hrv - oldData.hrv : null;

        if (Math.abs(recoveryDelta) > 15) {
          trendNotes = `Recovery ${recoveryDelta > 0 ? 'up' : 'down'} ${Math.abs(recoveryDelta)}% vs last week`;
        }

        if (hrvDelta && Math.abs(hrvDelta) > 10) {
          const hrvNote = `HRV ${hrvDelta > 0 ? 'up' : 'down'} ${Math.abs(Math.round(hrvDelta))}ms`;
          trendNotes = trendNotes ? `${trendNotes}; ${hrvNote}` : hrvNote;
        }

        if (trendNotes) {
          console.log(`[CTX] Trend notes: ${trendNotes}`);
        }
      }
    } catch (error) {
      console.warn('[CTX] Failed to calculate trend notes:', error);
    }

    // 6. Fetch user goals from database
    let goalsContext: string | null = null;
    try {
      const goals = await db
        .select()
        .from(userGoals)
        .where(eq(userGoals.userId, userId))
        .orderBy(desc(userGoals.createdAt));

      if (goals.length > 0) {
        goalsContext = goals.map(g => {
          const microhabitsText = Array.isArray(g.microhabits)
            ? (g.microhabits as Array<{ text: string; done: boolean; impact: number }>)
                .map(h => `${h.done ? '✓' : '○'} ${h.text}`)
                .join(', ')
            : 'No habits defined';

          return `- ${g.emoji} ${g.title} (${g.category}): ${g.progress}% complete, ${g.streak}-day streak\n  Habits: ${microhabitsText}`;
        }).join('\n');

        console.log(`[CTX] Loaded ${goals.length} goals for context`);
      }
    } catch (error) {
      console.warn('[CTX] Failed to fetch goals:', error);
    }

    // 7. Fetch user context (3-tier training profile)
    let userContextSummary: string | null = null;
    try {
      const ctx = await storage.getUserContext(userId);
      if (ctx) {
        const emphasisStr = ctx.tier2Emphasis === 'Sport-Specific' && ctx.sportSpecific
          ? `Sport-Specific (${ctx.sportSpecific})`
          : ctx.tier2Emphasis;
        const parts = [
          `Training profile: goal=${ctx.tier1Goal}, priority=${ctx.tier1Priority}`,
          `Phase: ${ctx.tier2Phase}, emphasis=${emphasisStr}`,
          `This week: load=${ctx.tier3WeekLoad}, stress=${ctx.tier3Stress}, sleep expectation=${ctx.tier3SleepExpectation}`,
        ];
        if (ctx.injuryType && ctx.injuryType !== 'None') {
          const injuryLabel = ctx.injuryType === 'Other' && ctx.injuryDescription
            ? `Other (${ctx.injuryDescription})`
            : ctx.injuryType;
          const regionStr = ctx.bodyRegion ? `, region: ${ctx.bodyRegion}` : '';
          const locationStr = ctx.injuryLocation ? ` at ${ctx.injuryLocation}` : '';
          const rehabStr = ctx.rehabStage ? ` — rehab stage: ${ctx.rehabStage}` : '';
          parts.push(`⚠️ Active injury/constraint: ${injuryLabel}${regionStr}${locationStr}${rehabStr}`);
        }
        userContextSummary = parts.join('\n');
        console.log(`[CTX] User context loaded: ${ctx.tier1Goal}, phase=${ctx.tier2Phase}, injury=${ctx.injuryType ?? 'none'}`);
      }
    } catch (error) {
      console.warn('[CTX] Failed to fetch user context:', error);
    }

    // 8. Fetch next calendar event
    let nextTraining: string | null = null;
    // TODO: Implement calendar integration once userCalendars is populated

    // 9. Assemble context pack
    const contextPack: ContextPack = {
      date: new Date().toISOString().split('T')[0],
      recoveryScore: whoopMetrics?.recovery_score || null,
      sleepScore: whoopMetrics?.sleep_score || null,
      strainScore: whoopMetrics?.strain_score || whoopMetrics?.strain || null,
      hrv: whoopMetrics?.hrv || null,
      restingHeartRate: whoopMetrics?.resting_heart_rate || null,
      sleepHours: whoopMetrics?.sleep_hours || null,
      yesterdayRecovery: yesterdayMetrics?.recovery_score || null,
      yesterdaySleep: yesterdayMetrics?.sleep_score || null,
      yesterdayStrain: yesterdayMetrics?.strain || yesterdayMetrics?.strain_score || null,
      yesterdayHrv: yesterdayMetrics?.hrv || null,
      weeklyAvgRecovery: weeklyMetrics?.avgRecovery || weeklyMetrics?.avg_recovery || null,
      weeklyAvgSleep: weeklyMetrics?.avgSleep || weeklyMetrics?.avg_sleep || null,
      weeklyAvgStrain: weeklyMetrics?.avgStrain || weeklyMetrics?.avg_strain || null,
      weeklyAvgHrv: weeklyMetrics?.avgHRV || weeklyMetrics?.avg_hrv || null,
      goalShort: userProfile.goalShort || null,
      goalLong: userProfile.goalLong || null,
      goalsContext,
      trainingFrequency: userProfile.trainingFrequency || null,
      trainingTypes: userProfile.trainingTypes || null,
      injuries: userProfile.injuries || null,
      tone: userProfile.tone || null,
      currentFitScore: userProfile.currentFitScore || null,
      fitScoreTrend,
      nextTraining,
      recentSummary,
      trendNotes,
      userContextSummary,
    };

    console.log(`[CTX] ✅ Context pack built successfully`);
    return contextPack;

  } catch (error) {
    console.error('[CTX] ❌ Failed to build context pack:', error);
    throw error;
  }
}

/**
 * Build a compact one-sentence summary of the context (≤25 words)
 * Used in persona prompt to ground the coach's awareness
 */
export function buildContextSummary(ctx: ContextPack): string {
  const parts: string[] = [];

  // Recovery state
  if (ctx.recoveryScore !== null) {
    if (ctx.recoveryScore >= 70) parts.push(`recovery strong (${ctx.recoveryScore}%)`);
    else if (ctx.recoveryScore >= 40) parts.push(`recovery moderate (${ctx.recoveryScore}%)`);
    else parts.push(`recovery low (${ctx.recoveryScore}%)`);
  }

  // Sleep
  if (ctx.sleepHours !== null) {
    parts.push(`${ctx.sleepHours.toFixed(1)}h sleep`);
  } else if (ctx.sleepScore !== null) {
    parts.push(`sleep score ${ctx.sleepScore}%`);
  }

  // HRV if notable
  if (ctx.hrv !== null && ctx.hrv > 0) {
    parts.push(`HRV ${Math.round(ctx.hrv)}`);
  }

  // Goals
  if (ctx.goalShort) {
    parts.push(`goal: ${ctx.goalShort}`);
  }

  // Injuries
  if (ctx.injuries && ctx.injuries.toLowerCase() !== 'none') {
    parts.push(`injury: ${ctx.injuries}`);
  }

  // Build summary
  if (parts.length === 0) {
    return `Today: ${ctx.date}`;
  }

  const summary = `Today: ${parts.join(', ')}`;

  // Truncate if over 25 words
  const words = summary.split(' ');
  if (words.length > 25) {
    return words.slice(0, 25).join(' ') + '...';
  }

  return summary;
}
