import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing, typography } from '../theme';

export default function FitLookScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>FitLook</Text>
      <Text style={styles.subtitle}>Visual meal analysis and recommendations</Text>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Coming soon</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  header: typography.h2,
  subtitle: {
    ...typography.bodyMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  placeholder: {
    padding: spacing.xl,
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  placeholderText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
