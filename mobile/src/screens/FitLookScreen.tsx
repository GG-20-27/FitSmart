import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii, shadows } from '../theme';
import {
  getCheckinToday, saveCheckin, getFitLookToday, regenerateFitLook,
  type Feeling, type FitLookResponse,
} from '../api/fitlook';


const FEELINGS: { key: Feeling; label: string; icon: string }[] = [
  { key: 'energized', label: 'Energized', icon: 'flash' },
  { key: 'steady', label: 'Steady', icon: 'water' },
  { key: 'tired', label: 'Tired', icon: 'moon' },
  { key: 'stressed', label: 'Stressed', icon: 'thunderstorm' },
];

export default function FitLookScreen() {
  // States
  const [checkinDone, setCheckinDone] = useState<boolean | null>(null); // null = loading
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [savingCheckin, setSavingCheckin] = useState(false);
  const [fitlook, setFitlook] = useState<FitLookResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const checkinFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkInitialState();
  }, []);

  async function checkInitialState() {
    try {
      const checkin = await getCheckinToday();
      if (checkin.exists && checkin.feeling) {
        setCheckinDone(true);
        setFeeling(checkin.feeling);
        await loadFitLook();
      } else {
        setCheckinDone(false);
        Animated.timing(checkinFade, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }
    } catch {
      setCheckinDone(false);
      Animated.timing(checkinFade, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }

  async function handleCheckin(selectedFeeling: Feeling) {
    setSavingCheckin(true);
    try {
      await saveCheckin(selectedFeeling);
      setFeeling(selectedFeeling);
      setCheckinDone(true);
      await loadFitLook();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save check-in');
      setSavingCheckin(false);
    }
  }

  async function loadFitLook() {
    setLoading(true);
    setError(null);
    fadeAnim.setValue(0);
    try {
      const data = await getFitLookToday();
      setFitlook(data);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } catch (e: any) {
      if (e?.needs_checkin) {
        setCheckinDone(false);
        Animated.timing(checkinFade, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load FitLook');
      }
    } finally {
      setLoading(false);
      setSavingCheckin(false);
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

  // ──── Render: Loading initial check ────

  if (checkinDone === null) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // ──── Render: Self-assessment ────

  if (!checkinDone) {
    return (
      <Animated.View style={[styles.centerContainer, { opacity: checkinFade }]}>
        <View style={styles.checkinCard}>
          <Text style={styles.checkinTitle}>How are you feeling today?</Text>
          <Text style={styles.checkinSubtitle}>One tap to start your morning outlook</Text>
          <View style={styles.feelingList}>
            {FEELINGS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={styles.feelingRow}
                activeOpacity={0.7}
                disabled={savingCheckin}
                onPress={() => handleCheckin(f.key)}
              >
                <View style={styles.feelingIconWrap}>
                  <Ionicons name={f.icon as any} size={22} color={colors.accent} />
                </View>
                <Text style={styles.feelingLabel}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {savingCheckin && (
            <View style={styles.checkinLoading}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.checkinLoadingText}>Generating your outlook...</Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  }

  // ──── Render: Loading FitLook ────

  if (loading && !fitlook) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Preparing your morning outlook...</Text>
      </View>
    );
  }

  // ──── Render: Error ────

  if (error) {
    return (
      <View style={styles.centerContainer}>
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

  // Legacy v1 format: no snapshot_chips → prompt regeneration
  if (!fitlook.snapshot_chips) {
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>FitLook</Text>
        <Text style={styles.subtitle}>Today's Outlook</Text>
        <View style={styles.legacyCard}>
          <Ionicons name="refresh-circle-outline" size={40} color={colors.accent} />
          <Text style={styles.legacyTitle}>New layout available</Text>
          <Text style={styles.legacyText}>Tap below to refresh your morning outlook.</Text>
          <TouchableOpacity
            style={styles.legacyButton}
            onPress={async () => {
              setLoading(true);
              setError(null);
              try {
                const data = await regenerateFitLook();
                setFitlook(data);
              } catch {
                setError('Failed to refresh');
              } finally {
                setLoading(false);
              }
            }}
          >
            <Text style={styles.legacyButtonText}>Refresh Outlook</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ──── Render: v2 A-B-C-D fixed layout ────

  // Assign an icon to each readiness chip by position:
  // 0 = recovery (heart), 1 = sleep (moon), 2 = feeling (matches check-in icon)
  const chipIcon = (index: number): string => {
    if (index === 0) return 'heart';
    if (index === 1) return 'moon';
    return FEELINGS.find(f => f.key === feeling)?.icon ?? 'ellipse';
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header — feeling is shown inside Readiness chips only */}
      <Text style={styles.header}>FitLook</Text>
      <Text style={styles.subtitle}>Today's Outlook</Text>
      <Text style={styles.dateText}>{formatDate(fitlook.date_local)}</Text>

      <Animated.View style={[styles.cards, { opacity: fadeAnim }]}>

        {/* A) Readiness — 3-column metrics row */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>READINESS</Text>
          <View style={styles.metricsRow}>
            {fitlook.snapshot_chips.slice(0, 3).map((chip, i) => (
              <View key={i} style={styles.metricItem}>
                <Ionicons name={chipIcon(i) as any} size={18} color={colors.accent} />
                <Text style={styles.metricValue}>{chip}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* B) Today's Focus */}
        {fitlook.focus && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>TODAY'S FOCUS</Text>
            <Text style={styles.focusText}>{fitlook.focus}</Text>
          </View>
        )}

        {/* C) Actions */}
        {(fitlook.do || fitlook.avoid) && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>ACTIONS</Text>
            {fitlook.do && fitlook.do.length > 0 && (
              <View style={styles.actionSection}>
                <Text style={styles.actionGroupLabel}>DO</Text>
                {fitlook.do.map((item, i) => (
                  <View key={i} style={styles.actionRow}>
                    <View style={styles.actionDot} />
                    <Text style={styles.actionText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
            {fitlook.avoid && (
              <View style={[styles.actionSection, { marginTop: spacing.sm }]}>
                <Text style={[styles.actionGroupLabel, styles.avoidLabel]}>AVOID</Text>
                <View style={styles.actionRow}>
                  <View style={[styles.actionDot, styles.avoidDot]} />
                  <Text style={styles.actionText}>{fitlook.avoid}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* D) Forecast Lock-In */}
        {fitlook.forecast_line && (
          <View style={styles.forecastCard}>
            <View style={styles.forecastStripe} />
            <View style={styles.forecastContent}>
              <Text style={styles.forecastHeading}>To hit today's FitScore forecast:</Text>
              <Text style={styles.forecastText}>
                {/* Strip any leading preamble the AI may include, then capitalize */}
                {(() => {
                  const s = fitlook.forecast_line.replace(/^to hit today['']s\s+(fitscore\s+)?forecast:\s*/i, '').trim();
                  return s.charAt(0).toUpperCase() + s.slice(1);
                })()}
              </Text>
            </View>
          </View>
        )}

        {/* Cached hint */}
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
  centerContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },

  // Header
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
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },

  // Check-in
  checkinCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    ...shadows.card,
  },
  checkinTitle: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  checkinSubtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  feelingList: {
    width: '100%',
    gap: spacing.sm,
  },
  feelingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  feelingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feelingLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  checkinLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  checkinLoadingText: {
    ...typography.bodyMuted,
  },

  // Loading / Error
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

  // v2 card layout
  cards: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardLabel: {
    ...typography.small,
    fontSize: 11,
    letterSpacing: 1.1,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },

  // A) Readiness — 3-column metrics row
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricValue: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },

  // B) Focus — same weight as action items, not a hero headline
  focusText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },

  // C) Actions
  actionSection: {},
  actionGroupLabel: {
    ...typography.small,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.success,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  avoidLabel: {
    color: colors.warning,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  actionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  avoidDot: {
    backgroundColor: colors.warning,
  },
  actionText: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 14,
    flex: 1,
  },

  // D) Forecast — left accent stripe + subtle tinted background
  forecastCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.accent + '0D',
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  forecastStripe: {
    width: 3,
    backgroundColor: colors.accent,
  },
  forecastContent: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  forecastHeading: {
    ...typography.small,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  forecastText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },

  // Legacy v1 prompt
  legacyCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    ...shadows.card,
  },
  legacyTitle: {
    ...typography.title,
    textAlign: 'center',
  },
  legacyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  legacyButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  legacyButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '600',
  },

  // Cached hint
  cachedHint: {
    ...typography.small,
    color: colors.surfaceMute,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: 11,
  },
});
