import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Dimensions,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from '../api/client';
import { colors, spacing, radii, typography, state } from '../theme';
import { Card } from '../ui/components';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, LinearGradient, Stop, Defs } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Dynamic forecast copy — rotates daily, never the same two days running ──

const FORECAST_COPY: Record<'high' | 'mid' | 'low', Array<{ line1: string; line2: string }>> = {
  high: [
    { line1: 'FitScore of {s} is within reach.', line2: 'Precision today determines the outcome.' },
    { line1: 'Everything aligns for a {s}.', line2: 'Lock in and make every rep count.' },
    { line1: 'Your body is primed for {s}.', line2: 'Push with intention — not just intensity.' },
    { line1: '{s} is yours to earn today.', line2: 'Execution separates good from great.' },
    { line1: 'Conditions are set for a {s}.', line2: 'Stay sharp from the first set to the last.' },
  ],
  mid: [
    { line1: 'A solid {s} is achievable.', line2: 'Smart effort beats hard effort today.' },
    { line1: 'FitScore of {s} — work with your body.', line2: 'Consistency over intensity this session.' },
    { line1: 'Moderate output expected at {s}.', line2: 'Nail the fundamentals and build on them.' },
    { line1: '{s} within reach with disciplined effort.', line2: 'Quality reps count more than quantity.' },
    { line1: 'Show up clean and earn {s}.', line2: 'Control what you can, let the rest follow.' },
  ],
  low: [
    { line1: 'Recovery day — FitScore sits at {s}.', line2: 'Rest is part of the plan, not a detour.' },
    { line1: 'Low output day at {s}.', line2: 'Honour the signal and recharge properly.' },
    { line1: 'FitScore of {s} — your body needs margin.', line2: 'Quality sleep now builds tomorrow\'s score.' },
    { line1: '{s} — threshold crossed into recovery.', line2: 'Protect your adaptation window today.' },
    { line1: 'Listen to {s} and dial it back.', line2: 'Conservation today is performance tomorrow.' },
  ],
};

function getDynamicForecastLines(score: number): { line1: string; line2: string } {
  const zone = score >= 7 ? 'high' : score >= 4 ? 'mid' : 'low';
  const variants = FORECAST_COPY[zone];
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const { line1, line2 } = variants[dayOfYear % variants.length];
  const s = score.toFixed(1);
  return { line1: line1.replace('{s}', s), line2: line2.replace('{s}', s) };
}

type FitScoreForecast = {
  forecast: number;
  factors: {
    sleep: string;
    recovery: string;
    strain: string;
  };
  insight: string;
  insightLine1?: string;
  insightLine2?: string;
  updatedAt: string;
};

type DailyMetrics = {
  sleep_score?: number;
  recovery_score?: number;
  strain?: number;
  hrv?: number;
  sleep_hours?: number;
  resting_heart_rate?: number;
};

type YesterdayMetrics = {
  sleep_score?: number;
  recovery_score?: number;
  strain?: number;
  hrv?: number;
};

type WeeklyMetrics = {
  start_date: string;
  end_date: string;
  averages: {
    sleep_score_percent: number;
    recovery_score_percent: number;
    strain_score: number;
    hrv_ms: number;
  };
  comparison: {
    vs_last_month: {
      sleep_percent_delta: number;
      recovery_percent_delta: number;
      strain_delta: number;
      hrv_ms_delta: number;
    };
  };
};

type LastWeekMetrics = {
  sleep_score?: number;
  recovery_score?: number;
  strain?: number;
  hrv?: number;
};

type CalendarEvent = {
  title: string;
  start: string;
  location?: string;
};

// Color threshold helpers based on WHOOP spec
const getRecoveryColor = (value: number): string => {
  if (value >= 67) return state.ready; // Green
  if (value >= 34) return '#F5A623'; // Yellow
  return state.rest; // Red
};

const getSleepColor = (value: number): string => {
  if (value >= 80) return state.ready; // Green
  if (value >= 50) return '#F5A623'; // Yellow
  return state.rest; // Red
};

const getStrainColor = (strain: number, recoveryScore?: number): string => {
  // Strain color depends on recovery zone
  if (!recoveryScore || recoveryScore >= 67) {
    // High recovery - can handle higher strain
    if (strain <= 14) return state.ready;
    if (strain <= 18) return '#F5A623';
    return state.rest;
  } else if (recoveryScore >= 34) {
    // Medium recovery
    if (strain <= 10) return state.ready;
    if (strain <= 15) return '#F5A623';
    return state.rest;
  } else {
    // Low recovery
    if (strain <= 7) return state.ready;
    if (strain <= 12) return '#F5A623';
    return state.rest;
  }
};

