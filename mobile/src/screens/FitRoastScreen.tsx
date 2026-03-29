import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ActivityIndicator, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography, radii } from '../theme';
import { getFitRoastCurrent, generateFitRoast, generateFitRoastDev, resetFitRoastDev, type FitRoastResponse, type FitRoastSegment, type WeeklyGoalReview } from '../api/fitroast';
import FitRoastShareModal from '../components/FitRoastShareModal';
import { apiRequest } from '../api/client';

const { width: W, height: H } = Dimensions.get('window');

type ScreenState = 'loading' | 'off' | 'locked' | 'empty' | 'goal-check' | 'generating' | 'intro' | 'roast' | 'error';

export default function FitRoastScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [roast, setRoast] = useState<FitRoastResponse | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(-1); // -1 = intro/headline
  const [error, setError] = useState<string | null>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [roastIntensity, setRoastIntensity] = useState<'Light' | 'Spicy' | 'Savage'>('Spicy');
  const [activeDays, setActiveDays] = useState(0);
  const [isSunday, setIsSunday] = useState(false);
  const [weeklySubgoals, setWeeklySubgoals] = useState<Array<{
    goalId: string; goalTitle: string; subIndex: number; text: string; checked: boolean;
  }>>([]);
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const screenFade = useRef(new Animated.Value(0)).current;

  useFocusEffect(useCallback(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    // Re-check settings every time this tab comes into focus
    AsyncStorage.multiGet(['fitRoastEnabled', 'roastIntensity']).then(pairs => {
      const enabled = pairs[0][1];
      const intensity = pairs[1][1];
      if (intensity === 'Light' || intensity === 'Spicy' || intensity === 'Savage') {
        setRoastIntensity(intensity);
      }
      if (enabled === 'false') {
        setScreenState('off');
      } else {
        loadRoast();
      }
    }).catch(() => loadRoast()); // fallback: load if storage fails
  }, []));

  async function loadRoast() {
    setScreenState('loading');
    try {
      const data = await getFitRoastCurrent();
      setRoast(data);
      setSegmentIndex(-1);
      setScreenState('intro');
      animateIn();
    } catch (e: any) {
      const is404 = e?.status === 404 || e?.message?.includes('404');
      if (is404) {
        setActiveDays(e?.active_days ?? 0);
        setIsSunday(e?.is_sunday ?? false);
        if (e?.eligible) {
          // Sunday + eligible → load subgoals then show weekly goal check
          await loadWeeklySubgoals();
          setScreenState('goal-check');
        } else {
          setScreenState('locked'); // Not eligible yet → show lock screen
        }
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load FitRoast');
        setScreenState('error');
      }
    }
  }

  async function loadWeeklySubgoals() {
    try {
      const goals = await apiRequest<any[]>('/api/goals');
      const items: typeof weeklySubgoals = [];
      for (const g of goals) {
        if (g.completedAt) continue; // skip archived goals
        const raw = g.microhabits;
        const allItems: any[] = Array.isArray(raw)
          ? raw
          : typeof raw === 'string'
            ? JSON.parse(raw)
            : [];
        allItems.forEach((h: any, i: number) => {
          if (h.isSubgoal && !h.done) {
            items.push({ goalId: g.id, goalTitle: g.title, subIndex: i, text: h.text, checked: false });
          }
        });
      }
      setWeeklySubgoals(items);
    } catch (e) { console.warn('[FitRoast] loadWeeklySubgoals failed:', e); }
  }

  async function submitGoalCheck() {
    // Group checked subgoals by goalId
    const byGoal: Record<string, number[]> = {};
    weeklySubgoals.filter(s => s.checked).forEach(s => {
      (byGoal[s.goalId] = byGoal[s.goalId] ?? []).push(s.subIndex);
    });

    // Update each affected goal on server
    try {
      const allGoals = await apiRequest<any[]>('/api/goals');
      for (const [goalId, indices] of Object.entries(byGoal)) {
        const g = allGoals.find((x: any) => x.id === goalId);
        if (!g) continue;
        const microhabits = [...(g.microhabits ?? [])];
        indices.forEach(i => { if (microhabits[i]) microhabits[i] = { ...microhabits[i], done: true }; });
        const subgoals = microhabits.filter((h: any) => h.isSubgoal);
        const progress = subgoals.length > 0
          ? Math.round(subgoals.filter((h: any) => h.done).length / subgoals.length * 100)
          : g.progress;
        await apiRequest(`/api/goals/${goalId}`, {
          method: 'PATCH',
          body: JSON.stringify({ microhabits, progress }),
        });
      }
    } catch { /* non-fatal */ }

    // Build review context
    const completed = weeklySubgoals.filter(s => s.checked).map(s => s.text);
    const remaining = weeklySubgoals.filter(s => !s.checked).map(s => s.text);
    const review: WeeklyGoalReview = {
      completedSubGoalsCount: completed.length,
      completedSubGoals: completed,
      remainingSubGoals: remaining,
    };

    // Trigger FitRoast generation with context
    setScreenState('generating');
    try {
      const data = await generateFitRoast(roastIntensity, review);
      setRoast(data);
      setSegmentIndex(-1);
      setScreenState('intro');
      animateIn();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to generate FitRoast');
      setScreenState('error');
    }
  }

  async function triggerGenerate() {
    setScreenState('generating');
    try {
      const data = await generateFitRoast(roastIntensity);
      setRoast(data);
      setSegmentIndex(-1);
      setScreenState('intro');
      animateIn();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to generate FitRoast');
      setScreenState('error');
    }
  }

  function animateIn() {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }

  function handleTap() {
    if (!roast) return;

    if (segmentIndex < roast.segments.length - 1) {
      fadeAnim.setValue(0);
      slideAnim.setValue(16);
      setSegmentIndex(prev => prev + 1);
      setScreenState('roast');
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]).start();
    }
    // last segment — do nothing (user sees "Done" button)
  }

  const currentSegment: FitRoastSegment | null =
    segmentIndex >= 0 && roast ? roast.segments[segmentIndex] : null;

  const isLastSegment = roast ? segmentIndex === roast.segments.length - 1 : false;
  const progress = roast ? (segmentIndex + 1) / (roast.segments.length) : 0;

  // ── Loading ──
  if (screenState === 'loading' || screenState === 'generating') {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>
          {screenState === 'generating' ? 'Roasting your week...' : 'Loading...'}
        </Text>
      </View>
    );
  }

  // ── Error ──
  if (screenState === 'error') {
    return (
      <View style={styles.fullCenter}>
        <Ionicons name="flame-outline" size={48} color={colors.danger} />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorDetail}>{error}</Text>
        <TouchableOpacity style={styles.ctaButton} onPress={loadRoast}>
          <Text style={styles.ctaButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Off — FitRoast disabled in settings ──
  if (screenState === 'off') {
    return (
      <Animated.View style={[styles.fullCenter, { opacity: screenFade }]}>
        <Ionicons name="flame-outline" size={52} color={colors.surfaceMute} />
        <Text style={styles.offTitle}>FitRoast is currently off.</Text>
        <Text style={styles.offSubtitle}>
          Turn it on in Settings to face your weekly truth.
        </Text>
      </Animated.View>
    );
  }

  // ── Locked — only shown Mon–Sat ──
  if (screenState === 'locked') {
    const today = new Date();
    const daysUntilSunday = (7 - today.getDay()) % 7 || 7;
    return (
      <Animated.View style={[styles.fullCenter, { opacity: screenFade }]}>
        <Ionicons name="flame-outline" size={44} color={colors.surfaceMute} />
        <Text style={styles.lockedTitle}>FitRoast Coming Sunday</Text>
        <Text style={styles.lockedSubtitle}>
          Every Sunday your week gets roasted.{'\n'}Come back in {daysUntilSunday} day{daysUntilSunday !== 1 ? 's' : ''}.
        </Text>
        {__DEV__ && (
          <TouchableOpacity
            onPress={async () => { try { await resetFitRoastDev(); loadRoast(); } catch (e) { console.warn('Dev reset failed', e); } }}
            style={{ marginTop: 32, opacity: 0.4 }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>[dev] reset roast</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  }

  // ── Weekly Goal Check — review sub-goals before FitRoast ──
  if (screenState === 'goal-check') {
    const checkedCount = weeklySubgoals.filter(s => s.checked).length;
    return (
      <Animated.View style={[{ flex: 1, backgroundColor: colors.bgPrimary }, { opacity: screenFade }]}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 60, gap: spacing.lg }}>
          <Text style={styles.goalCheckTitle}>Weekly Goal Check</Text>
          <Text style={styles.goalCheckSubtitle}>
            Before your FitRoast, review which sub-goals you completed this week.
          </Text>

          {weeklySubgoals.length === 0 ? (
            <Text style={styles.goalCheckEmpty}>No pending sub-goals to review.</Text>
          ) : (
            weeklySubgoals.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.goalCheckItem}
                onPress={() => setWeeklySubgoals(prev => prev.map((s, j) => j === i ? { ...s, checked: !s.checked } : s))}
                activeOpacity={0.7}
              >
                <View style={[styles.goalCheckBox, item.checked && styles.goalCheckBoxDone]}>
                  {item.checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalCheckItemText}>{item.text}</Text>
                  <Text style={styles.goalCheckGoalLabel}>{item.goalTitle}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity
            style={[styles.ctaButton, { marginTop: spacing.md }]}
            onPress={submitGoalCheck}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaButtonText}>Continue to FitRoast</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    );
  }

  // ── Empty — no roast for this week yet ──
  if (screenState === 'empty') {
    return (
      <Animated.View style={[styles.fullCenter, { opacity: screenFade }]}>
        <Text style={styles.fireEmoji}>🔥</Text>
        <Text style={styles.emptyTitle}>No Roast This Week</Text>
        <Text style={styles.emptySubtitle}>
          Get your weekly reality check.{'\n'}We looked at your data. It's time.
        </Text>
        <TouchableOpacity style={styles.ctaButton} onPress={triggerGenerate} activeOpacity={0.8}>
          <Text style={styles.ctaButtonText}>Roast Me</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── Intro — headline view ──
  if (screenState === 'intro' && roast) {
    return (
      <Animated.View style={[styles.roastContainer, { opacity: screenFade }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.weekLabel}>Week of {formatWeek(roast.week_start)}</Text>
        </View>

        {/* Headline */}
        <View style={styles.contentArea}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <Text style={styles.introLabel}>THIS WEEK</Text>
            <Text style={styles.headline}>{roast.headline}</Text>
            {roast.cached && (
              <Text style={styles.cachedHint}>Generated earlier this week</Text>
            )}
          </Animated.View>
        </View>

        {/* Tap to continue */}
        <TouchableOpacity style={styles.tapArea} onPress={handleTap} activeOpacity={1}>
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.tapHint}>Tap to begin</Text>
            <Ionicons name="chevron-down" size={20} color={colors.accent} style={styles.tapIcon} />
          </Animated.View>
        </TouchableOpacity>

        {/* Progress dots */}
        <View style={styles.progressBar}>
          {roast.segments.map((_, i) => (
            <View
              key={i}
              style={[styles.progressDot, i <= segmentIndex && styles.progressDotActive]}
            />
          ))}
        </View>

        {__DEV__ && (
          <TouchableOpacity
            onPress={async () => { try { await resetFitRoastDev(); loadRoast(); } catch (e) { console.warn('Dev reset failed', e); } }}
            style={{ position: 'absolute', top: 16, right: 16, opacity: 0.25 }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>[dev] reset</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  }

  // ── Roast segment view ──
  if (screenState === 'roast' && currentSegment && roast) {
    return (
      <View style={styles.roastContainer}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => { setSegmentIndex(-1); setScreenState('intro'); animateIn(); }}>
            <Ionicons name="chevron-back" size={22} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.weekLabel}>Week of {formatWeek(roast.week_start)}</Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Segment content */}
        <TouchableOpacity
          style={styles.contentArea}
          onPress={isLastSegment ? undefined : handleTap}
          activeOpacity={isLastSegment ? 1 : 0.95}
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <Text style={styles.topicLabel}>{currentSegment.topic.toUpperCase()}</Text>
            <Text style={styles.segmentText}>{currentSegment.text}</Text>
          </Animated.View>
        </TouchableOpacity>

        {/* Bottom area */}
        <View style={styles.bottomArea}>
          {isLastSegment ? (
            <View style={styles.lastSegmentActions}>
              <TouchableOpacity
                style={styles.ctaButton}
                onPress={() => setShareVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="share-outline" size={18} color={colors.bgPrimary} style={{ marginRight: 8 }} />
                <Text style={styles.ctaButtonText}>Share Roast</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => { setSegmentIndex(-1); setScreenState('intro'); animateIn(); }}
                activeOpacity={0.8}
              >
                <Text style={styles.secondaryButtonText}>Start Over</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.tapArea} onPress={handleTap} activeOpacity={1}>
              <Text style={styles.tapHint}>Tap to continue</Text>
              <Ionicons name="chevron-down" size={20} color={colors.accent} style={styles.tapIcon} />
            </TouchableOpacity>
          )}

          {/* Progress dots */}
          <View style={styles.progressBar}>
            {roast.segments.map((_, i) => (
              <View
                key={i}
                style={[styles.progressDot, i <= segmentIndex && styles.progressDotActive]}
              />
            ))}
          </View>
        </View>

        {/* Share modal */}
        {roast && (
          <FitRoastShareModal
            visible={shareVisible}
            roast={roast}
            onClose={() => setShareVisible(false)}
          />
        )}
      </View>
    );
  }

  return null;
}

function formatWeek(weekStart: string): string {
  try {
    const [year, month, day] = weekStart.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return weekStart;
  }
}

const styles = StyleSheet.create({
  fullCenter: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },

  // Roast layout
  roastContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  weekLabel: {
    ...typography.small,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  regenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  regenButtonText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
  },

  // Content
  contentArea: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
  },
  introLabel: {
    ...typography.small,
    color: colors.accent,
    letterSpacing: 2,
    marginBottom: spacing.lg,
    fontWeight: '700',
  },
  headline: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  topicLabel: {
    ...typography.small,
    color: colors.accent,
    letterSpacing: 2,
    marginBottom: spacing.lg,
    fontWeight: '700',
  },
  segmentText: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  cachedHint: {
    ...typography.small,
    color: colors.surfaceMute,
    marginTop: spacing.lg,
  },

  // Bottom / Tap area
  bottomArea: {
    paddingBottom: spacing.xl + spacing.md,
    alignItems: 'center',
    gap: spacing.md,
  },
  tapArea: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  tapHint: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: 4,
  },
  tapIcon: {
    alignSelf: 'center',
  },

  // Progress dots
  progressBar: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingBottom: spacing.sm,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMute,
  },
  progressDotActive: {
    backgroundColor: colors.accent,
    width: 18,
  },

  // Off state
  offTitle: {
    ...typography.h2,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  offSubtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
  },

  // Locked state
  lockedTitle: {
    ...typography.h2,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  lockedSubtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  devTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  devTestBtnText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
  },
  activeDaysRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.xl,
  },
  activeDayPip: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surfaceMute,
  },
  activeDayPipFilled: {
    backgroundColor: colors.accent,
  },
  activeDaysText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  lockedHint: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  // Empty state
  fireEmoji: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h2,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },

  // Last segment action group
  lastSegmentActions: {
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },

  // CTA button
  ctaButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 180,
  },
  ctaButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  secondaryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    minWidth: 140,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '500',
  },

  // Loading / Error
  loadingText: {
    ...typography.bodyMuted,
    marginTop: spacing.md,
  },
  errorTitle: {
    ...typography.title,
    marginTop: spacing.md,
  },
  errorDetail: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },

  // Weekly Goal Check screen
  goalCheckTitle: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: colors.textPrimary,
  },
  goalCheckSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 22,
  },
  goalCheckEmpty: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },
  goalCheckItem: {
    flexDirection: 'row' as const,
    gap: 12,
    padding: 14,
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: 10,
    alignItems: 'center' as const,
  },
  goalCheckBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.surfaceMute,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  goalCheckBoxDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  goalCheckItemText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  goalCheckGoalLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
});
