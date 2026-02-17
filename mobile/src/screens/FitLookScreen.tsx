import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii, shadows } from '../theme';
import { getFitLookToday, type FitLookResponse } from '../api/fitlook';

const readinessColors: Record<string, string> = {
  Green: colors.success,
  Yellow: colors.warning,
  Red: colors.danger,
};

export default function FitLookScreen() {
  const [fitlook, setFitlook] = useState<FitLookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadFitLook();
  }, []);

  async function loadFitLook() {
    setLoading(true);
    setError(null);
    fadeAnim.setValue(0);
    try {
      const data = await getFitLookToday();
      setFitlook(data);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load FitLook');
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Preparing your morning outlook...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.surfaceMute} />
        <Text style={styles.errorText}>Couldn't load your outlook</Text>
        <Text style={styles.errorDetail}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadFitLook}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!fitlook) return null;

  const tagColor = readinessColors[fitlook.readiness_tag] || colors.warning;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <Text style={styles.header}>FitLook</Text>
      <Text style={styles.subtitle}>Today's Outlook</Text>
      <Text style={styles.dateText}>{formatDate(fitlook.date_local)}</Text>

      <Animated.View style={{ opacity: fadeAnim }}>
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroText}>{fitlook.hero_text}</Text>
        </View>

        {/* Readiness Chip */}
        <View style={styles.readinessRow}>
          <View style={[styles.readinessDot, { backgroundColor: tagColor }]} />
          <Text style={[styles.readinessTag, { color: tagColor }]}>
            {fitlook.readiness_tag}
          </Text>
          <Text style={styles.readinessLine}>{fitlook.readiness_line}</Text>
        </View>

        {/* Today's Focus */}
        <View style={styles.focusCard}>
          <View style={[styles.focusAccent, { backgroundColor: tagColor }]} />
          <View style={styles.focusContent}>
            <Text style={styles.focusLabel}>TODAY'S FOCUS</Text>
            <Text style={styles.focusText}>{fitlook.todays_focus}</Text>
          </View>
        </View>

        {/* Momentum Line */}
        {fitlook.momentum_line ? (
          <View style={styles.momentumRow}>
            <Ionicons name="trending-up" size={16} color={colors.accent} />
            <Text style={styles.momentumText}>{fitlook.momentum_line}</Text>
          </View>
        ) : null}

        {/* CTA Buttons */}
        <View style={styles.ctaRow}>
          <TouchableOpacity style={styles.ctaPrimary} activeOpacity={0.8}>
            <Text style={styles.ctaPrimaryText}>{fitlook.cta_primary}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctaSecondary} activeOpacity={0.8}>
            <Text style={styles.ctaSecondaryText}>{fitlook.cta_secondary}</Text>
          </TouchableOpacity>
        </View>

        {/* Cached indicator */}
        {fitlook.cached && (
          <Text style={styles.cachedHint}>Generated earlier today</Text>
        )}
      </Animated.View>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  errorDetail: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  retryButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '600',
  },
  header: {
    ...typography.h1,
    marginBottom: 2,
  },
  subtitle: {
    ...typography.bodyMuted,
    fontSize: 15,
  },
  dateText: {
    ...typography.small,
    color: colors.accent,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    letterSpacing: 0.3,
  },
  // Hero Card
  heroCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  heroText: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 17,
    lineHeight: 26,
    letterSpacing: 0.1,
  },
  // Readiness
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  readinessDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  readinessTag: {
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  readinessLine: {
    ...typography.bodyMuted,
    flex: 1,
    fontSize: 14,
  },
  // Focus Card
  focusCard: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  focusAccent: {
    width: 4,
  },
  focusContent: {
    flex: 1,
    padding: spacing.lg,
  },
  focusLabel: {
    ...typography.small,
    color: colors.textMuted,
    letterSpacing: 1.5,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  focusText: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 18,
  },
  // Momentum
  momentumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  momentumText: {
    ...typography.bodyMuted,
    fontStyle: 'italic',
    fontSize: 14,
  },
  // CTAs
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  ctaPrimary: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    color: colors.bgPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  ctaSecondary: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaSecondaryText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 15,
  },
  cachedHint: {
    ...typography.small,
    color: colors.surfaceMute,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    fontSize: 11,
  },
});