// Pulse ring animation component
function FitScorePulseRing({ score }: { score: number }) {
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference - (score / 10) * circumference; // v3.0: score is 1-10 scale

  return (
    <Animated.View style={[styles.pulseRingContainer, { transform: [{ scale: pulseAnim }] }]}>
      <Svg width="180" height="180" viewBox="0 0 180 180">
        <Defs>
          <LinearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors.accent} stopOpacity="1" />
            <Stop offset="100%" stopColor="#46F0D2" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        {/* Background circle */}
        <Circle
          cx="90"
          cy="90"
          r="70"
          stroke={colors.surfaceMute}
          strokeWidth="8"
          fill="none"
        />
        {/* Progress circle */}
        <Circle
          cx="90"
          cy="90"
          r="70"
          stroke="url(#gradient)"
          strokeWidth="8"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 90 90)"
        />
      </Svg>
      <View style={styles.scoreInRing}>
        <Text style={styles.scoreNumber}>≈ {score}</Text>
      </View>
    </Animated.View>
  );
}

// Metric Card with colored border and trend indicator
function MetricCard({
  icon,
  label,
  value,
  delta,
  deltaLabel = 'vs. yesterday',
  borderColor,
  valueColor,
  neutralDelta = false,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  borderColor?: string;
  valueColor?: string;
  neutralDelta?: boolean;
  onPress?: () => void;
}) {
  // If neutralDelta is true, always use grey for delta (for strain/HRV where higher isn't necessarily better)
  const deltaColor = neutralDelta ? colors.textMuted : (delta && delta > 0 ? state.ready : delta && delta < 0 ? state.rest : colors.textMuted);
  const deltaIcon = delta && delta > 0 ? 'arrow-up' : delta && delta < 0 ? 'arrow-down' : 'remove';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} disabled={!onPress} style={styles.metricCardWrapper}>
      <View style={[styles.metricCard, borderColor && { borderLeftColor: borderColor, borderLeftWidth: 3 }]}>
        <View style={styles.metricHeader}>
          <Ionicons name={icon as any} size={20} color={colors.accent} />
          <Text style={styles.metricLabel}>{label}</Text>
        </View>
        <Text style={[styles.metricValue, valueColor && { color: valueColor }]}>{value}</Text>
        {delta !== undefined && (
          <View style={styles.metricDelta}>
            <Ionicons name={deltaIcon as any} size={12} color={deltaColor} />
            <Text style={[styles.metricDeltaText, { color: deltaColor }]}>
              {deltaLabel}: {delta > 0 ? '+' : ''}{delta}{label.includes('HRV') || label.includes('Strain') ? '' : '%'}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation();
  const [forecast, setForecast] = useState<FitScoreForecast | null>(null);
  const [todayMetrics, setTodayMetrics] = useState<DailyMetrics | null>(null);
  const [yesterdayMetrics, setYesterdayMetrics] = useState<YesterdayMetrics | null>(null);
  const [lastWeekMetrics, setLastWeekMetrics] = useState<LastWeekMetrics | null>(null);
  const [weeklyMetrics, setWeeklyMetrics] = useState<WeeklyMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [daysOfData, setDaysOfData] = useState<number | null>(null);

  // Trigger backfill once per day — fills last 34 days of missing WHOOP history silently in background
  const triggerBackfill = useCallback(async () => {
    try {
      const THROTTLE_MS = 24 * 60 * 60 * 1000; // once per day
      const lastRun = await AsyncStorage.getItem('lastBackfillRun_v2');
      if (lastRun && Date.now() - parseInt(lastRun) < THROTTLE_MS) {
        // Use cached coverage count from last run
        const cached = await AsyncStorage.getItem('whoopDaysOfData_v2');
        if (cached !== null) setDaysOfData(parseInt(cached));
        return;
      }
      const result = await apiRequest<{ daysWithData: number; hasFullMonth: boolean }>('/api/whoop/backfill', { method: 'POST' });
      setDaysOfData(result.daysWithData);
      await AsyncStorage.setItem('lastBackfillRun_v2', String(Date.now()));
      await AsyncStorage.setItem('whoopDaysOfData_v2', String(result.daysWithData));
    } catch {
      // Silently fail — non-critical background task
    }
  }, []);

  const CACHE_KEY = 'dashboard_cache_v3';

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      // ── 1. Show cached data instantly (stale-while-revalidate) ──────────────
      if (!isRefresh) {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          try {
            const cached = JSON.parse(raw);
            setForecast(cached.forecast ?? null);
            setTodayMetrics(cached.today ?? null);
            setYesterdayMetrics(cached.yesterday ?? null);
            setWeeklyMetrics(cached.weekly ?? null);
            setLastWeekMetrics(cached.lastWeek ?? null);
          } catch { /* ignore corrupt cache */ }
        } else {
          setLoading(true); // only show spinner on very first ever load
        }
      }

      // ── 2. Fetch all 5 in parallel ──────────────────────────────────────────
      const [forecastData, todayData, yesterdayData, weeklyData, lastWeekData] = await Promise.all([
        apiRequest<FitScoreForecast>('/api/fitscore/forecast').catch(() => null),
        apiRequest<DailyMetrics>('/api/whoop/today').catch(() => null),
        apiRequest<YesterdayMetrics>('/api/whoop/yesterday').catch(() => null),
        apiRequest<WeeklyMetrics>('/api/whoop/weekly').catch(() => null),
        apiRequest<LastWeekMetrics>('/api/whoop/lastweek').catch(() => null),
      ]);

      setForecast(forecastData);
      setTodayMetrics(todayData);
      setYesterdayMetrics(yesterdayData);
      setWeeklyMetrics(weeklyData);
      setLastWeekMetrics(lastWeekData);

      // ── 3. Persist fresh data for next launch ───────────────────────────────
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        forecast: forecastData,
        today: todayData,
        yesterday: yesterdayData,
        weekly: weeklyData,
        lastWeek: lastWeekData,
      })).catch(() => {});
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    triggerBackfill();
  }, [loadData, triggerBackfill]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  const calculateDelta = (today: number | undefined, yesterday: number | undefined): number | undefined => {
    if (today === undefined || yesterday === undefined || yesterday === 0) return undefined;
    const result = Math.round(((today - yesterday) / yesterday) * 100);
    return isFinite(result) && !isNaN(result) ? result : undefined;
  };

  // Guard any delta value (including server-computed ones) against Infinity/NaN
  const safeDelta = (v: number | undefined): number | undefined => {
    if (v === undefined || !isFinite(v) || isNaN(v)) return undefined;
    return v;
  };

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatUpdatedTime = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return 'Today';
  };

  // Calculate delta for absolute values (strain, HRV)
  const calculateAbsoluteDelta = (today: number | undefined | null, yesterday: number | undefined | null): number | undefined => {
    if (today == null || yesterday == null) return undefined;
    return Math.round((today - yesterday) * 10) / 10;
  };

  // HRV values below 10ms are sensor noise from WHOOP — filter them out before computing deltas
  const validHRV = (v: number | undefined | null): number | undefined =>
    (v != null && v >= 10) ? v : undefined;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Profile Button - Circular Avatar */}
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => navigation.navigate('Profile' as never)}
          activeOpacity={0.7}
        >
          <View style={styles.profileButtonInner}>
            <Ionicons name="person" size={20} color={colors.bgPrimary} />
          </View>
        </TouchableOpacity>

        {/* FitScore Forecast Header */}
        <View style={styles.forecastSection}>
          <Text style={styles.forecastTitle}>Today's FitScore Forecast</Text>

          {forecast && (() => {
            const { line1, line2 } = getDynamicForecastLines(forecast.forecast);
            return (
              <>
                <FitScorePulseRing score={forecast.forecast} />
                <View style={styles.forecastTextBlock}>
                  <Text style={styles.forecastLine1}>{line1}</Text>
                  <Text style={styles.forecastLine2}>{line2}</Text>
                </View>
              </>
            );
          })()}

          {!forecast && !loading && (
            <View style={styles.forecastPlaceholder}>
              <Text style={styles.placeholderText}>Loading forecast...</Text>
            </View>
          )}
        </View>

        {/* Today's Metrics */}
        <View style={styles.sectionBox}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccentBar} />
            <Text style={styles.sectionTitle}>TODAY'S METRICS</Text>
          </View>
          <View style={styles.metricRow}>
            <MetricCard
              icon="moon-outline"
              label="Sleep"
              value={todayMetrics?.sleep_score ? `${todayMetrics.sleep_score}%` : 'N/A'}
              delta={safeDelta(calculateDelta(todayMetrics?.sleep_score, yesterdayMetrics?.sleep_score))}
              borderColor={todayMetrics?.sleep_score ? getSleepColor(todayMetrics.sleep_score) : undefined}
              valueColor={todayMetrics?.sleep_score ? getSleepColor(todayMetrics.sleep_score) : undefined}
            />
            <MetricCard
              icon="heart-outline"
              label="Recovery"
              value={todayMetrics?.recovery_score ? `${todayMetrics.recovery_score}%` : 'N/A'}
              delta={safeDelta(calculateDelta(todayMetrics?.recovery_score, yesterdayMetrics?.recovery_score))}
              borderColor={todayMetrics?.recovery_score ? getRecoveryColor(todayMetrics.recovery_score) : undefined}
              valueColor={todayMetrics?.recovery_score ? getRecoveryColor(todayMetrics.recovery_score) : undefined}
            />
          </View>
          <View style={styles.metricRow}>
            <MetricCard
              icon="flame-outline"
              label="Strain"
              value={todayMetrics?.strain ? `${todayMetrics.strain.toFixed(1)}` : 'N/A'}
              delta={safeDelta(calculateAbsoluteDelta(todayMetrics?.strain, yesterdayMetrics?.strain))}
              borderColor={colors.textMuted}
              valueColor={colors.textMuted}
              neutralDelta={true}
            />
            <MetricCard
              icon="pulse-outline"
              label="HRV"
              value={todayMetrics?.hrv ? `${Math.round(todayMetrics.hrv)} ms` : 'N/A'}
              delta={safeDelta(calculateAbsoluteDelta(validHRV(todayMetrics?.hrv), validHRV(yesterdayMetrics?.hrv)))}
              borderColor={colors.textMuted}
              valueColor={colors.textMuted}
              neutralDelta={true}
            />
          </View>
        </View>

        {/* Yesterday's Metrics */}
        <View style={styles.sectionBox}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccentBar} />
            <Text style={styles.sectionTitle}>YESTERDAY'S METRICS</Text>
          </View>
          <View style={styles.metricRow}>
            <MetricCard
              icon="moon-outline"
              label="Sleep"
              value={yesterdayMetrics?.sleep_score ? `${yesterdayMetrics.sleep_score}%` : 'N/A'}
              delta={safeDelta(calculateDelta(yesterdayMetrics?.sleep_score, lastWeekMetrics?.sleep_score))}
              deltaLabel="vs. last week"
              borderColor={yesterdayMetrics?.sleep_score ? getSleepColor(yesterdayMetrics.sleep_score) : undefined}
              valueColor={yesterdayMetrics?.sleep_score ? getSleepColor(yesterdayMetrics.sleep_score) : undefined}
            />
            <MetricCard
              icon="heart-outline"
              label="Recovery"
              value={yesterdayMetrics?.recovery_score ? `${yesterdayMetrics.recovery_score}%` : 'N/A'}
              delta={safeDelta(calculateDelta(yesterdayMetrics?.recovery_score, lastWeekMetrics?.recovery_score))}
              deltaLabel="vs. last week"
              borderColor={yesterdayMetrics?.recovery_score ? getRecoveryColor(yesterdayMetrics.recovery_score) : undefined}
              valueColor={yesterdayMetrics?.recovery_score ? getRecoveryColor(yesterdayMetrics.recovery_score) : undefined}
            />
          </View>
          <View style={styles.metricRow}>
            <MetricCard
              icon="flame-outline"
              label="Strain"
              value={yesterdayMetrics?.strain ? `${yesterdayMetrics.strain.toFixed(1)}` : 'N/A'}
              delta={safeDelta(calculateAbsoluteDelta(yesterdayMetrics?.strain, lastWeekMetrics?.strain))}
              deltaLabel="vs. last week"
              borderColor={colors.textMuted}
              valueColor={colors.textMuted}
              neutralDelta={true}
            />
            <MetricCard
              icon="pulse-outline"
              label="HRV"
              value={yesterdayMetrics?.hrv ? `${Math.round(yesterdayMetrics.hrv)} ms` : 'N/A'}
              delta={safeDelta(calculateAbsoluteDelta(validHRV(yesterdayMetrics?.hrv), validHRV(lastWeekMetrics?.hrv)))}
              deltaLabel="vs. last week"
              borderColor={colors.textMuted}
              valueColor={colors.textMuted}
              neutralDelta={true}
            />
          </View>
        </View>

        {/* Data coverage notice — shown until monthly comparisons become available */}
        {weeklyMetrics?.comparison?.vs_last_month?.sleep_percent_delta === undefined && daysOfData !== null && daysOfData < 28 && (
          <View style={styles.coverageNotice}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.coverageNoticeText}>
              Wear WHOOP for at least a month to unlock all comparisons.{' '}
              <Text style={styles.coverageNoticeCount}>{daysOfData}/28 days synced.</Text>
            </Text>
          </View>
        )}

        {/* Weekly Averages */}
        <View style={styles.sectionBox}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccentBar} />
            <Text style={styles.sectionTitle}>WEEKLY AVERAGES</Text>
          </View>
          <View style={styles.metricRow}>
            <MetricCard
              icon="moon-outline"
              label="Avg Sleep"
              value={weeklyMetrics?.averages?.sleep_score_percent ? `${Math.round(weeklyMetrics.averages.sleep_score_percent)}%` : 'N/A'}
              delta={safeDelta(weeklyMetrics?.comparison?.vs_last_month?.sleep_percent_delta)}
              deltaLabel="vs. last month"
              borderColor={weeklyMetrics?.averages?.sleep_score_percent ? getSleepColor(weeklyMetrics.averages.sleep_score_percent) : undefined}
              valueColor={weeklyMetrics?.averages?.sleep_score_percent ? getSleepColor(weeklyMetrics.averages.sleep_score_percent) : undefined}
            />
            <MetricCard
              icon="heart-outline"
              label="Avg Recovery"
              value={weeklyMetrics?.averages?.recovery_score_percent ? `${Math.round(weeklyMetrics.averages.recovery_score_percent)}%` : 'N/A'}
              delta={safeDelta(weeklyMetrics?.comparison?.vs_last_month?.recovery_percent_delta)}
              deltaLabel="vs. last month"
              borderColor={weeklyMetrics?.averages?.recovery_score_percent ? getRecoveryColor(weeklyMetrics.averages.recovery_score_percent) : undefined}
              valueColor={weeklyMetrics?.averages?.recovery_score_percent ? getRecoveryColor(weeklyMetrics.averages.recovery_score_percent) : undefined}
            />
          </View>
          <View style={styles.metricRow}>
            <MetricCard
              icon="flame-outline"
              label="Avg Strain"
              value={weeklyMetrics?.averages?.strain_score ? `${weeklyMetrics.averages.strain_score.toFixed(1)}` : 'N/A'}
              delta={safeDelta(weeklyMetrics?.comparison?.vs_last_month?.strain_delta)}
              deltaLabel="vs. last month"
              borderColor={colors.textMuted}
              valueColor={colors.textMuted}
              neutralDelta={true}
            />
            <MetricCard
              icon="pulse-outline"
              label="Avg HRV"
              value={weeklyMetrics?.averages?.hrv_ms ? `${Math.round(weeklyMetrics.averages.hrv_ms)} ms` : 'N/A'}
              delta={safeDelta(weeklyMetrics?.averages?.hrv_ms && weeklyMetrics.averages.hrv_ms >= 10 ? weeklyMetrics?.comparison?.vs_last_month?.hrv_ms_delta : undefined)}
              deltaLabel="vs. last month"
              borderColor={colors.textMuted}
              valueColor={colors.textMuted}
              neutralDelta={true}
            />
          </View>
        </View>

        {/* FitCoach CTA */}
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => navigation.navigate('FitCoach' as never)}
        >
          <Text style={styles.chatButtonText}>Chat with FitCoach</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.bgPrimary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  profileButton: {
    width: 36,
    height: 36,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  profileButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + 80,
  },
  forecastSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  forecastTitle: {
    ...typography.h2,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  pulseRingContainer: {
    width: Math.min(180, SCREEN_WIDTH * 0.45),
    height: Math.min(180, SCREEN_WIDTH * 0.45),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  scoreInRing: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.accent,
  },
  forecastTextBlock: {
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  forecastLine1: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  forecastLine2: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    color: colors.textPrimary,
    opacity: 0.75,
    lineHeight: 20,
    opacity: 0.8,
  },
  forecastPlaceholder: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    ...typography.body,
    color: colors.textMuted,
  },
  sectionBox: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '40',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionAccentBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  sectionTitle: {
    ...typography.small,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.2,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricCardWrapper: {
    flex: 1,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    borderLeftWidth: 0,
    borderLeftColor: 'transparent',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricLabel: {
    ...typography.bodyMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  metricDelta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricDeltaText: {
    ...typography.small,
    fontSize: 10,
  },
  coverageNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '30',
  },
  coverageNoticeText: {
    ...typography.small,
    fontSize: 11,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 16,
  },
  coverageNoticeCount: {
    color: colors.accent,
    fontWeight: '600',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  chatButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '600',
  },
});
