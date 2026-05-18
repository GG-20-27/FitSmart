/**
 * Manual Training Scoring — Phase 3 refinement test suite
 * Run with: npx tsx test-training-scoring.ts
 */

import { trainingScoreService, TrainingScoreInput } from './server/services/trainingScoreService';

// ─── Minimal assertion helpers ────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results: string[] = [];

function expect(label: string, actual: any, check: (v: any) => boolean, hint?: string) {
  if (check(actual)) {
    passed++;
    results.push(`  ✓ ${label}`);
  } else {
    failed++;
    results.push(`  ✗ ${label}  →  got: ${JSON.stringify(actual)}${hint ? `  (${hint})` : ''}`);
  }
}

function section(title: string) {
  results.push(`\n── ${title} ──`);
}

// ─── Helper: build a minimal manual input ─────────────────────────────────────
function manualInput(overrides: Partial<TrainingScoreInput> = {}): TrainingScoreInput {
  return {
    type: 'Running',
    duration: 45,
    skipped: false,
    dataSource: 'manual',
    ...overrides,
  };
}

// ─── 1. EFFORT FIT MATRIX ─────────────────────────────────────────────────────
section('1. Effort Fit Matrix (green zone)');
{
  const g_high = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 8.0, intensity: 'High' }));
  expect('green + High → effortFit 4.0', g_high.breakdown.strainAppropriatenessScore, v => v === 4.0);

  const g_mod = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 8.0, intensity: 'Moderate' }));
  expect('green + Moderate → effortFit 3.5', g_mod.breakdown.strainAppropriatenessScore, v => v === 3.5);

  const g_low = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 8.0, intensity: 'Low' }));
  expect('green + Low → effortFit 2.0', g_low.breakdown.strainAppropriatenessScore, v => v === 2.0);

  expect('green zone classification', g_high.recoveryZone, v => v === 'green');
}

section('2. Effort Fit Matrix (yellow zone)');
{
  const y_mod = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 5.5, intensity: 'Moderate' }));
  expect('yellow + Moderate → effortFit 4.0', y_mod.breakdown.strainAppropriatenessScore, v => v === 4.0);

  const y_low = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 6.0, intensity: 'Low' }));
  expect('yellow + Low → effortFit 2.5', y_low.breakdown.strainAppropriatenessScore, v => v === 2.5);

  const y_high = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 6.5, intensity: 'High' }));
  expect('yellow + High → effortFit 2.5', y_high.breakdown.strainAppropriatenessScore, v => v === 2.5);

  expect('yellow zone classification', y_mod.recoveryZone, v => v === 'yellow');
}

section('3. Effort Fit Matrix (red zone)');
{
  const r_low = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 3.0, intensity: 'Low' }));
  expect('red + Low → effortFit 3.5', r_low.breakdown.strainAppropriatenessScore, v => v === 3.5);

  const r_mod = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 4.0, intensity: 'Moderate' }));
  expect('red + Moderate → effortFit 2.5', r_mod.breakdown.strainAppropriatenessScore, v => v === 2.5);

  const r_high = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 2.0, intensity: 'High' }));
  expect('red + High → effortFit 1.5', r_high.breakdown.strainAppropriatenessScore, v => v === 1.5);

  expect('red zone classification', r_high.recoveryZone, v => v === 'red');
}

section('4. Effort Fit — unknown intensity → 2.5 neutral');
{
  const no_int = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 8.0 }));
  expect('green + no intensity → effortFit 2.5', no_int.breakdown.strainAppropriatenessScore, v => v === 2.5);
}

// ─── 2. RECOVERY ZONE BOUNDARIES ──────────────────────────────────────────────
section('5. Manual recovery zone thresholds');
{
  const z70 = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 7.0, intensity: 'High' }));
  expect('score 7.0 → green', z70.recoveryZone, v => v === 'green');

  const z69 = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 6.9, intensity: 'Moderate' }));
  expect('score 6.9 → yellow', z69.recoveryZone, v => v === 'yellow');

  const z50 = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 5.0, intensity: 'Low' }));
  expect('score 5.0 → yellow', z50.recoveryZone, v => v === 'yellow');

  const z49 = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 4.9, intensity: 'Low' }));
  expect('score 4.9 → red', z49.recoveryZone, v => v === 'red');

  const no_checkin = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: undefined, intensity: 'Moderate' }));
  expect('no check-in → defaults to yellow zone', no_checkin.recoveryZone, v => v === 'yellow');
}

