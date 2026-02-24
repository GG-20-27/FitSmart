/**
 * User Context API — goals, phase, constraints, week preview
 */

import { apiRequest } from './client';

export interface UserContext {
  // Tier 1: Identity
  tier1Goal: string;
  tier1Priority: string;

  // Tier 2: Phase + Constraints
  tier2Phase: string;
  tier2DietPhase: string;
  tier2Emphasis: string;
  sportSpecific: string | null;      // free text when tier2Emphasis = "Sport-Specific"
  injuryType: string | null;
  injuryDescription: string | null;  // free text when injuryType = "Other"
  bodyRegion: string | null;         // Upper body / Lower body / Spine + Core
  injuryLocation: string | null;     // free text "Where exactly?"
  rehabStage: string | null;

  // Tier 3: This Week
  tier3WeekLoad: string;
  tier3Stress: string;
  tier3SleepExpectation: string;
}

export const DEFAULTS: UserContext = {
  tier1Goal: 'Balanced Performance',
  tier1Priority: 'Balanced with Life',
  tier2Phase: 'Maintaining',
  tier2DietPhase: 'Maintenance',
  tier2Emphasis: 'General Fitness',
  sportSpecific: null,
  injuryType: null,
  injuryDescription: null,
  bodyRegion: null,
  injuryLocation: null,
  rehabStage: null,
  tier3WeekLoad: 'Normal',
  tier3Stress: 'Medium',
  tier3SleepExpectation: 'Uncertain',
};

/** Fetch saved user context (returns defaults if not yet set) */
export async function getUserContext(): Promise<UserContext> {
  return apiRequest<UserContext>('/api/context');
}

/** Save (upsert) user context */
export async function saveUserContext(data: Partial<UserContext>): Promise<UserContext> {
  return apiRequest<UserContext>('/api/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ── Tier 1 ────────────────────────────────────────────────────────────────────

export const TIER1_GOALS = [
  'High Performance',
  'Balanced Performance',
  'Longevity & Health',
  'Body Recomposition',
  'Rehab & Return',
];

export const TIER1_GOAL_DESCRIPTIONS: Record<string, string> = {
  'High Performance': 'Maximize output & progression',
  'Balanced Performance': 'Look good, feel good, perform well',
  'Longevity & Health': 'Move well and stay healthy long-term',
  'Body Recomposition': 'Build muscle, reduce fat simultaneously',
  'Rehab & Return': 'Recover and rebuild after injury or surgery',
};

export const TIER1_PRIORITIES = [
  'Training First',
  'Balanced with Life',
  'Life First',
  'Rehab Focused',
];

// ── Tier 2 ────────────────────────────────────────────────────────────────────

export const TIER2_PHASES = [
  'Building',
  'Maintaining',
  'Deload',
  'Competition Prep',
  'Rehab',
];

export const TIER2_DIET_PHASES = [
  'Cutting',
  'Recomp (slow change)',
  'Maintenance',
  'Lean bulk',
  'Aggressive bulk',
  'Performance fueling',
  'Recovery fueling',
];

export const TIER2_EMPHASIS = [
  'Strength',
  'Endurance',
  'Mobility',
  'Skill',
  'General Fitness',
  'Sport-Specific',
];

export const INJURY_TYPES = [
  'None',
  'Muscle strain',
  'Tendon / ligament',
  'Joint issue',
  'Stress fracture',
  'Post-surgery',
  'Other',
];

export const BODY_REGIONS = [
  'Upper body',
  'Lower body',
  'Spine / Core',
];

export const REHAB_STAGES = [
  'Acute (rest & protection)',
  'Sub-acute (light movement)',
  'Rehab (guided exercises)',
  'Return to training',
];

// ── Tier 3 ────────────────────────────────────────────────────────────────────

export const TIER3_WEEK_LOADS = [
  'Light',
  'Normal',
  'Heavy',
  'Peak / competition week',
];

export const TIER3_STRESS_LEVELS = [
  'Low',
  'Medium',
  'High',
  'Very high',
];

export const TIER3_SLEEP_EXPECTATIONS = [
  'Good (7–9h)',
  'Uncertain',
  'Limited (< 6h)',
];
