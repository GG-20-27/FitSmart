/**
 * Divider Component - Subtle separator line
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing } from '../../theme';

interface DividerProps {
  style?: ViewStyle;
  vertical?: boolean;
}

export function Divider({ style, vertical = false }: DividerProps) {
  return (
    <View
      style={[
        styles.divider,
        vertical ? styles.vertical : styles.horizontal,
        style
      ]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: colors.surfaceMute + '66', // 40% opacity
  },
  horizontal: {
    height: 1,
    marginVertical: spacing.md,
  },
  vertical: {
    width: 1,
    marginHorizontal: spacing.md,
  },
});
