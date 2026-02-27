/**
 * FitScoreTriangle — Premium performance engine visualization
 *
 * Design principles:
 *  - Brand colors preserved exactly (no desaturation of zone colors)
 *  - Directional gradients: each pillar flows from outer vertex toward center
 *  - Crisp dark division lines create intentional structure
 *  - Center dominates via size contrast and deep background
 *
 * Animations (sequential reveal):
 *  1. Nutrition appears (650ms) + score counts 0 → value (1100ms, easeOut)
 *  2. Training appears + score counts up
 *  3. Recovery appears + score counts up
 *  4. Center FitScore fades in + counts 0 → final score (1800ms — slowest, most special)
 *  5. If all 3 pillars same zone → center color fades in as final flourish (600ms)
 *     Center always starts dark/accent; color overlay arrives last so the reveal feels earned.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, {
  Path,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { colors } from '../theme';

interface FitScoreTriangleProps {
  recoveryScore: number;
  nutritionScore: number;
  trainingScore: number;
  fitScore: number;
  size?: number;
  animate?: boolean;
  // How many items each pillar aggregates — drives integer vs decimal display
  nutritionCount?: number; // 1 → integer, 2+ → 1 decimal
  trainingCount?: number;  // 1 → integer, 2+ → 1 decimal
  colors?: {
    recovery: string;
    nutrition: string;
    training: string;
    center: string;
  };
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

const getZoneColor = (score: number): string => {
  if (score >= 7) return colors.success;
  if (score >= 5) return colors.warning;
  return colors.danger;
};

const lightenColor = (hex: string, amount: number): string => {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * amount));
  const nb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FitScoreTriangle({
  recoveryScore,
  nutritionScore,
  trainingScore,
  fitScore,
  size = 280,
  animate = false,
  nutritionCount,
  trainingCount,
  colors: customColors,
}: FitScoreTriangleProps) {
  const pillarScores = { recovery: recoveryScore, nutrition: nutritionScore, training: trainingScore };
  const entries = Object.entries(pillarScores) as [string, number][];
  const strongestPillar = entries.reduce((a, b) => (a[1] > b[1] ? a : b))[0];
  const weakestPillar   = entries.reduce((a, b) => (a[1] < b[1] ? a : b))[0];

  // ── Colours (computed early — needed inside useEffect closure) ────────────────
  const c = {
    recovery:  customColors?.recovery  || getZoneColor(recoveryScore),
    nutrition: customColors?.nutrition || getZoneColor(nutritionCount === 1 ? Math.round(nutritionScore) : nutritionScore),
    training:  customColors?.training  || getZoneColor(trainingCount === 1 ? Math.round(trainingScore) : trainingScore),
  };
  const light = {
    recovery:  lightenColor(c.recovery,  0.55),
    nutrition: lightenColor(c.nutrition, 0.55),
    training:  lightenColor(c.training,  0.55),
  };
  // All 3 pillars same zone color → center gets color flourish after reveal
  const allSameColor = c.recovery === c.nutrition && c.nutrition === c.training;

  // ── Text opacity constants ────────────────────────────────────────────────────
  const scoreOpacity = 0.92;
  const labelOpacity = 0.65;

  // ── Layer animation values ────────────────────────────────────────────────────
  const topOpacity    = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const topScale      = useRef(new Animated.Value(animate ? 0.93 : 1)).current;
  const blOpacity     = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const blScale       = useRef(new Animated.Value(animate ? 0.93 : 1)).current;
  const brOpacity     = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const brScale       = useRef(new Animated.Value(animate ? 0.93 : 1)).current;
  const centerOpacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const centerScale   = useRef(new Animated.Value(animate ? 0.86 : 1)).current;

  // Color overlay for same-zone center — always starts at 0, fades in after center count
  const colorOverlayOpacity = useRef(new Animated.Value(0)).current;
  // Inverted: drives original text fading OUT as color overlay fades in
  const invertedOverlayOpacity = colorOverlayOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  // ── Score animation values (JS thread — needed for value listeners) ───────────
  const nutritionScoreAnim = useRef(new Animated.Value(animate ? 0 : nutritionScore)).current;
  const trainingScoreAnim  = useRef(new Animated.Value(animate ? 0 : trainingScore)).current;
  const recoveryScoreAnim  = useRef(new Animated.Value(animate ? 0 : recoveryScore)).current;
  const centerScoreAnim    = useRef(new Animated.Value(animate ? 0 : fitScore)).current;

  // ── Per-pillar display states for count-up ────────────────────────────────────
  const [displayNutrition, setDisplayNutrition] = useState(animate ? 0 : nutritionScore);
  const [displayTraining,  setDisplayTraining]  = useState(animate ? 0 : trainingScore);
  const [displayRecovery,  setDisplayRecovery]  = useState(animate ? 0 : recoveryScore);
  const [displayScore,     setDisplayScore]     = useState(animate ? 0 : fitScore);

  useEffect(() => {
    if (!animate) {
      setDisplayNutrition(nutritionScore);
      setDisplayTraining(trainingScore);
      setDisplayRecovery(recoveryScore);
      setDisplayScore(fitScore);
      // Static display: show final color state immediately
      colorOverlayOpacity.setValue(allSameColor ? 1 : 0);
      return;
    }

    // Reset all animation values to initial hidden state
    blOpacity.stopAnimation();        blOpacity.setValue(0);
    blScale.stopAnimation();          blScale.setValue(0.93);
    brOpacity.stopAnimation();        brOpacity.setValue(0);
    brScale.stopAnimation();          brScale.setValue(0.93);
    topOpacity.stopAnimation();       topOpacity.setValue(0);
    topScale.stopAnimation();         topScale.setValue(0.93);
    centerOpacity.stopAnimation();    centerOpacity.setValue(0);
    centerScale.stopAnimation();      centerScale.setValue(0.86);
    colorOverlayOpacity.stopAnimation(); colorOverlayOpacity.setValue(0);
    nutritionScoreAnim.stopAnimation();  nutritionScoreAnim.setValue(0);
    trainingScoreAnim.stopAnimation();   trainingScoreAnim.setValue(0);
    recoveryScoreAnim.stopAnimation();   recoveryScoreAnim.setValue(0);
    centerScoreAnim.stopAnimation();     centerScoreAnim.setValue(0);

    setDisplayNutrition(0);
    setDisplayTraining(0);
    setDisplayRecovery(0);
    setDisplayScore(0);

    const ease      = Easing.out(Easing.quad);
    const appearDur = 650;   // pillar fade-in duration
    const countDur  = 1100;  // per-pillar count-up (slower = more weight)
    const centerCountDur = 1800; // center FitScore count (slowest — most important)

    // Attach listeners for score count-ups
    const subN = nutritionScoreAnim.addListener(({ value }) =>
      setDisplayNutrition(parseFloat(value.toFixed(1))));
    const subT = trainingScoreAnim.addListener(({ value }) =>
      setDisplayTraining(parseFloat(value.toFixed(1))));
    const subR = recoveryScoreAnim.addListener(({ value }) =>
      setDisplayRecovery(parseFloat(value.toFixed(1))));
    const subC = centerScoreAnim.addListener(({ value }) =>
      setDisplayScore(parseFloat(value.toFixed(1))));

    // Sequential cascade: Nutrition → Training → Recovery → Center → (color overlay)
    Animated.parallel([
      Animated.timing(blOpacity,          { toValue: 1,              duration: appearDur, easing: ease, useNativeDriver: true }),
      Animated.timing(blScale,            { toValue: 1,              duration: appearDur, easing: ease, useNativeDriver: true }),
      Animated.timing(nutritionScoreAnim, { toValue: nutritionScore,  duration: countDur,  easing: ease, useNativeDriver: false }),
    ]).start(() => {
      Animated.parallel([
        Animated.timing(brOpacity,         { toValue: 1,             duration: appearDur, easing: ease, useNativeDriver: true }),
        Animated.timing(brScale,           { toValue: 1,             duration: appearDur, easing: ease, useNativeDriver: true }),
        Animated.timing(trainingScoreAnim, { toValue: trainingScore,  duration: countDur,  easing: ease, useNativeDriver: false }),
      ]).start(() => {
        Animated.parallel([
          Animated.timing(topOpacity,        { toValue: 1,            duration: appearDur, easing: ease, useNativeDriver: true }),
          Animated.timing(topScale,          { toValue: 1,            duration: appearDur, easing: ease, useNativeDriver: true }),
          Animated.timing(recoveryScoreAnim, { toValue: recoveryScore, duration: countDur,  easing: ease, useNativeDriver: false }),
        ]).start(() => {
          // Center: appear + slowest count-up — the final reveal
          Animated.parallel([
            Animated.timing(centerOpacity,   { toValue: 1,       duration: 500,          easing: ease, useNativeDriver: true }),
            Animated.timing(centerScale,     { toValue: 1,       duration: 500,          easing: ease, useNativeDriver: true }),
            Animated.timing(centerScoreAnim, { toValue: fitScore, duration: centerCountDur, easing: ease, useNativeDriver: false }),
          ]).start(() => {
            // After center count settles — fade in color overlay if all same zone
            if (allSameColor) {
              Animated.timing(colorOverlayOpacity, {
                toValue: 1,
                duration: 600,
                easing: ease,
                useNativeDriver: true,
              }).start();
            }
          });
        });
      });
    });

    return () => {
      nutritionScoreAnim.removeListener(subN);
      trainingScoreAnim.removeListener(subT);
      recoveryScoreAnim.removeListener(subR);
      centerScoreAnim.removeListener(subC);
    };
  }, [animate]);

  // ── Geometry ─────────────────────────────────────────────────────────────────
  const triangleHeight = size * 0.866;
  const W = size;
  const H = triangleHeight;

  const tv  = { x: W / 2, y: 0 };
  const blv = { x: 0,     y: H };
  const brv = { x: W,     y: H };
  const ml  = { x: (tv.x + blv.x) / 2, y: (tv.y + blv.y) / 2 };
  const mr  = { x: (tv.x + brv.x) / 2, y: (tv.y + brv.y) / 2 };
  const mb  = { x: (blv.x + brv.x) / 2, y: (blv.y + brv.y) / 2 };

  const pTop = `M ${tv.x}  ${tv.y}  L ${ml.x} ${ml.y} L ${mr.x} ${mr.y} Z`;
  const pBL  = `M ${blv.x} ${blv.y} L ${ml.x} ${ml.y} L ${mb.x} ${mb.y} Z`;
  const pBR  = `M ${brv.x} ${brv.y} L ${mr.x} ${mr.y} L ${mb.x} ${mb.y} Z`;
  const pCtr = `M ${ml.x}  ${ml.y}  L ${mr.x} ${mr.y} L ${mb.x} ${mb.y} Z`;

  const cTop = { x: (tv.x  + ml.x + mr.x) / 3, y: (tv.y  + ml.y + mr.y) / 3 + 4 };
  const cBL  = { x: (blv.x + ml.x + mb.x) / 3, y: (blv.y + ml.y + mb.y) / 3 - 4 };
  const cBR  = { x: (brv.x + mr.x + mb.x) / 3, y: (brv.y + mr.y + mb.y) / 3 - 4 };
  const cCtr = { x: (ml.x  + mr.x + mb.x) / 3, y: (ml.y  + mr.y + mb.y) / 3 };

  // ── Typography hierarchy ─────────────────────────────────────────────────────
  const centerScoreFontSize = size / 6;
  const centerLabelFontSize = size / 22;
  const scoreFontSize       = size / 11;
  const labelFontSize       = size / 20;

  // ── Triangle renderer ─────────────────────────────────────────────────────────
  const renderPillar = (
    gradId:       string,
    path:         string,
    mainColor:    string,
    lightColor:   string,
    gradDir:      { x1: string; y1: string; x2: string; y2: string },
    centroid:     { x: number; y: number },
    displayValue: number,
    label:        string,
    opacityAnim:  Animated.Value,
    scaleAnim:    Animated.Value,
    isWeakest:    boolean,
    isStrongest:  boolean,
    showDecimal:  boolean = false,
  ) => (
    <Animated.View
      key={gradId}
      style={[
        StyleSheet.absoluteFill,
        { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id={gradId} x1={gradDir.x1} y1={gradDir.y1} x2={gradDir.x2} y2={gradDir.y2}>
            <Stop offset="0"   stopColor={lightColor} stopOpacity="1" />
            <Stop offset="1"   stopColor={mainColor}  stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Path d={path} fill={`url(#${gradId})`} />
        <SvgText
          x={centroid.x} y={centroid.y}
          fill="#FFFFFF"
          fontSize={scoreFontSize}
          fontWeight="700"
          textAnchor="middle"
          alignmentBaseline="middle"
          opacity={scoreOpacity}
        >
          {showDecimal ? displayValue.toFixed(1) : Math.round(displayValue)}
        </SvgText>
        <SvgText
          x={centroid.x} y={centroid.y + scoreFontSize * 0.85}
          fill="#FFFFFF"
          fontSize={labelFontSize}
          fontWeight="400"
          textAnchor="middle"
          alignmentBaseline="middle"
          opacity={labelOpacity}
        >
          {label}
        </SvgText>
      </Svg>
    </Animated.View>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { width: size, height: triangleHeight }]}>

      {/* Nutrition — gradient: apex (bottom-left) → inner junction */}
      {renderPillar('ng', pBL, c.nutrition, light.nutrition,
        { x1: '0', y1: '1', x2: '0.75', y2: '0' },
        cBL, displayNutrition, 'Nutrition',
        blOpacity, blScale,
        weakestPillar === 'nutrition', strongestPillar === 'nutrition',
        /* showDecimal — integer only when exactly 1 meal (matches single meal card) */
        nutritionCount !== undefined && nutritionCount !== 1,
      )}

      {/* Training — gradient: apex (bottom-right) → inner junction */}
      {renderPillar('tg', pBR, c.training, light.training,
        { x1: '1', y1: '1', x2: '0.25', y2: '0' },
        cBR, displayTraining, 'Training',
        brOpacity, brScale,
        weakestPillar === 'training', strongestPillar === 'training',
        /* showDecimal — integer only when exactly 1 session (matches training card); 0 sessions = system score, show decimal */
        trainingCount !== undefined && trainingCount !== 1,
      )}

      {/* Recovery — gradient: apex (top) → inner junction */}
      {renderPillar('rg', pTop, c.recovery, light.recovery,
        { x1: '0.5', y1: '0', x2: '0.5', y2: '1' },
        cTop, displayRecovery, 'Recovery',
        topOpacity, topScale,
        weakestPillar === 'recovery', strongestPillar === 'recovery',
        /* showDecimal */ true,
      )}

      {/* ── Center — FitScore (dominant) ─────────────────────────────────────── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: centerOpacity, transform: [{ scale: centerScale }] }]}
      >
        {/* Layer 1: Always-dark base — establishes the premium center feel */}
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <LinearGradient id="cg-dark" x1="0.5" y1="0" x2="0.5" y2="1">
              <Stop offset="0"   stopColor="#060b14"            stopOpacity="1" />
              <Stop offset="1"   stopColor={colors.bgSecondary} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Path d={pCtr} fill="url(#cg-dark)" />
        </Svg>

        {/* Layer 2: Color overlay — fades in after count settles (only if all same zone) */}
        {allSameColor && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: colorOverlayOpacity }]}>
            <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              <Defs>
                <LinearGradient id="cg-color" x1="0.5" y1="0" x2="0.5" y2="1">
                  <Stop offset="0"   stopColor={light.recovery} stopOpacity="1" />
                  <Stop offset="1"   stopColor={c.recovery}     stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Path d={pCtr} fill="url(#cg-color)" />
            </Svg>
          </Animated.View>
        )}

        {/* Layer 3: Text — two sublayers cross-fade when same-color overlay appears */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* 3a: Original — accent number + muted label (fades out as overlay arrives) */}
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: allSameColor ? invertedOverlayOpacity : 1 }]}
          >
            <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              <SvgText
                x={cCtr.x}
                y={cCtr.y - centerLabelFontSize * 0.6}
                fill={colors.accent}
                fontSize={centerScoreFontSize}
                fontWeight="bold"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {displayScore.toFixed(1)}
              </SvgText>
              <SvgText
                x={cCtr.x}
                y={cCtr.y + centerScoreFontSize * 0.54}
                fill={colors.textMuted}
                fontSize={centerLabelFontSize}
                fontWeight="500"
                textAnchor="middle"
                alignmentBaseline="middle"
                opacity={0.7}
              >
                FitScore
              </SvgText>
            </Svg>
          </Animated.View>

          {/* 3b: White text — fades in together with the color overlay for readability */}
          {allSameColor && (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: colorOverlayOpacity }]}>
              <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                <SvgText
                  x={cCtr.x}
                  y={cCtr.y - centerLabelFontSize * 0.6}
                  fill="#FFFFFF"
                  fontSize={centerScoreFontSize}
                  fontWeight="bold"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                >
                  {displayScore.toFixed(1)}
                </SvgText>
                <SvgText
                  x={cCtr.x}
                  y={cCtr.y + centerScoreFontSize * 0.54}
                  fill="#FFFFFF"
                  fontSize={centerLabelFontSize}
                  fontWeight="500"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  opacity={0.85}
                >
                  FitScore
                </SvgText>
              </Svg>
            </Animated.View>
          )}
        </View>
      </Animated.View>

      {/* ── Division lines — card surface colour so seams feel native to the box ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <Path
            d={`M ${ml.x} ${ml.y} L ${mr.x} ${mr.y} M ${ml.x} ${ml.y} L ${mb.x} ${mb.y} M ${mr.x} ${mr.y} L ${mb.x} ${mb.y}`}
            fill="none"
            stroke={colors.bgSecondary}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </Svg>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 32,
    elevation: 16,
  },
});