// ─── 3. NO CHECK-IN CAP ───────────────────────────────────────────────────────
section('6. No check-in — effort fit capped at 3.0');
{
  // Without noCheckin: green+High would be 4.0
  const with_checkin = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 8.0, intensity: 'High' }));
  expect('with check-in green+High → 4.0 (no cap)', with_checkin.breakdown.strainAppropriatenessScore, v => v === 4.0);

  // Without check-in: capped at 3.0
  const no_checkin_high = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: undefined, intensity: 'High' }));
  expect('no check-in + High → effortFit capped at 3.0', no_checkin_high.breakdown.strainAppropriatenessScore, v => v <= 3.0);

  const no_checkin_mod = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: undefined, intensity: 'Moderate' }));
  expect('no check-in + Moderate (yellow→4.0 normally) → capped at 3.0', no_checkin_mod.breakdown.strainAppropriatenessScore, v => v <= 3.0);

  // Red+High is 1.5, already below cap — should be unchanged
  const no_checkin_red_high = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: undefined, intensity: 'Low' }));
  expect('no check-in + Low (red→3.5) → capped at 3.0', no_checkin_red_high.breakdown.strainAppropriatenessScore, v => v <= 3.0);
}

// ─── 4. SESSION QUALITY — COMMENT WEIGHT ──────────────────────────────────────
section('7. Session quality — comment weight and neutral baseline');
{
  // No comment → neutral baseline 0.4
  const no_comment = trainingScoreService.calculateTrainingScore(manualInput({ manualRecoveryScore: 7.0, intensity: 'Moderate', duration: 45 }));
  // sessionQuality ≈ 1.2 (45 min) + 1.0 (moderate) + 0.4 (no comment) = 2.6
  expect('no comment → sessionQuality ≈ 2.6', no_comment.breakdown.sessionQualityScore, v => Math.abs(v - 2.6) < 0.05);

  // Very positive comment → boosts above 2.6
  const pos_comment = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 7.0, intensity: 'Moderate', duration: 45,
    comment: 'felt great, strong session, amazing energy'
  }));
  expect('positive comment → sessionQuality > no-comment baseline', pos_comment.breakdown.sessionQualityScore, v => v > 2.6);

  // Negative comment → reduces below 2.6
  const neg_comment = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 7.0, intensity: 'Moderate', duration: 45,
    comment: 'exhausted, struggled, bad session'
  }));
  expect('negative comment → sessionQuality < no-comment baseline', neg_comment.breakdown.sessionQualityScore, v => v < 2.6);

  // Positive boosts more than before (max 1.0 vs old 0.8)
  expect('positive comment sessionQuality can reach close to 3.0', pos_comment.breakdown.sessionQualityScore, v => v >= 2.8,
    'expected positive comment to reach ≥ 2.8/3.0');
}

// ─── 5. SAFETY PENALTIES ──────────────────────────────────────────────────────
section('8. Safety — high intensity in red zone (penalty -0.6)');
{
  const red_high = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 3.0, intensity: 'High', duration: 45
  }));
  // recoveryForInjury = 3.0 * 10 = 30 < 40 → penalty -0.6 → injurySafety = 0.4
  expect('red + High → injurySafety ≤ 0.4', red_high.breakdown.injurySafetyModifier, v => v <= 0.4);
  expect('red + High → safetyFlag present', red_high.safetyFlag, v => typeof v === 'string' && v.length > 0);
  expect('red + High → safetyFlag mentions low recovery', red_high.safetyFlag, v => /low recovery|readiness/i.test(v ?? ''));
  expect('red + High → total score visibly penalised (≤ 7)', red_high.score, v => v <= 7.0);
}

