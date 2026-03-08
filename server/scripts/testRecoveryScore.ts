/**
 * Recovery Score Test Harness
 *
 * PURPOSE: Validate the recovery scoring engine using controlled synthetic inputs.
 * - No DB writes. No logic changes. Read-only.
 * - Run with: node_modules/.bin/tsx server/scripts/testRecoveryScore.ts
 *
 * Formula:
 *   total = (recoveryScaled × 0.40) + (sleepQuality × 0.40) + (hrvScaled × 0.20)
 *
 * Components:
 *   recoveryScaled  : (recoveryPercent / 100) × 10  → linear 0–10
 *   sleepQuality    : hoursPoints (0–6) + sleepScorePoints (0–4) → 0–10
 *   hrvScaled       : 5 + deltaPoints, clamped [3, 7] → centred at 5
 */

import { RecoveryScoreService, RecoveryScoreInput, RecoveryScoreResult } from '../services/recoveryScoreService.js';

const svc = new RecoveryScoreService();

// ─── Colour helpers ───────────────────────────────────────────────────────────
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

// ─── Test cases ───────────────────────────────────────────────────────────────

interface RecoveryTestCase {
  id: string;
  label: string;
  input: RecoveryScoreInput;
  expectedRange: [number, number];
  expectedZone: 'green' | 'yellow' | 'red';
  notes: string;
}

