/**
 * FitScoreTriangle — Premium performance engine visualization
 *
 * Design principles:
 *  - Brand colors preserved exactly (no desaturation of zone colors)
 *  - Directional gradients: each pillar flows from outer vertex toward center
 *  - Crisp dark division lines create intentional structure
 *  - Center dominates via size contrast and deep background
 *  - Weakest pillar de-emphasised via opacity, not color mutation
 *  - Subtle accent glow halos behind center score (intentional, not decorative)
 *
 * Animations:
 *  - Outer segments materialise staggered (opacity + scale) — 560ms, easeOut
 *  - Center expands last with stronger punch
 *  - Center FitScore counts up from 0 → value
 *  - Strongest pillar breathes with a soft glow loop after reveal
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
  if (score >= 4) return colors.warning;
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
  colors: customColors,
}: FitScoreTriangleProps) {
  // Dynamic emphasis — pure opacity contrast, no color mutation
  const pillarScores = { recovery: recoveryScore, nutrition: nutritionScore, training: trainingScore };
  const entries = Object.entries(pillarScores) as [string, number][];
  const strongestPillar = entries.reduce((a, b) => (a[1] > b[1] ? a : b))[0];
  const weakestPillar   = entries.reduce((a, b) => (a[1] < b[1] ? a : b))[0];

  // ── Opacity constants (defined early — used in initial animated values) ──────
  const weakLayerOpacity   = 0.65;
  const weakScoreOpacity   = 0.6;
  const weakLabelOpacity   = 0.35;
  const normalScoreOpacity = 0.88;
  const normalLabelOpacity = 0.55;

  // ── Animation values ────────────────────────────────────────────────────────
  // Each layer animates to its final opacity (weakest stops at weakLayerOpacity)
  const topFinal = weakestPillar === 'recovery' ? weakLayerOpacity : 1;
  const blFinal  = weakestPillar === 'nutrition' ? weakLayerOpacity : 1;
  const brFinal  = weakestPillar === 'training'  ? weakLayerOpacity : 1;

  const topOpacity    = useRef(new Animated.Value(animate ? 0 : topFinal)).current;
  const topScale      = useRef(new Animated.Value(animate ? 0.93 : 1)).current;
  const blOpacity     = useRef(new Animated.Value(animate ? 0 : blFinal)).current;
  const blScale       = useRef(new Animated.Value(animate ? 0.93 : 1)).current;
  const brOpacity     = useRef(new Animated.Value(animate ? 0 : brFinal)).current;
  const brScale       = useRef(new Animated.Value(animate ? 0.93 : 1)).current;
  const centerOpacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const centerScale   = useRef(new Animated.Value(animate ? 0.86 : 1)).current;

  // Count-up state for center score
  const [displayScore, setDisplayScore] = useState(animate ? 0 : fitScore);
  const countTimerRef = useRef<ReturnType<typeof setInterval>>();
  const countStartRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!animate) {
      setDisplayScore(fitScore);
      return;
    }

    const ease = Easing.out(Easing.quad);
    const dur  = 560;

    // Stage 1: outer triangles materialise staggered, center last
    Animated.parallel([
      Animated.timing(topOpacity,    { toValue: topFinal, duration: dur,          easing: ease, useNativeDriver: true }),
      Animated.timing(topScale,      { toValue: 1,        duration: dur,          easing: ease, useNativeDriver: true }),
      Animated.timing(blOpacity,     { toValue: blFinal,  duration: dur, delay: 140, easing: ease, useNativeDriver: true }),
      Animated.timing(blScale,       { toValue: 1,        duration: dur, delay: 140, easing: ease, useNativeDriver: true }),
      Animated.timing(brOpacity,     { toValue: brFinal,  duration: dur, delay: 280, easing: ease, useNativeDriver: true }),
      Animated.timing(brScale,       { toValue: 1,        duration: dur, delay: 280, easing: ease, useNativeDriver: true }),
      Animated.timing(centerOpacity, { toValue: 1, duration: 480, delay: 520, easing: ease, useNativeDriver: true }),
      Animated.timing(centerScale,   { toValue: 1, duration: 480, delay: 520, easing: ease, useNativeDriver: true }),
    ]).start();

    // Stage 2: score count-up (starts when center appears)
    countStartRef.current = setTimeout(() => {
      let current = 0;
      const steps  = 28;
      const stepMs = 850 / steps;
      countTimerRef.current = setInterval(() => {
        current += fitScore / steps;
        if (current >= fitScore) {
          setDisplayScore(fitScore);
          clearInterval(countTimerRef.current);
        } else {
          setDisplayScore(Math.round(current * 10) / 10);
        }
      }, stepMs);
    }, 680);

    return () => {
      clearTimeout(countStartRef.current);
      clearInterval(countTimerRef.current);
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

  // ── Colours — brand colors preserved, no desaturation ────────────────────────
  const c = {
    recovery: customColors?.recovery || getZoneColor(recoveryScore),
    nutrition: customColors?.nutrition || getZoneColor(nutritionScore),
    training:  customColors?.training  || getZoneColor(trainingScore),
  };

  // Subtle lighter tint for outer apex — stays within color family (not bleached)
  const light = {
    recovery: lightenColor(c.recovery,  0.18),
    nutrition: lightenColor(c.nutrition, 0.18),
    training:  lightenColor(c.training,  0.18),
  };

  // ── Typography hierarchy ─────────────────────────────────────────────────────
  const centerScoreFontSize = size / 5;     // Dominant — visually anchors the whole piece
  const centerLabelFontSize = size / 23;    // Small, subordinate
  const scoreFontSize       = size / 13;    // Outer scores — clearly secondary
  const labelFontSize       = size / 22;    // Outer labels — tertiary

  // ── Triangle renderer ─────────────────────────────────────────────────────────
  // gradX1/Y1 = direction start (the outer apex = brighter)
  // gradX2/Y2 = direction end (inner junction = darker)
  const renderPillar = (
    gradId:      string,
    path:        string,
    mainColor:   string,
    lightColor:  string,
    gradDir:     { x1: string; y1: string; x2: string; y2: string },
    centroid:    { x: number; y: number },
    score:       number,
    label:       string,
    opacityAnim: Animated.Value,
    scaleAnim:   Animated.Value,
    isWeakest:   boolean,
    isStrongest: boolean,
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
            {/* Outer apex = subtle highlight — fully opaque, stays in color family */}
            <Stop offset="0"   stopColor={lightColor} stopOpacity="1" />
            {/* Inner junction = full base color — no transparency */}
            <Stop offset="1"   stopColor={mainColor}  stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* Main triangle fill */}
        <Path d={path} fill={`url(#${gradId})`} />

        {/* Score number — secondary to center */}
        <SvgText
          x={centroid.x} y={centroid.y}
          fill="#FFFFFF"
          fontSize={scoreFontSize}
          fontWeight="700"
          textAnchor="middle"
          alignmentBaseline="middle"
          opacity={isWeakest ? weakScoreOpacity : normalScoreOpacity}
        >
          {score.toFixed(1)}
        </SvgText>

        {/* Pillar label — clearly tertiary */}
        <SvgText
          x={centroid.x} y={centroid.y + scoreFontSize * 0.85}
          fill="#FFFFFF"
          fontSize={labelFontSize}
          fontWeight="400"
          textAnchor="middle"
          alignmentBaseline="middle"
          opacity={isWeakest ? weakLabelOpacity : normalLabelOpacity}
        >
          {label}
        </SvgText>
      </Svg>

    </Animated.View>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { width: size, height: triangleHeight }]}>

      {/* Recovery — gradient: apex (top) → inner junction */}
      {renderPillar('rg', pTop, c.recovery, light.recovery,
        { x1: '0.5', y1: '0', x2: '0.5', y2: '1' },
        cTop, recoveryScore, 'Recovery',
        topOpacity, topScale,
        weakestPillar === 'recovery', strongestPillar === 'recovery',
      )}

      {/* Nutrition — gradient: apex (bottom-left) → inner junction */}
      {renderPillar('ng', pBL, c.nutrition, light.nutrition,
        { x1: '0', y1: '1', x2: '0.75', y2: '0' },
        cBL, nutritionScore, 'Nutrition',
        blOpacity, blScale,
        weakestPillar === 'nutrition', strongestPillar === 'nutrition',
      )}

      {/* Training — gradient: apex (bottom-right) → inner junction */}
      {renderPillar('tg', pBR, c.training, light.training,
        { x1: '1', y1: '1', x2: '0.25', y2: '0' },
        cBR, trainingScore, 'Training',
        brOpacity, brScale,
        weakestPillar === 'training', strongestPillar === 'training',
      )}

      {/* ── Center — FitScore (dominant) ─────────────────────────────────────── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: centerOpacity, transform: [{ scale: centerScale }] }]}
      >
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            {/* Very dark center — creates maximum contrast against outer pillars */}
            <LinearGradient id="cg" x1="0.5" y1="0" x2="0.5" y2="1">
              <Stop offset="0"   stopColor="#060b14" stopOpacity="1" />
              <Stop offset="1"   stopColor={colors.bgSecondary} stopOpacity="1" />
            </LinearGradient>
          </Defs>

          {/* Dark fill */}
          <Path d={pCtr} fill="url(#cg)" />

          {/* FitScore number — the dominant element */}
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

          {/* "FitScore" label — small, muted, subordinate */}
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

      {/* ── Division lines — crisp dark borders make structure legible ────────── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* The three internal edges of the center inverted triangle */}
          <Path
            d={`M ${ml.x} ${ml.y} L ${mr.x} ${mr.y} M ${ml.x} ${ml.y} L ${mb.x} ${mb.y} M ${mr.x} ${mr.y} L ${mb.x} ${mb.y}`}
            fill="none"
            stroke="#060b14"
            strokeWidth={2.5}
            strokeOpacity={0.9}
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
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
});
