/**
 * FitScoreTriangle - SVG-based equilateral triangle breakdown
 *
 * Displays the FitScore breakdown as 4 triangles:
 * - Top (Recovery): pointing up
 * - Bottom-left (Nutrition): pointing up
 * - Bottom-right (Training): pointing up
 * - Center (FitScore): inverted, dark background
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import Svg, { Path, Text as SvgText, G, Defs, LinearGradient, Stop } from 'react-native-svg';
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

// Zone color helper
const getZoneColor = (score: number): string => {
  if (score >= 7) return colors.success;
  if (score >= 4) return colors.warning;
  return colors.danger;
};

// Lighten color for gradient effect
const lightenColor = (hex: string, percent: number): string => {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const newR = Math.min(255, Math.round(r + (255 - r) * percent));
  const newG = Math.min(255, Math.round(g + (255 - g) * percent));
  const newB = Math.min(255, Math.round(b + (255 - b) * percent));
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
};

export default function FitScoreTriangle({
  recoveryScore,
  nutritionScore,
  trainingScore,
  fitScore,
  size = 280,
  animate = false,
  colors: customColors,
}: FitScoreTriangleProps) {
  // Animation values for sequential reveal
  const topOpacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const bottomLeftOpacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const bottomRightOpacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const centerOpacity = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (animate) {
      // Sequential reveal: top -> bottom-left -> bottom-right -> center
      const delay = 400;
      const duration = 500;

      Animated.sequence([
        Animated.timing(topOpacity, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(bottomLeftOpacity, {
          toValue: 1,
          duration,
          delay: 100,
          useNativeDriver: true,
        }),
        Animated.timing(bottomRightOpacity, {
          toValue: 1,
          duration,
          delay: 100,
          useNativeDriver: true,
        }),
        Animated.timing(centerOpacity, {
          toValue: 1,
          duration: 600,
          delay: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animate]);

  // Calculate dimensions for equilateral triangle
  const triangleHeight = size * 0.866;
  const viewBoxWidth = size;
  const viewBoxHeight = triangleHeight;

  // Main triangle vertices
  const topVertex = { x: viewBoxWidth / 2, y: 0 };
  const bottomLeftVertex = { x: 0, y: viewBoxHeight };
  const bottomRightVertex = { x: viewBoxWidth, y: viewBoxHeight };

  // Midpoints of each edge
  const midLeft = {
    x: (topVertex.x + bottomLeftVertex.x) / 2,
    y: (topVertex.y + bottomLeftVertex.y) / 2
  };
  const midRight = {
    x: (topVertex.x + bottomRightVertex.x) / 2,
    y: (topVertex.y + bottomRightVertex.y) / 2
  };
  const midBottom = {
    x: (bottomLeftVertex.x + bottomRightVertex.x) / 2,
    y: (bottomLeftVertex.y + bottomRightVertex.y) / 2
  };

  // Triangle paths
  const topTrianglePath = `M ${topVertex.x} ${topVertex.y} L ${midLeft.x} ${midLeft.y} L ${midRight.x} ${midRight.y} Z`;
  const bottomLeftTrianglePath = `M ${bottomLeftVertex.x} ${bottomLeftVertex.y} L ${midLeft.x} ${midLeft.y} L ${midBottom.x} ${midBottom.y} Z`;
  const bottomRightTrianglePath = `M ${bottomRightVertex.x} ${bottomRightVertex.y} L ${midRight.x} ${midRight.y} L ${midBottom.x} ${midBottom.y} Z`;
  const centerTrianglePath = `M ${midLeft.x} ${midLeft.y} L ${midRight.x} ${midRight.y} L ${midBottom.x} ${midBottom.y} Z`;

  // Calculate centroids for text positioning
  const topCentroid = {
    x: (topVertex.x + midLeft.x + midRight.x) / 3,
    y: (topVertex.y + midLeft.y + midRight.y) / 3 + 5,
  };
  const bottomLeftCentroid = {
    x: (bottomLeftVertex.x + midLeft.x + midBottom.x) / 3,
    y: (bottomLeftVertex.y + midLeft.y + midBottom.y) / 3 - 5,
  };
  const bottomRightCentroid = {
    x: (bottomRightVertex.x + midRight.x + midBottom.x) / 3,
    y: (bottomRightVertex.y + midRight.y + midBottom.y) / 3 - 5,
  };
  const centerCentroid = {
    x: (midLeft.x + midRight.x + midBottom.x) / 3,
    y: (midLeft.y + midRight.y + midBottom.y) / 3,
  };

  // Determine colors
  const triangleColors = {
    recovery: customColors?.recovery || getZoneColor(recoveryScore),
    nutrition: customColors?.nutrition || getZoneColor(nutritionScore),
    training: customColors?.training || getZoneColor(trainingScore),
    center: customColors?.center || colors.bgSecondary,
  };

  // Gradient colors
  const gradientColors = {
    recoveryLight: lightenColor(triangleColors.recovery, 0.25),
    nutritionLight: lightenColor(triangleColors.nutrition, 0.25),
    trainingLight: lightenColor(triangleColors.training, 0.25),
  };

  // Text styling
  const scoreFontSize = size / 10;
  const labelFontSize = size / 18;
  const centerScoreFontSize = size / 8;
  const centerLabelFontSize = size / 20;
  const cornerTextColor = '#FFFFFF';

  // Each triangle section rendered as an Animated.View overlay for opacity control
  return (
    <View style={[styles.container, { width: size, height: triangleHeight }]}>
      {/* Shared SVG for gradients only */}
      <Svg
        width={size}
        height={triangleHeight}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient id="recoveryGradient" x1="0.5" y1="0" x2="0.5" y2="1">
            <Stop offset="0" stopColor={gradientColors.recoveryLight} stopOpacity="1" />
            <Stop offset="0.7" stopColor={triangleColors.recovery} stopOpacity="1" />
            <Stop offset="1" stopColor={triangleColors.recovery} stopOpacity="0.9" />
          </LinearGradient>
          <LinearGradient id="nutritionGradient" x1="0" y1="1" x2="0.8" y2="0">
            <Stop offset="0" stopColor={gradientColors.nutritionLight} stopOpacity="1" />
            <Stop offset="0.7" stopColor={triangleColors.nutrition} stopOpacity="1" />
            <Stop offset="1" stopColor={triangleColors.nutrition} stopOpacity="0.9" />
          </LinearGradient>
          <LinearGradient id="trainingGradient" x1="1" y1="1" x2="0.2" y2="0">
            <Stop offset="0" stopColor={gradientColors.trainingLight} stopOpacity="1" />
            <Stop offset="0.7" stopColor={triangleColors.training} stopOpacity="1" />
            <Stop offset="1" stopColor={triangleColors.training} stopOpacity="0.9" />
          </LinearGradient>
        </Defs>
      </Svg>

      {/* Recovery Triangle (Top) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: topOpacity }]}>
        <Svg width={size} height={triangleHeight} viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}>
          <Defs>
            <LinearGradient id="rg" x1="0.5" y1="0" x2="0.5" y2="1">
              <Stop offset="0" stopColor={gradientColors.recoveryLight} stopOpacity="1" />
              <Stop offset="0.7" stopColor={triangleColors.recovery} stopOpacity="1" />
              <Stop offset="1" stopColor={triangleColors.recovery} stopOpacity="0.9" />
            </LinearGradient>
          </Defs>
          <Path d={topTrianglePath} fill="url(#rg)" />
          <SvgText x={topCentroid.x} y={topCentroid.y} fill={cornerTextColor} fontSize={scoreFontSize} fontWeight="bold" textAnchor="middle" alignmentBaseline="middle">
            {recoveryScore.toFixed(1)}
          </SvgText>
          <SvgText x={topCentroid.x} y={topCentroid.y + scoreFontSize * 0.8} fill={cornerTextColor} fontSize={labelFontSize} fontWeight="600" textAnchor="middle" alignmentBaseline="middle">
            Recovery
          </SvgText>
        </Svg>
      </Animated.View>

      {/* Nutrition Triangle (Bottom-Left) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: bottomLeftOpacity }]}>
        <Svg width={size} height={triangleHeight} viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}>
          <Defs>
            <LinearGradient id="ng" x1="0" y1="1" x2="0.8" y2="0">
              <Stop offset="0" stopColor={gradientColors.nutritionLight} stopOpacity="1" />
              <Stop offset="0.7" stopColor={triangleColors.nutrition} stopOpacity="1" />
              <Stop offset="1" stopColor={triangleColors.nutrition} stopOpacity="0.9" />
            </LinearGradient>
          </Defs>
          <Path d={bottomLeftTrianglePath} fill="url(#ng)" />
          <SvgText x={bottomLeftCentroid.x} y={bottomLeftCentroid.y} fill={cornerTextColor} fontSize={scoreFontSize} fontWeight="bold" textAnchor="middle" alignmentBaseline="middle">
            {nutritionScore.toFixed(1)}
          </SvgText>
          <SvgText x={bottomLeftCentroid.x} y={bottomLeftCentroid.y + scoreFontSize * 0.8} fill={cornerTextColor} fontSize={labelFontSize} fontWeight="600" textAnchor="middle" alignmentBaseline="middle">
            Nutrition
          </SvgText>
        </Svg>
      </Animated.View>

      {/* Training Triangle (Bottom-Right) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: bottomRightOpacity }]}>
        <Svg width={size} height={triangleHeight} viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}>
          <Defs>
            <LinearGradient id="tg" x1="1" y1="1" x2="0.2" y2="0">
              <Stop offset="0" stopColor={gradientColors.trainingLight} stopOpacity="1" />
              <Stop offset="0.7" stopColor={triangleColors.training} stopOpacity="1" />
              <Stop offset="1" stopColor={triangleColors.training} stopOpacity="0.9" />
            </LinearGradient>
          </Defs>
          <Path d={bottomRightTrianglePath} fill="url(#tg)" />
          <SvgText x={bottomRightCentroid.x} y={bottomRightCentroid.y} fill={cornerTextColor} fontSize={scoreFontSize} fontWeight="bold" textAnchor="middle" alignmentBaseline="middle">
            {trainingScore.toFixed(1)}
          </SvgText>
          <SvgText x={bottomRightCentroid.x} y={bottomRightCentroid.y + scoreFontSize * 0.8} fill={cornerTextColor} fontSize={labelFontSize} fontWeight="600" textAnchor="middle" alignmentBaseline="middle">
            Training
          </SvgText>
        </Svg>
      </Animated.View>

      {/* Center Triangle (FitScore) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: centerOpacity }]}>
        <Svg width={size} height={triangleHeight} viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}>
          <Path d={centerTrianglePath} fill={triangleColors.center} />
          <SvgText x={centerCentroid.x} y={centerCentroid.y - centerLabelFontSize * 0.3} fill={colors.accent} fontSize={centerScoreFontSize} fontWeight="bold" textAnchor="middle" alignmentBaseline="middle">
            {fitScore.toFixed(1)}
          </SvgText>
          <SvgText x={centerCentroid.x} y={centerCentroid.y + centerScoreFontSize * 0.6} fill={colors.textMuted} fontSize={centerLabelFontSize} fontWeight="600" textAnchor="middle" alignmentBaseline="middle">
            FitScore
          </SvgText>
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