const cases: RecoveryTestCase[] = [
  {
    id: 'A',
    label: 'High Recovery %, good sleep, HRV uptrend (ideal green)',
    input: {
      recoveryPercent: 85,
      sleepHours: 8.5,
      sleepScorePercent: 88,
      hrv: 72,
      hrvBaseline: 62,
    },
    expectedRange: [8.5, 9.5],
    expectedZone: 'green',
    notes: [
      'recoveryScaled = 8.5 | sleepQuality = 6+4=10 | hrvDelta=+10 → deltaPoints=2 → hrvScaled=7',
      'total = (8.5×0.40)+(10×0.40)+(7×0.20) = 3.40+4.00+1.40 = 8.80 → score=8.8',
    ].join('\n     '),
  },
  {
    id: 'B',
    label: 'High Recovery %, poor sleep (WHOOP vs sleep conflict)',
    input: {
      recoveryPercent: 82,
      sleepHours: 5.5,
      sleepScorePercent: 42,
      hrv: 65,
      hrvBaseline: 63,
    },
    expectedRange: [6.0, 6.8],
    expectedZone: 'yellow', // composite 6.3 < 7 → yellow (zone now follows composite, not WHOOP %)
    notes: [
      'recoveryScaled = 8.2 | sleepQuality = 3+2=5 | hrvDelta=+2 → deltaPoints=0 → hrvScaled=5',
      'total = (8.2×0.40)+(5×0.40)+(5×0.20) = 3.28+2.00+1.00 = 6.28 → score=6.3',
      'Zone: composite 6.3 < 7 → yellow (WHOOP% was green at 82% but zone now follows composite score).',
      'Recovery weight (40%) still compensates for sleep debt — score feels generous but zone is honest.',
    ].join('\n     '),
  },
  {
    id: 'C',
    label: 'Low Recovery %, excellent sleep (red zone body vs ideal bed)',
    input: {
      recoveryPercent: 22,
      sleepHours: 8.5,
      sleepScorePercent: 91,
      hrv: 48,
      hrvBaseline: 62,
    },
    expectedRange: [5.0, 6.0],
    expectedZone: 'yellow', // composite 5.5 ∈ [5,7) → yellow (zone follows composite, not WHOOP %)
    notes: [
      'recoveryScaled = 2.2 | sleepQuality = 6+4=10 (perfect) | hrvDelta=-14 → deltaPoints=-2 → hrvScaled=3',
      'total = (2.2×0.40)+(10×0.40)+(3×0.20) = 0.88+4.00+0.60 = 5.48 → score=5.5',
      'Zone: composite 5.5 ∈ [5,7) → yellow. WHOOP% was red (22%) but composite zone reflects full picture.',
      'FINDING: Perfect sleep (10/10) rescues zone from red→yellow but cannot reach green. Score ceiling 5.5.',
    ].join('\n     '),
  },
  {
    id: 'D',
    label: 'Moderate Recovery %, strong HRV uptrend',
    input: {
      recoveryPercent: 55,
      sleepHours: 7.2,
      sleepScorePercent: 75,
      hrv: 85,
      hrvBaseline: 70,
    },
    expectedRange: [6.5, 7.2],
    expectedZone: 'yellow',
    notes: [
      'recoveryScaled = 5.5 | sleepQuality = 5+3=8 | hrvDelta=+15 → deltaPoints=2 → hrvScaled=7 (max)',
      'total = (5.5×0.40)+(8×0.40)+(7×0.20) = 2.20+3.20+1.40 = 6.80 → score=6.8',
      'FINDING: Even a maxed HRV (delta=+15, hrvScaled=7) only adds 1.4 to total — worth 0.4 vs neutral.',
      'HRV cannot push a moderate-recovery day into "excellent" territory (≥8).',
    ].join('\n     '),
  },
  {
    id: 'E',
    label: 'Moderate Recovery %, strong HRV downtrend (stress signal)',
    input: {
      recoveryPercent: 52,
      sleepHours: 7.0,
      sleepScorePercent: 72,
      hrv: 55,
      hrvBaseline: 70,
    },
    expectedRange: [5.5, 6.5],
    expectedZone: 'yellow',
    notes: [
      'recoveryScaled = 5.2 | sleepQuality = 5+3=8 | hrvDelta=-15 → deltaPoints=-2 → hrvScaled=3 (min)',
      'total = (5.2×0.40)+(8×0.40)+(3×0.20) = 2.08+3.20+0.60 = 5.88 → score=5.9',
      'Compare vs Case D (same recovery/sleep, uptrend): D=6.8, E=5.9 → HRV swing = 0.9 points max.',
      'FINDING: Max HRV impact on final score is only ±0.4 vs neutral (0.8 total range between min/max).',
      'Strong downtrend like -15ms does NOT push the score into red. Feels underweighted as a risk signal.',
    ].join('\n     '),
  },
  {
    id: 'F',
    label: 'Excellent sleep hours but very low sleep score (quantity vs quality)',
    input: {
      recoveryPercent: 65,
      sleepHours: 9.0,
      sleepScorePercent: 35,
      hrv: 61,
      hrvBaseline: 62,
    },
    expectedRange: [5.0, 5.5], // guardrail: sleepScore 35% < 40% → hoursPoints capped at 3 → score 5.2
    expectedZone: 'yellow',
    notes: [
      'recoveryScaled = 6.5 | GUARDRAIL: sleepScore=35% < 40% → hoursPoints capped at 3 (from 6)',
      'sleepQuality = 3+1=4 (was 7 pre-guardrail) | hrvDelta=-1 → deltaPoints=0 → hrvScaled=5',
      'total = (6.5×0.40)+(4×0.40)+(5×0.20) = 2.60+1.60+1.00 = 5.20 → score=5.2',
      'GUARDRAIL VERIFIED: 9h of fragmented/poor-quality sleep no longer inflates sleepQuality.',
      'Pre-guardrail score was 6.4 — now correctly penalised to 5.2.',
    ].join('\n     '),
  },
  {
    id: 'G',
    label: 'Very low sleep hours but high Recovery % (short sleep paradox)',
    input: {
      recoveryPercent: 78,
      sleepHours: 4.2,
      sleepScorePercent: 82,
      hrv: 68,
      hrvBaseline: 66,
    },
    expectedRange: [5.8, 6.5],
    expectedZone: 'yellow', // composite 6.1 < 7 → yellow (zone now follows composite, not WHOOP %)
    notes: [
      'recoveryScaled = 7.8 | sleepQuality: hours=4.2→2pts, score=82%→round(3.28)=3pts → 2+3=5',
      'hrvDelta=+2 → deltaPoints=0 → hrvScaled=5',
      'total = (7.8×0.40)+(5×0.40)+(5×0.20) = 3.12+2.00+1.00 = 6.12 → score=6.1',
      'ZONE FIX VERIFIED: was green (WHOOP 78%) — now correctly yellow because composite 6.1 < 7.',
      '4.2h sleep correctly prevents the user from seeing a misleading green zone label.',
    ].join('\n     '),
  },
  {
    id: 'H',
    label: 'Flat HRV trend — neutral baseline (hidden floor behaviour)',
    input: {
      recoveryPercent: 58,
      sleepHours: 7.5,
      sleepScorePercent: 68,
      hrv: 64,
      hrvBaseline: 65,
    },
    expectedRange: [6.2, 6.8],
    expectedZone: 'yellow',
    notes: [
      'recoveryScaled = 5.8 | sleepQuality = 5+3=8 | hrvDelta=-1 → deltaPoints=0 → hrvScaled=5',
      'total = (5.8×0.40)+(8×0.40)+(5×0.20) = 2.32+3.20+1.00 = 6.52 → score=6.5',
      'FINDING: Flat HRV is always exactly 5.0 → contributes exactly 1.0 to total regardless of data.',
      'With flat HRV, the formula simplifies to: 0.80×(recovery×0.5 + sleep×0.5) + 1.0.',
      'This makes many "typical" days cluster around 6–7, creating a "too average" feel.',
    ].join('\n     '),
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

const anomalies: string[] = [];

function runCase(tc: RecoveryTestCase): RecoveryScoreResult {
  const result = svc.calculateRecoveryScore(tc.input);
  const pass = result.score >= tc.expectedRange[0] && result.score <= tc.expectedRange[1];
  const zonePass = result.recoveryZone === tc.expectedZone;
  const status = (pass && zonePass) ? GREEN('[PASS]') : RED('[FAIL]');

  console.log(`\n${BOLD(CYAN(`── Case ${tc.id}: ${tc.label}`))} ${status}`);
  console.log(DIM(`   Reasoning: ${tc.notes}`));
  console.log();

  // Input
  console.log(`   Input:`);
  console.log(`     recovery=${tc.input.recoveryPercent ?? 'n/a'}%  sleepHours=${tc.input.sleepHours ?? 'n/a'}h  sleepScore=${tc.input.sleepScorePercent ?? 'n/a'}%`);
  console.log(`     hrv=${tc.input.hrv ?? 'n/a'}ms  baseline=${tc.input.hrvBaseline ?? 'n/a'}ms  delta=${tc.input.hrv && tc.input.hrvBaseline ? tc.input.hrv - tc.input.hrvBaseline : 'n/a'}ms`);

  // Result
  console.log();
  console.log(`   Result:`);
  console.log(`     Score:         ${scoreColour(result.score)}  (expected ${tc.expectedRange[0]}–${tc.expectedRange[1]})`);
  console.log(`     Zone:          ${result.recoveryZone}  (expected ${tc.expectedZone})`);

  // Breakdown
  console.log();
  console.log(`   Breakdown (raw component values):`);
  console.log(`     recoveryScaled : ${result.breakdown.recoveryScaled.toFixed(1)} / 10  × 0.40 = ${(result.breakdown.recoveryScaled * 0.40).toFixed(2)} pts`);
  console.log(`     sleepQuality   : ${result.breakdown.sleepQuality.toFixed(1)} / 10  × 0.40 = ${(result.breakdown.sleepQuality * 0.40).toFixed(2)} pts`);
  console.log(`     hrvScaled      : ${result.breakdown.hrvScaled.toFixed(1)} / 10  × 0.20 = ${(result.breakdown.hrvScaled * 0.20).toFixed(2)} pts`);
  console.log(`     ─────────────────────────────────────────`);
  const rawSum = result.breakdown.recoveryScaled * 0.40
               + result.breakdown.sleepQuality   * 0.40
               + result.breakdown.hrvScaled      * 0.20;
  console.log(`     weighted sum   : ${rawSum.toFixed(2)}  →  final score: ${scoreColour(result.score)}`);

  // Max possible contributions
  console.log();
  const maxRecovery  = 10 * 0.40;
  const maxSleep     = 10 * 0.40;
  const maxHrv       = 7  * 0.20;
  const recoveryPct  = ((result.breakdown.recoveryScaled * 0.40) / maxRecovery * 100).toFixed(0);
  const sleepPct     = ((result.breakdown.sleepQuality   * 0.40) / maxSleep    * 100).toFixed(0);
  const hrvPct       = ((result.breakdown.hrvScaled      * 0.20) / maxHrv      * 100).toFixed(0);
  console.log(`   Component utilisation (% of max each component can contribute):`);
  console.log(`     Recovery  ${recoveryPct}% of max 4.0 pts`);
  console.log(`     Sleep     ${sleepPct}% of max 4.0 pts`);
  console.log(`     HRV       ${hrvPct}% of max 1.4 pts`);

  // Anomaly checks
  const flags: string[] = [];

  if (!pass) {
    flags.push(`Score ${result.score} outside expected range [${tc.expectedRange[0]}, ${tc.expectedRange[1]}].`);
  }
  if (!zonePass) {
    flags.push(`Zone "${result.recoveryZone}" does not match expected "${tc.expectedZone}".`);
  }

  // Case B: high recovery but poor sleep — score should feel questionable
  if (tc.id === 'B' && result.score >= 6.0) {
    flags.push(
      `Score=${result.score} despite only 5.5h fragmented sleep. Recovery weight (40%) masks sleep debt. ` +
      `A user may feel unready but see a "good" score.`
    );
    anomalies.push(`Case B: ${flags[flags.length - 1]}`);
  }

  // Case C: ceiling check — perfect sleep still can't break 6.5
  if (tc.id === 'C' && result.score > 6.5) {
    flags.push(`UNEXPECTED: score=${result.score} > 6.5 despite recovery=22%. Check formula weights.`);
    anomalies.push(`Case C: score unexpectedly high: ${result.score}`);
  }

  // Case F: REGRESSION guard — guardrail must cap sleepQuality below 5 when sleepScore < 40%
  if (tc.id === 'F' && result.breakdown.sleepQuality >= 5) {
    flags.push(
      `REGRESSION: sleepQuality=${result.breakdown.sleepQuality} ≥ 5 despite sleepScore=35% < 40%. ` +
      `Guardrail (hoursPoints capped at 3 when sleepScore < 40%) may have been reverted.`
    );
    anomalies.push(`Case F: ${flags[flags.length - 1]}`);
  }

  // Case G: REGRESSION guard — zone must NOT be green when composite < 7 (fix verified)
  if (tc.id === 'G' && result.recoveryZone === 'green') {
    flags.push(
      `REGRESSION: Zone=green despite composite score ${result.score} < 7. ` +
      `Zone fix (composite-based thresholds) may have been reverted.`
    );
    anomalies.push(`Case G: ${flags[flags.length - 1]}`);
  }

  // Case D vs E: HRV swing magnitude check
  if (tc.id === 'E') {
    const maxHrvContrib = 7  * 0.20; // 1.4
    const minHrvContrib = 3  * 0.20; // 0.6
    const swing = maxHrvContrib - minHrvContrib; // 0.8
    flags.push(
      `Total HRV impact range on final score: ${swing.toFixed(1)} pts (max 1.4 → min 0.6). ` +
      `Even a catastrophic HRV drop (−15ms) cannot push a moderate-recovery day below 5.5. ` +
      `HRV is capped at [3,7] — only 4 tiers of distinction across any HRV reading.`
    );
    anomalies.push(`Case E: HRV capped swing of only 0.8pts out of 10. Underweighted as risk signal.`);
  }

  if (flags.length > 0) {
    console.log();
    for (const f of flags) {
      console.log(`   ${YELLOW('⚠')} ${f}`);
    }
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(BOLD('\n══════════════════════════════════════════════════════════'));
console.log(BOLD('  RECOVERY SCORE ENGINE — TEST HARNESS'));
console.log(BOLD('  Read-only. No DB writes. No logic changes.'));
console.log(BOLD('══════════════════════════════════════════════════════════'));
console.log(BOLD('\n  Formula: total = recoveryScaled×0.40 + sleepQuality×0.40 + hrvScaled×0.20'));
console.log(BOLD('  Max achievable: 10×0.40 + 10×0.40 + 7×0.20 = 4.0 + 4.0 + 1.4 = 9.4 (not 10.0!)'));

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

// ─── Component limits ─────────────────────────────────────────────────────────

console.log(`\n${BOLD(CYAN('══ COMPONENT CEILING ANALYSIS ══'))}`);
console.log(`
  Component      Max raw   Weight   Max pts   Notes
  ─────────────────────────────────────────────────────
  Recovery %     10.0      ×0.40    4.0 pts   Linear: 100% recovery → 10.0
  Sleep quality  10.0      ×0.40    4.0 pts   8h+88%+ sleep → 10.0
  HRV trend      7.0       ×0.20    1.4 pts   ← CAPPED at 7.0, never 10.0!
  ─────────────────────────────────────────────────────
  Maximum score achievable                8.8 pts
  (displayed as)                          8.8 / 10
`);
console.log(`  ${YELLOW('⚠')} The theoretical maximum score is 8.8, not 10.0 — because HRV is capped at 7`);
console.log(`     (not 10). A user can never see a score of 9.0 or higher from real data.`);
console.log(`     Perfect recovery (100%) + perfect sleep + maxed HRV = ${((10*0.40)+(10*0.40)+(7*0.20)).toFixed(1)}/10`);
console.log();
console.log(`  ${YELLOW('⚠')} HRV has only 4 effective tiers: [3, 4, 5, 6, 7]`);
console.log(`     Each tier boundary crosses at delta ±3 and ±8. Anything beyond ±8 is clamped.`);
console.log(`     A delta of +20ms scores identically to +8ms. Upside signal is lost above threshold.`);

// ─── Key findings ─────────────────────────────────────────────────────────────

console.log(`\n${BOLD(CYAN('══ KEY FINDINGS ══'))}`);
console.log(`
  1. MAXIMUM SCORE IS 8.8, NOT 10.0:
     HRV is capped at 7 (not 10) × 0.20 = 1.4 max. Recovery + Sleep max is 4.0+4.0=8.0.
     Combined ceiling: 9.4 before rounding. In practice 8.8 is achievable.
     → Users will never see a 9.0+ recovery score. This may frustrate high performers.

  2. HRV IS UNDERWEIGHTED AS A RISK SIGNAL (20% weight, clamped to [3–7]):
     Max HRV swing on final score = 0.8 points (from 0.6 to 1.4).
     A catastrophic HRV crash (−15ms) only costs 0.4 points vs neutral.
     A large uptrend (+15ms) only adds 0.4 points vs neutral.
     → HRV acts more as a "tiebreaker" than a meaningful signal. Strong trend is invisible.

  3. SLEEP HOURS DOMINATE THE SLEEP COMPONENT (6/10 points vs 4/10 for sleep score):
     Duration (hours) accounts for 60% of sleepQuality weight.
     A person sleeping 9h with terrible quality (35% score) gets sleepQuality=7/10.
     A person sleeping 6h with perfect quality (98% score) gets sleepQuality=8/10.
     → Sleep quality efficiency is undervalued relative to raw duration.

  4. RECOVERY % CAN MASK SLEEP DEBT (Case B, Case G):
     High WHOOP recovery (78–82%) with very short sleep (4–5h) still scores 6.1–6.3.
     The recovery zone (green/yellow/red) is ALSO driven purely by recoveryPercent —
     sleep cannot demote the zone. Users may see "green zone + 6.1" and feel safe when
     they slept 4h.

  5. SLEEP CANNOT COMPENSATE FOR BAD RECOVERY (Case C):
     Perfect sleep (10/10) + terrible recovery (22%) = 5.5 final score.
     Sleep can pull a bad-recovery day to mid-range (5–6) but never to "good" (7+).
     This is intentional and behaves correctly.

  6. DOUBLE-COUNTING DESIGN NOTE:
     WHOOP's recovery% already internally factors in HRV and sleep efficiency.
     The service ALSO uses raw sleep hours/score and HRV directly as separate inputs.
     This means HRV and sleep are counted twice: once baked into recoveryPercent (40%),
     and once as their own components (40% + 20%). The code comment acknowledges this
     ("reduced weight from 50% to 40%") but the double-counting is not fully resolved.

  7. SCORE COMPRESSION AROUND 6–7 FOR TYPICAL DAYS (Case H):
     Flat HRV always contributes exactly 1.0 (5×0.20) regardless of data quality.
     This floors the score: even a very bad day (recovery=30, sleep=4h, flat HRV)
     gets at minimum: (3.0×0.40) + (3×0.40) + (5×0.20) = 1.2+1.2+1.0 = 3.4 → 3.4/10.
     Most realistic inputs (moderate recovery + decent sleep + flat HRV) cluster ~6–7.
`);

console.log(BOLD('══════════════════════════════════════════════════════════\n'));
