/**
 * FitScoreTriangle - SVG-based equilateral triangle breakdown
 *
 * Displays the FitScore breakdown as 4 triangles:
 * - Top (Recovery): pointing up
 * - Bottom-left (Nutrition): pointing up
 * - Bottom-right (Training): pointing up
 * - Center (FitScore): inverted, dark background
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Text as SvgText, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '../theme';

interface FitScoreTriangleProps {
  recoveryScore: number;
  nutritionScore: number;
  trainingScore: number;
  fitScore: number;
  size?: number;
  colors?: {
    recovery: string;
    nutrition: string;
    training: string;
    center: string;
  };
}

// Zone color helper
const getZoneColor = (score: number): string => {
  if (score >= 8) return colors.success;
  if (score >= 4) return colors.warning;
  return colors.danger;
};

// Lighten color for gradient effect
const lightenColor = (hex: string, percent: number): string => {
  // Remove # if present
  const cleanHex = hex.replace('#', '');

  // Parse RGB values
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Lighten each component
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
  colors: customColors,
}: FitScoreTriangleProps) {
  // Calculate dimensions for equilateral triangle
  // For equilateral triangle: height = (√3/2) * base ≈ 0.866 * base
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

  // Triangle paths (using Path d attribute)
  // Top triangle (Recovery): topVertex -> midLeft -> midRight
  const topTrianglePath = `M ${topVertex.x} ${topVertex.y} L ${midLeft.x} ${midLeft.y} L ${midRight.x} ${midRight.y} Z`;

  // Bottom-left triangle (Nutrition): bottomLeftVertex -> midLeft -> midBottom
  const bottomLeftTrianglePath = `M ${bottomLeftVertex.x} ${bottomLeftVertex.y} L ${midLeft.x} ${midLeft.y} L ${midBottom.x} ${midBottom.y} Z`;

  // Bottom-right triangle (Training): bottomRightVertex -> midRight -> midBottom
  const bottomRightTrianglePath = `M ${bottomRightVertex.x} ${bottomRightVertex.y} L ${midRight.x} ${midRight.y} L ${midBottom.x} ${midBottom.y} Z`;

  // Center triangle (FitScore): midLeft -> midRight -> midBottom (inverted)
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

  // Gradient colors (lighter versions for modern fade effect)
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

  // White color for corner text
  const cornerTextColor = '#FFFFFF';

  return (
    <View style={styles.container}>
      <Svg
        width={size}
        height={triangleHeight}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      >
        {/* Gradient Definitions */}
        <Defs>
          {/* Recovery gradient - top triangle */}
          <LinearGradient id="recoveryGradient" x1="0.5" y1="0" x2="0.5" y2="1">
            <Stop offset="0" stopColor={gradientColors.recoveryLight} stopOpacity="1" />
            <Stop offset="0.7" stopColor={triangleColors.recovery} stopOpacity="1" />
            <Stop offset="1" stopColor={triangleColors.recovery} stopOpacity="0.9" />
          </LinearGradient>

          {/* Nutrition gradient - bottom-left triangle */}
          <LinearGradient id="nutritionGradient" x1="0" y1="1" x2="0.8" y2="0">
            <Stop offset="0" stopColor={gradientColors.nutritionLight} stopOpacity="1" />
            <Stop offset="0.7" stopColor={triangleColors.nutrition} stopOpacity="1" />
            <Stop offset="1" stopColor={triangleColors.nutrition} stopOpacity="0.9" />
          </LinearGradient>

          {/* Training gradient - bottom-right triangle */}
          <LinearGradient id="trainingGradient" x1="1" y1="1" x2="0.2" y2="0">
            <Stop offset="0" stopColor={gradientColors.trainingLight} stopOpacity="1" />
            <Stop offset="0.7" stopColor={triangleColors.training} stopOpacity="1" />
            <Stop offset="1" stopColor={triangleColors.training} stopOpacity="0.9" />
          </LinearGradient>
        </Defs>

        {/* Recovery Triangle (Top) - with gradient */}
        <Path
          d={topTrianglePath}
          fill="url(#recoveryGradient)"
        />
        <G>
          <SvgText
            x={topCentroid.x}
            y={topCentroid.y}
            fill={cornerTextColor}
            fontSize={scoreFontSize}
            fontWeight="bold"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {recoveryScore.toFixed(1)}
          </SvgText>
          <SvgText
            x={topCentroid.x}
            y={topCentroid.y + scoreFontSize * 0.8}
            fill={cornerTextColor}
            fontSize={labelFontSize}
            fontWeight="600"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            Recovery
          </SvgText>
        </G>

        {/* Nutrition Triangle (Bottom-Left) - with gradient */}
        <Path
          d={bottomLeftTrianglePath}
          fill="url(#nutritionGradient)"
        />
        <G>
          <SvgText
            x={bottomLeftCentroid.x}
            y={bottomLeftCentroid.y}
            fill={cornerTextColor}
            fontSize={scoreFontSize}
            fontWeight="bold"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {nutritionScore.toFixed(1)}
          </SvgText>
          <SvgText
            x={bottomLeftCentroid.x}
            y={bottomLeftCentroid.y + scoreFontSize * 0.8}
            fill={cornerTextColor}
            fontSize={labelFontSize}
            fontWeight="600"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            Nutrition
          </SvgText>
        </G>

        {/* Training Triangle (Bottom-Right) - with gradient */}
        <Path
          d={bottomRightTrianglePath}
          fill="url(#trainingGradient)"
        />
        <G>
          <SvgText
            x={bottomRightCentroid.x}
            y={bottomRightCentroid.y}
            fill={cornerTextColor}
            fontSize={scoreFontSize}
            fontWeight="bold"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {trainingScore.toFixed(1)}
          </SvgText>
          <SvgText
            x={bottomRightCentroid.x}
            y={bottomRightCentroid.y + scoreFontSize * 0.8}
            fill={cornerTextColor}
            fontSize={labelFontSize}
            fontWeight="600"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            Training
          </SvgText>
        </G>

        {/* Center Triangle (FitScore - Inverted) - solid color */}
        <Path
          d={centerTrianglePath}
          fill={triangleColors.center}
        />
        <G>
          <SvgText
            x={centerCentroid.x}
            y={centerCentroid.y - centerLabelFontSize * 0.3}
            fill={colors.accent}
            fontSize={centerScoreFontSize}
            fontWeight="bold"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {fitScore.toFixed(1)}
          </SvgText>
          <SvgText
            x={centerCentroid.x}
            y={centerCentroid.y + centerScoreFontSize * 0.6}
            fill={colors.textMuted}
            fontSize={centerLabelFontSize}
            fontWeight="600"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            FitScore
          </SvgText>
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