section('9. Safety — high intensity in lower yellow zone (penalty -0.3)');
{
  const yellow_high = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 5.0, intensity: 'High', duration: 45
  }));
  // recoveryForInjury = 50 < 55 → penalty -0.3 → injurySafety = 0.7
  expect('lower yellow + High → injurySafety ≈ 0.7', yellow_high.breakdown.injurySafetyModifier, v => Math.abs(v - 0.7) < 0.05);
  expect('lower yellow + High → safetyFlag present', yellow_high.safetyFlag, v => typeof v === 'string' && v.length > 0);
}

section('10. Safety — no penalty in green zone');
{
  const green_high = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 8.0, intensity: 'High', duration: 45
  }));
  expect('green + High → injurySafety = 1.0 (no penalty)', green_high.breakdown.injurySafetyModifier, v => v === 1.0);
  expect('green + High → no safetyFlag', green_high.safetyFlag, v => v === undefined);
}

section('11. Safety — pain in comment (-0.5 penalty)');
{
  const pain_comment = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 7.0, intensity: 'Low', duration: 45,
    comment: 'felt a bit sore in the knee'
  }));
  expect('pain in comment → injurySafety ≤ 0.5', pain_comment.breakdown.injurySafetyModifier, v => v <= 0.5);
  expect('pain in comment → safetyFlag present', pain_comment.safetyFlag, v => typeof v === 'string');
}

section('12. Safety — severe pain → injurySafety = 0.0');
{
  const severe = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 7.0, intensity: 'High', duration: 45,
    comment: 'sharp pain in the ankle, had to stop'
  }));
  expect('severe pain → injurySafety = 0.0', severe.breakdown.injurySafetyModifier, v => v === 0.0);
  expect('severe pain → score capped at 5.0', severe.score, v => v <= 5.0);
  expect('severe pain → safetyFlag present', severe.safetyFlag, v => typeof v === 'string' && v.length > 0);
}

section('13. Safety — combined: pain in comment + red + high intensity');
{
  const worst_case = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 2.0, intensity: 'High', duration: 45,
    comment: 'severe pain, couldnt walk afterwards'
  }));
  expect('severe pain + red recovery → injurySafety = 0.0', worst_case.breakdown.injurySafetyModifier, v => v === 0.0);
  expect('severe pain + red recovery → score ≤ 5', worst_case.score, v => v <= 5.0);
}

// ─── 6. FULL SCORING SCENARIOS ────────────────────────────────────────────────
section('14. Full scenario — ideal session (green + moderate + good duration)');
{
  const ideal = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 8.5, intensity: 'High', duration: 60,
    comment: 'great session, felt strong and energized'
  }));
  expect('ideal session → score ≥ 8.0', ideal.score, v => v >= 8.0);
  expect('ideal session → no safetyFlag', ideal.safetyFlag, v => v === undefined);
  expect('ideal session → green zone', ideal.recoveryZone, v => v === 'green');
}

section('15. Full scenario — smart red day (low intensity, rest)');
{
  const smart_rest = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 3.5, intensity: 'Low', duration: 30,
    comment: 'easy walk, respecting recovery'
  }));
  expect('smart red day → score ≥ 6.0 (restrained effort rewarded)', smart_rest.score, v => v >= 6.0);
  expect('smart red day → no safetyFlag', smart_rest.safetyFlag, v => v === undefined);
  expect('smart red day → effortFit = 3.5 (red+Low)', smart_rest.breakdown.strainAppropriatenessScore, v => v === 3.5);
}

section('16. Full scenario — wrong call on red day (high intensity)');
{
  const bad_choice = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: 3.5, intensity: 'High', duration: 60
  }));
  expect('bad red day → score ≤ 5.7 (penalised)', bad_choice.score, v => v <= 5.7);
  expect('bad red day → safetyFlag present', bad_choice.safetyFlag, v => typeof v === 'string');
  expect('bad red day → effortFit = 1.5 (red+High)', bad_choice.breakdown.strainAppropriatenessScore, v => v === 1.5);
}

