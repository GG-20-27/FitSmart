import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, typography, radii, shadows } from '../theme';
import {
  getCheckinToday, saveCheckin, getFitLookToday, regenerateFitLook,
  type Feeling, type FitLookResponse,
} from '../api/fitlook';

const FITLOOK_CHECKIN_KEY = () => `fitlook_checkin_${new Date().toISOString().slice(0, 10)}`;

/**
 * Builds the prefilled FitCoach prompt from the FitLook payload.
 * Only uses data already on screen — no new API calls.
 */
function buildExplainPlanPrompt(fitlook: FitLookResponse, feeling: Feeling | null): string {
  const chips = fitlook.snapshot_chips ?? [];
  const feelingLabel = feeling
    ? feeling.charAt(0).toUpperCase() + feeling.slice(1)
    : chips[2] ?? 'Unknown';

  const readinessParts = [
    chips[0] ? `Recovery ${chips[0]}` : null,
    chips[1] ? `Sleep ${chips[1]}` : null,
    `Feeling: ${feelingLabel}`,
  ].filter(Boolean).join(', ');

  const lines: string[] = [];
  lines.push('Explain today\'s plan using my FitLook context.');
  if (readinessParts) lines.push(`Today's readiness: ${readinessParts}.`);
  if (fitlook.focus) lines.push(`Today's focus: ${fitlook.focus}.`);
  if (fitlook.do && fitlook.do.length > 0) {
    lines.push(`Actions — DO: ${fitlook.do.join('; ')}.`);
  }
  if (fitlook.avoid) {
    lines.push(`Actions — AVOID: ${fitlook.avoid}.`);
  }
  if (fitlook.forecast_line) {
    const clean = fitlook.forecast_line
      .replace(/^to hit today['']s\s+(fitscore\s+)?forecast:\s*/i, '')
      .trim();
    lines.push(`Forecast target: ${clean}.`);
  }
  lines.push('');
  lines.push('1) Briefly explain WHY this is the right plan today (tie directly to readiness + context flags).');
  lines.push('2) Clarify how strict I should be on AVOID items and what safe alternatives look like (within rehab/goal limits if applicable).');
  lines.push('3) Give 1–2 practical tips to make the DO actions easier to execute today.');
  lines.push('Keep it concise and aligned with the FitLook plan (no generic advice unless explicitly flagged in today\'s context).');

  return lines.join('\n');
}


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

  const navigation = useNavigation<any>();

  const handleExplainPlan = () => {
    if (!fitlook) return;
    const prompt = buildExplainPlanPrompt(fitlook, feeling);
    // Try direct navigate first; if FitLook is in a nested navigator, bubble up to root tabs
    const nav = navigation.getParent() ?? navigation;
    nav.navigate('FitCoach', { prefilledMessage: prompt, autoSubmit: false });
  };


  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const checkinFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkInitialState();
  }, []);

  async function checkInitialState() {
    // Restore from cache immediately to prevent feeling question flashing on remount
    try {
      const cached = await AsyncStorage.getItem(FITLOOK_CHECKIN_KEY());
      if (cached) {
        const { feeling: cachedFeeling } = JSON.parse(cached);
        setCheckinDone(true);
        setFeeling(cachedFeeling);
        await loadFitLook();
        return;
      }
    } catch { /* ignore cache errors */ }

    try {
      const checkin = await getCheckinToday();
      if (checkin.exists && checkin.feeling) {
        setCheckinDone(true);
        setFeeling(checkin.feeling);
        await AsyncStorage.setItem(FITLOOK_CHECKIN_KEY(), JSON.stringify({ feeling: checkin.feeling })).catch(() => {});
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
      await AsyncStorage.setItem(FITLOOK_CHECKIN_KEY(), JSON.stringify({ feeling: selectedFeeling })).catch(() => {});
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
      let data = await getFitLookToday();
      // Auto-upgrade v2 plans (no fuel/protocol/edge) to v3 format
      if (data.snapshot_chips && !data.fuel && !data.protocol && !data.edge) {
        try {
          data = await regenerateFitLook();
        } catch { /* keep v2 if regeneration fails */ }
      }
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

  // ──── Render: v3 pre-game protocol layout (falls back to v2 if new fields absent) ────

  const hasV3 = !!(fitlook.fuel || fitlook.protocol || fitlook.edge);

  // Chip icon by position: 0=recovery, 1=sleep, 2=feeling
  const chipIcon = (index: number): string => {
    if (index === 0) return 'heart';
    if (index === 1) return 'moon';
    return FEELINGS.find(f => f.key === feeling)?.icon ?? 'ellipse';
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.header}>FitLook</Text>
      <Text style={styles.subtitle}>
        {fitlook.isRestDay ? 'Rest Day' : "Today's Outlook"}
      </Text>
      <Text style={styles.dateText}>{formatDate(fitlook.date_local)}</Text>

      <Animated.View style={[styles.cards, { opacity: fadeAnim }]}>

        {/* Reasoning sentence */}
        {fitlook.reasoning && (
          <Text style={styles.reasoningText}>{fitlook.reasoning}</Text>
        )}

        {/* Readiness — single-line horizontal pill strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsStrip}
          contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.xs }}
        >
          {fitlook.snapshot_chips.slice(0, 4).map((chip, i) => (
            <View key={i} style={styles.chipPill}>
              <Ionicons name={chipIcon(i) as any} size={13} color={colors.accent} />
              <Text style={styles.chipPillText}>{chip}</Text>
            </View>
          ))}
        </ScrollView>

        {hasV3 ? (
          <>
            {/* Section 1: Fuel */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="nutrition-outline" size={15} color={colors.accent} />
                <Text style={styles.cardLabel}>FUEL</Text>
              </View>
              {(fitlook.fuel ?? []).map((item, i) => (
                <View key={i} style={styles.actionRow}>
                  <View style={styles.actionDot} />
                  <Text style={styles.actionText}>{item}</Text>
                </View>
              ))}
              {(!fitlook.fuel || fitlook.fuel.length === 0) && (
                <Text style={styles.actionText}>Eat balanced meals — prioritise protein today</Text>
              )}
            </View>

            {/* Section 2: Today's Protocol */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="flash-outline" size={15} color={colors.accent} />
                <Text style={styles.cardLabel}>
                  {fitlook.isRestDay ? "RECOVERY PROTOCOL" : "TODAY'S PROTOCOL"}
                </Text>
              </View>
              {(fitlook.protocol ?? []).map((step, i) => (
                <View key={i} style={styles.protocolRow}>
                  <View style={styles.protocolTimeTag}>
                    <Text style={styles.protocolTimeText}>{step.time}</Text>
                  </View>
                  <Text style={styles.protocolActionText}>{step.action}</Text>
                </View>
              ))}
              {(!fitlook.protocol || fitlook.protocol.length === 0) && (
                <Text style={styles.actionText}>Follow your usual routine</Text>
              )}
            </View>

            {/* Section 3: Your Edge */}
            <View style={styles.forecastCard}>
              <View style={styles.forecastStripe} />
              <View style={styles.forecastContent}>
                <Text style={styles.forecastHeading}>YOUR EDGE</Text>
                <Text style={styles.forecastText}>{fitlook.edge ?? fitlook.focus ?? ''}</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* v2 fallback layout */}
            {fitlook.focus && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>TODAY'S FOCUS</Text>
                <Text style={styles.focusText}>{fitlook.focus}</Text>
              </View>
            )}

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

            {fitlook.forecast_line && (
              <View style={styles.forecastCard}>
                <View style={styles.forecastStripe} />
                <View style={styles.forecastContent}>
                  <Text style={styles.forecastHeading}>To hit today's FitScore forecast:</Text>
                  <Text style={styles.forecastText}>
                    {(() => {
                      const s = fitlook.forecast_line!.replace(/^to hit today['']s\s+(fitscore\s+)?forecast:\s*/i, '').trim();
                      return s.charAt(0).toUpperCase() + s.slice(1);
                    })()}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* CTA — Explain Today's Plan */}
        <TouchableOpacity
          style={styles.explainButton}
          activeOpacity={0.8}
          onPress={handleExplainPlan}
        >
          <Ionicons name="chatbubbles-outline" size={16} color={colors.bgPrimary} />
          <Text style={styles.explainButtonText}>Explain Today's Plan</Text>
        </TouchableOpacity>

        {/* Cached hint */}
        {(fitlook as any).cached && (
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
  reasoningText: {
    ...typography.small,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
    lineHeight: 18,
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

  // Readiness pill strip (v3)
  chipsStrip: {
    marginBottom: spacing.xs,
  },
  chipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent + '15',
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  chipPillText: {
    ...typography.small,
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '500',
  },

  // Section header row (icon + label)
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },

  // Protocol steps (v3)
  protocolRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  protocolTimeTag: {
    backgroundColor: colors.accent + '20',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    minWidth: 70,
    alignItems: 'center',
  },
  protocolTimeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  protocolActionText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 20,
  },

  // A) Readiness — 3-column metrics row (v2 fallback)
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

  // CTA button
  explainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  explainButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
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
