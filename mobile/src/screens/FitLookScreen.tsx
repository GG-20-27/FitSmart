import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Dimensions, FlatList,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii, shadows } from '../theme';
import {
  getCheckinToday, saveCheckin, getFitLookToday,
  type Feeling, type FitLookResponse, type FitLookSlide,
} from '../api/fitlook';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_WIDTH = SCREEN_WIDTH - spacing.lg * 2;
const AUTO_ADVANCE_MS = 10000;
const PAUSE_AFTER_INTERACTION_MS = 5000;

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

  // Carousel state
  const [activeSlide, setActiveSlide] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const autoAdvanceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPaused = useRef(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const checkinFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkInitialState();
    return () => {
      if (autoAdvanceTimer.current) clearInterval(autoAdvanceTimer.current);
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
    };
  }, []);

  // Start auto-advance when fitlook is loaded
  useEffect(() => {
    if (fitlook && fitlook.slides?.length > 1) {
      startAutoAdvance();
    }
    return () => {
      if (autoAdvanceTimer.current) clearInterval(autoAdvanceTimer.current);
    };
  }, [fitlook]);

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

  // ──── Auto-advance carousel ────

  function startAutoAdvance() {
    if (autoAdvanceTimer.current) clearInterval(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setInterval(() => {
      if (isPaused.current) return;
      setActiveSlide(prev => {
        const next = (prev + 1) % (fitlook?.slides?.length || 3);
        try {
          flatListRef.current?.scrollToIndex({ index: next, animated: true });
        } catch {}
        return next;
      });
    }, AUTO_ADVANCE_MS);
  }

  function pauseAutoAdvance() {
    isPaused.current = true;
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      isPaused.current = false;
    }, PAUSE_AFTER_INTERACTION_MS);
  }

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    setActiveSlide(index);
  }, []);

  const onScrollBegin = useCallback(() => {
    pauseAutoAdvance();
  }, []);

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

  if (!fitlook || !fitlook.slides) return null;

  // ──── Render: 3-Slide Briefing ────

  const renderSlide = ({ item }: { item: FitLookSlide; index: number }) => (
    <View style={[styles.slideContainer, { width: SLIDE_WIDTH }]}>
      <View style={styles.slideCard}>
        <Text style={styles.slideTitle}>{item.title}</Text>

        {item.chips && item.chips.length > 0 && (
          <View style={styles.chipRow}>
            {item.chips.map((chip, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{chip}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.slideBody}>{item.body}</Text>

        <View style={styles.focusLineWrap}>
          <View style={styles.focusLineStripe} />
          <Text style={styles.focusLineText}>{item.focus_line}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <Text style={styles.header}>FitLook</Text>
      <Text style={styles.subtitle}>Today's Outlook</Text>
      <Text style={styles.dateText}>{formatDate(fitlook.date_local)}</Text>

      {/* Feeling badge */}
      {feeling && (
        <View style={styles.feelingBadge}>
          <Ionicons
            name={FEELINGS.find(f => f.key === feeling)?.icon as any || 'ellipse'}
            size={14}
            color={colors.accent}
          />
          <Text style={styles.feelingBadgeText}>
            Feeling {feeling}
          </Text>
        </View>
      )}

      <Animated.View style={{ opacity: fadeAnim }}>
        {/* Carousel */}
        <FlatList
          ref={flatListRef}
          data={fitlook.slides}
          renderItem={renderSlide}
          keyExtractor={(_, i) => `slide-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={SLIDE_WIDTH}
          decelerationRate="fast"
          onMomentumScrollEnd={onScrollEnd}
          onScrollBeginDrag={onScrollBegin}
          contentContainerStyle={styles.carouselContent}
          getItemLayout={(_, index) => ({
            length: SLIDE_WIDTH,
            offset: SLIDE_WIDTH * index,
            index,
          })}
        />

        {/* Dot indicators */}
        <View style={styles.dotRow}>
          {fitlook.slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                activeSlide === i && styles.dotActive,
              ]}
            />
          ))}
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

  // Feeling badge
  feelingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.lg,
  },
  feelingBadgeText: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '500',
    textTransform: 'capitalize',
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

  // Carousel
  carouselContent: {},
  slideContainer: {
    paddingRight: 0,
  },
  slideCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.xl,
    minHeight: 240,
    ...shadows.card,
  },
  slideTitle: {
    ...typography.title,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  chipText: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: '500',
    fontSize: 11,
  },

  // Body
  slideBody: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },

  // Focus line
  focusLineWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.sm,
  },
  focusLineStripe: {
    width: 3,
    backgroundColor: colors.accent,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  focusLineText: {
    ...typography.bodyMuted,
    color: colors.accent,
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
    paddingVertical: spacing.xs,
  },

  // Dots
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceMute,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 20,
    borderRadius: 4,
  },

  // Cached hint
  cachedHint: {
    ...typography.small,
    color: colors.surfaceMute,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    fontSize: 11,
  },
});