section('17. Full scenario — no check-in, good session quality');
{
  const no_ci = trainingScoreService.calculateTrainingScore(manualInput({
    manualRecoveryScore: undefined, intensity: 'Moderate', duration: 45
  }));
  // No-checkin cap: effortFit 3.0 (vs 4.0) + sessionQuality 2.6 + goalAlign 1.2 + safety 1.0 = 7.8 max
  expect('no check-in → score ≤ 7.9 (ceiling limited vs 8.8+ with check-in)', no_ci.score, v => v <= 7.9);
  expect('no check-in → effortFit ≤ 3.0', no_ci.breakdown.strainAppropriatenessScore, v => v <= 3.0);
}

// ─── 7. WHOOP USERS — UNCHANGED ───────────────────────────────────────────────
section('18. WHOOP users — logic unchanged');
{
  const whoop_with_strain: TrainingScoreInput = {
    type: 'Running', duration: 45, skipped: false,
    dataSource: 'whoop',
    recoveryScore: 85, strainScore: 14,
  };
  const w1 = trainingScoreService.calculateTrainingScore(whoop_with_strain);
  expect('WHOOP with strain → uses strain appropriateness (not effort fit)', w1.score, v => v > 0);
  expect('WHOOP with strain → no 7.0 cap', w1.score, v => v > 7.0);

  const whoop_no_strain: TrainingScoreInput = {
    type: 'Running', duration: 45, skipped: false,
    dataSource: 'whoop',
    recoveryScore: 80, strainScore: undefined,
  };
  const w2 = trainingScoreService.calculateTrainingScore(whoop_no_strain);
  expect('WHOOP without strain → 7.0 cap applies', w2.score, v => v <= 7.0);
}

// ─── 8. SLEEP SCORE MAPPING ───────────────────────────────────────────────────
section('19. Sleep score mapping (inline verification)');
{
  function sleepScore(hours: number): number {
    if (hours < 5) return 3;
    if (hours < 6) return 5;
    if (hours < 7) return 7;
    if (hours < 8) return 8;
    return 9;
  }

  expect('4.9h → 3',  sleepScore(4.9), v => v === 3);
  expect('5.0h → 5',  sleepScore(5.0), v => v === 5);
  expect('5.9h → 5',  sleepScore(5.9), v => v === 5);
  expect('6.0h → 7',  sleepScore(6.0), v => v === 7);
  expect('7.0h → 8',  sleepScore(7.0), v => v === 8);
  expect('7.9h → 8',  sleepScore(7.9), v => v === 8);
  expect('8.0h → 9',  sleepScore(8.0), v => v === 9);
  expect('10h → 9  (capped — cannot reach 10)', sleepScore(10), v => v === 9);
  expect('max sleep score is 9, not 10', sleepScore(100), v => v === 9);
}

// ─── 9. RECOVERY SCORE FORMULA CHECK ─────────────────────────────────────────
section('20. Recovery score formula — max possible with new mapping');
{
  function computeRecovery(recovery: number, energy: number, sleepHours: number, quality: string) {
    let ss: number;
    if (sleepHours < 5) ss = 3;
    else if (sleepHours < 6) ss = 5;
    else if (sleepHours < 7) ss = 7;
    else if (sleepHours < 8) ss = 8;
    else ss = 9;
    // quality modifiers not applied in server (quality stored for display only)
    return Math.round((0.5 * recovery + 0.3 * energy + 0.2 * ss) * 10) / 10;
  }

  const maxPossible = computeRecovery(10, 10, 10, 'great');
  expect('max recovery score = 9.8 (not 10.0)', maxPossible, v => v === 9.8,
    `was ${maxPossible} — sleep cap at 9 means 0.5*10 + 0.3*10 + 0.2*9 = 9.8`);

  const longSleepBad = computeRecovery(3, 3, 10, 'poor');
  expect('8h+ sleep cannot save a bad recovery/energy day', longSleepBad, v => v < 5.0,
    `was ${longSleepBad}`);
}

// ─── RESULTS ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('  FitSmart Manual Training Scoring — Test Results');
console.log('═'.repeat(60));
results.forEach(r => console.log(r));
console.log('\n' + '─'.repeat(60));
console.log(`  Total: ${passed + failed}  ✓ Passed: ${passed}  ✗ Failed: ${failed}`);
console.log('─'.repeat(60) + '\n');

if (failed > 0) process.exit(1);
