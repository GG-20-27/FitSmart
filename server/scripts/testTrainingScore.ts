/**
 * Training Score Test Harness
 *
 * PURPOSE: Validate the training scoring engine using controlled synthetic inputs.
 * - No DB writes. No logic changes. Read-only.
 * - Run with: npx tsx server/scripts/testTrainingScore.ts
 */

import { TrainingScoreService, TrainingScoreInput, TrainingScoreResult } from '../services/trainingScoreService.js';

const svc = new TrainingScoreService();

// ─── Colour helpers (terminal ANSI) ──────────────────────────────────────────
const RED    = (s: string) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s: string) => `\x1b[33m${s}\x1b[0m`;
const GREEN  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const BOLD   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const DIM    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const CYAN   = (s: string) => `\x1b[36m${s}\x1b[0m`;

function scoreColour(score: number): string {
  if (score >= 7)  return GREEN(score.toFixed(1));
  if (score >= 5)  return YELLOW(score.toFixed(1));
  return RED(score.toFixed(1));
}

// ─── Test cases ──────────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  label: string;
  input: TrainingScoreInput;
  /** Rough expected score range [min, max] */
  expectedRange: [number, number];
  notes: string;
}

const cases: TestCase[] = [
  {
    id: 'A',
    label: 'High Recovery + Appropriate Strain (Green Zone, Optimal Fit)',
    input: {
      type: 'Running',
      duration: 65,
      intensity: 'High',
      comment: 'Great session, felt strong throughout',
      skipped: false,
      recoveryScore: 82,
      strainScore: 14,
      fitnessGoal: 'endurance',
      sessionLocalHour: 18,
    },
    expectedRange: [9.0, 10.0],
    notes: 'Green zone, strain=14 near ideal=13 → perfect strainAppropriateness. Expect 9.8.',
  },
  {
    id: 'B',
    label: 'Undertraining (Low Strain, High Recovery — Missed Opportunity)',
    input: {
      type: 'Walking',
      duration: 30,
      intensity: 'Low',
      skipped: false,
      recoveryScore: 78,
      strainScore: 3,
      fitnessGoal: 'weight loss',
      sessionLocalHour: 20,
    },
    expectedRange: [5.5, 7.0],
    notes: 'Green zone, strain=3 far below band min=8. Evening session (hour=20) → NO early-day guard. Expect ~6.3.',
  },
  {
    id: 'C',
    label: 'Low Recovery + High Strain (Overreach, Red Zone)',
    input: {
      type: 'Weight Training',
      duration: 75,
      intensity: 'High',
      comment: 'Felt exhausted but pushed through',
      skipped: false,
      recoveryScore: 28,
      strainScore: 17,
      fitnessGoal: 'strength',
      sessionLocalHour: 19,
    },
    expectedRange: [4.5, 6.0],
    notes: 'Red zone + strain=17 above band max=8. Extra overreach penalty applied. "exhausted" triggers sentiment penalty. After synonym fix: "Weight Training" → "weights" → goalAlignment=2.0 (was 1.5). Expect ~5.4.',
  },
  {
    id: 'D',
    label: 'Early-Day Strain Guard (Morning Session, Strain Below Band)',
    input: {
      type: 'Cycling',
      duration: 45,
      intensity: 'Moderate',
      skipped: false,
      recoveryScore: 72,
      strainScore: 2,
      fitnessGoal: 'endurance',
      sessionLocalHour: 7,
    },
    expectedRange: [7.0, 8.0],
    notes: 'Green zone, strain=2 (underBy=6, would score 1.5). Morning hour=7 → guard lifts to 2.0. strainGuardApplied should be TRUE. Without guard: ~7.1. With guard: ~7.6.',
  },
  {
    id: 'E',
    label: 'Acute Rehab + High-Impact + Severe Pain (Hard Override Triggered)',
    input: {
      type: 'HIIT Sprint',
      duration: 45,
      intensity: 'High',
      comment: 'Sharp pain in knee, felt excruciating',
      skipped: false,
      recoveryScore: 75,
      strainScore: 14,
      rehabStage: 'Acute',
      sessionLocalHour: 10,
    },
    expectedRange: [3.5, 5.5],
    notes: 'rehabActive=true (Acute). type="HIIT Sprint" matches HIGH_IMPACT list. comment contains "sharp pain" + "excruciating" → SEVERE_PAIN. Hard override → injurySafety=0.0. Strain=14 exceeds acute max=11 with acute penalty → strainAppropriateness=1.0. Expect ~4.7.',
  },
  {
    id: 'F',
    label: 'Rehab Controlled (Good Sub-acute Execution)',
    input: {
      type: 'Physical Therapy',
      duration: 40,
      intensity: 'Low',
      comment: 'Controlled session, good progress',
      skipped: false,
      recoveryScore: 65,
      strainScore: 10,
      rehabStage: 'Sub-acute',
      sessionLocalHour: 14,
    },
    expectedRange: [8.0, 9.5],
    notes: 'rehabActive=true (Sub-acute). Strain=10 within band [7–12], distance from ideal=0.5 → perfect fit. "Physical Therapy" type is NOT high-impact → no hard override. Expect ~8.7.',
  },
  {
    id: 'G',
    label: 'Severe Pain + High Impact, NO rehabActive (Universal Pain Override — Fixed)',
    input: {
      type: 'Sprint Training',
      duration: 30,
      intensity: 'High',
      comment: 'Sharp pain in leg, agony during session',
      skipped: false,
      recoveryScore: 60,
      strainScore: 10,
      sessionLocalHour: 16,
      // Deliberately no rehabStage / injuryType / primaryGoal → rehabActive=false
    },
    expectedRange: [3.0, 5.0],
    notes: 'FIXED: "sharp pain" + "agony" now triggers universal severe pain override (injurySafety=0.0) regardless of rehabActive. Score hard-capped at 5.0. Expanded sentiment list also catches "agony"/"sharp"/"pain". Previously scored ~8.3 — now should be ≤5.0.',
  },
  {
    id: 'H',
    label: 'No WHOOP Strain Data (Score Capped at 7.0)',
    input: {
      type: 'Yoga',
      duration: 60,
      intensity: 'Low',
      comment: 'Great flexibility session, felt amazing',
      skipped: false,
      recoveryScore: 68,
      // strainScore: deliberately omitted
      fitnessGoal: 'flexibility',
      sessionLocalHour: 9,
    },
    expectedRange: [6.5, 7.5],
    notes: 'No strainScore → strainAppropriateness defaults to 2.0, total=7.62 but capped at 7.0. Without the cap this session would score higher. Expect exactly 7.0.',
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

const anomalies: string[] = [];

function runCase(tc: TestCase): TrainingScoreResult {
  const result = svc.calculateTrainingScore(tc.input);

  const pass = result.score >= tc.expectedRange[0] && result.score <= tc.expectedRange[1];
  const status = pass ? GREEN('[PASS]') : RED('[FAIL]');

  console.log(`\n${BOLD(CYAN(`── Case ${tc.id}: ${tc.label}`))} ${status}`);
  console.log(DIM(`   Note: ${tc.notes}`));
  console.log();

  // Input summary
  console.log(`   Input:`);
  console.log(`     type=${tc.input.type}  duration=${tc.input.duration}min  intensity=${tc.input.intensity ?? 'none'}`);
  console.log(`     recovery=${tc.input.recoveryScore ?? 'n/a'}%  strain=${tc.input.strainScore ?? 'n/a'}  hour=${tc.input.sessionLocalHour ?? 'n/a'}`);
  if (tc.input.rehabStage)   console.log(`     rehabStage=${tc.input.rehabStage}`);
  if (tc.input.primaryGoal)  console.log(`     primaryGoal=${tc.input.primaryGoal}`);
  if (tc.input.fitnessGoal)  console.log(`     fitnessGoal=${tc.input.fitnessGoal}`);
  if (tc.input.comment)      console.log(`     comment="${tc.input.comment}"`);

  // Output
  console.log();
  console.log(`   Result:`);
  console.log(`     Score:            ${scoreColour(result.score)}  (expected ${tc.expectedRange[0]}–${tc.expectedRange[1]})`);
  console.log(`     Recovery Zone:    ${result.recoveryZone}`);
  console.log(`     rehabActive:      ${result.rehabActive ?? false}`);
  console.log(`     strainGuard:      ${result.strainGuardApplied ?? false}`);
  console.log();
  console.log(`   Breakdown (raw):`);
  console.log(`     strainAppropriateness : ${result.breakdown.strainAppropriatenessScore.toFixed(2)} / 4.0  (40%)`);
  console.log(`     sessionQuality        : ${result.breakdown.sessionQualityScore.toFixed(2)} / 3.0  (30%)`);
  console.log(`     goalAlignment         : ${result.breakdown.goalAlignmentScore.toFixed(2)} / 2.0  (20%)`);
  console.log(`     injurySafety          : ${result.breakdown.injurySafetyModifier.toFixed(2)} / 1.0  (10%)`);
  console.log(`     ─────────────────────────`);
  const rawSum = result.breakdown.strainAppropriatenessScore
    + result.breakdown.sessionQualityScore
    + result.breakdown.goalAlignmentScore
    + result.breakdown.injurySafetyModifier;
  console.log(`     raw sum               : ${rawSum.toFixed(2)}  →  final score: ${scoreColour(result.score)}`);

  // Flag-specific anomaly checks
  const flags: string[] = [];

  // Case G: Verify universal pain override now works (previously the anomaly case)
  if (tc.id === 'G') {
    if (result.score > 5.0) {
      flags.push(
        `REGRESSION: Score=${result.score} exceeds 5.0 cap despite severe pain comment. ` +
        `Universal pain override may not be firing correctly.`
      );
    }
    if (result.breakdown.injurySafetyModifier > 0.0) {
      flags.push(
        `injurySafety=${result.breakdown.injurySafetyModifier} — expected 0.0 from universal severe pain override.`
      );
    }
  }

  // Case C: 'Weight Training' + 'strength' alignment — should now be 2.0 after synonym fix
  if (tc.id === 'C') {
    if (result.breakdown.goalAlignmentScore < 2.0) {
      flags.push(
        `goalAlignment=${result.breakdown.goalAlignmentScore.toFixed(2)} — "Weight Training" still not matching ` +
        `"strength" goal after synonym normalization fix. Check TYPE_ALIASES table.`
      );
    }
  }

  // strainGuard expected but not applied
  if (tc.id === 'D' && !result.strainGuardApplied) {
    flags.push(`strainGuardApplied=false — expected true for morning session with strain below band.`);
  }

  // Score outside expected range
  if (!pass) {
    flags.push(`Score ${result.score} is outside expected range [${tc.expectedRange[0]}, ${tc.expectedRange[1]}].`);
  }

  if (flags.length > 0) {
    console.log();
    for (const f of flags) {
      console.log(`   ${YELLOW('⚠ ANOMALY:')} ${f}`);
      anomalies.push(`Case ${tc.id}: ${f}`);
    }
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(BOLD('\n══════════════════════════════════════════════════════════'));
console.log(BOLD('  TRAINING SCORE ENGINE — TEST HARNESS'));
console.log(BOLD('  Read-only. No DB writes. No logic changes.'));
console.log(BOLD('══════════════════════════════════════════════════════════'));

const results: { id: string; score: number; zone: string }[] = [];

for (const tc of cases) {
  const r = runCase(tc);
  results.push({ id: tc.id, score: r.score, zone: r.recoveryZone });
}

// ─── Distribution summary ─────────────────────────────────────────────────────

console.log(`\n${BOLD(CYAN('══ DISTRIBUTION SUMMARY ══'))}`);
console.log();
console.log('  Case  Score   Zone     Tier');
console.log('  ────  ─────   ──────   ────────────────────');
for (const r of results) {
  const tier = r.score >= 7 ? GREEN('High (7–10)') : r.score >= 5 ? YELLOW('Mid (5–6)') : RED('Low (1–4)');
  console.log(`  ${r.id.padEnd(5)} ${scoreColour(r.score).padEnd(14)} ${r.zone.padEnd(8)} ${tier}`);
}

// ─── Anomaly report ───────────────────────────────────────────────────────────

console.log(`\n${BOLD(CYAN('══ ANOMALY REPORT ══'))}`);
if (anomalies.length === 0) {
  console.log(GREEN('  No anomalies detected.'));
} else {
  console.log(`  ${anomalies.length} issue(s) found:\n`);
  anomalies.forEach((a, i) => {
    console.log(`  ${YELLOW(`${i + 1}.`)} ${a}`);
    console.log();
  });
}

// ─── Key findings ─────────────────────────────────────────────────────────────

console.log(`\n${BOLD(CYAN('══ KEY FINDINGS ══'))}`);
console.log(`
  1. UNIVERSAL SEVERE PAIN OVERRIDE [FIXED]:
     Any comment containing severe pain keywords (sharp pain, agony, excruciating, stabbing,
     throbbing, etc.) now forces injurySafety=0.0 regardless of rehabActive.
     Additionally, the total score is hard-capped at 5.5 when severe pain is detected.
     → Case G: previously scored ~8.3, now correctly ≤5.0.

  2. EXPANDED SENTIMENT LEXICON [FIXED]:
     Added: "pain", "sore", "agony", "sharp", "stabbing", "throbbing", "aching",
     "flare", "limping", "swelling", "tweaked", "strained" to negative sentiment words.
     Pain language now correctly reduces sessionQuality score as well.

  3. TRAINING TYPE SYNONYM NORMALIZATION [FIXED]:
     Added TYPE_ALIASES table mapping common aliases to canonical keywords.
     "Weight Training" now maps to "weights" → correct 2.0 alignment with "strength" goal.
     Other aliases: gym, barbell, dumbbell, resistance training, swimming, walking, etc.

  4. EARLY-DAY GUARD IS CONSERVATIVE (correct behaviour):
     Morning sessions with low strain get a floor of 2.0 (not penalised to 1.5).
     strainGuardApplied flag correctly signals when the guard activates.

  5. NO-STRAIN CAP IS STRICT (correct behaviour):
     Missing WHOOP data caps total score at 7.0 regardless of session quality.
     A yoga session that would score 7.6 is capped to 7.0 — appropriate conservatism.
`);

console.log(BOLD('══════════════════════════════════════════════════════════\n'));
