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
import { apiRequest } from '../api/client';
import { colors, spacing, radii, typography, state } from '../theme';
import { Card } from '../ui/components';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, LinearGradient, Stop, Defs } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type FitScoreForecast = {
  forecast: number;
  factors: {
    sleep: string;
    recovery: string;
    strain: string;
  };
  insight: string;
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [forecastData, todayData, yesterdayData, weeklyData] = await Promise.all([
        apiRequest<FitScoreForecast>('/api/fitscore/forecast').catch(() => null),
        apiRequest<DailyMetrics>('/api/whoop/today').catch(() => null),
        apiRequest<YesterdayMetrics>('/api/whoop/yesterday').catch(() => null),
        apiRequest<WeeklyMetrics>('/api/whoop/weekly').catch(() => null),
      ]);

      setForecast(forecastData);
      setTodayMetrics(todayData);
      setYesterdayMetrics(yesterdayData);
      setWeeklyMetrics(weeklyData);

      // Try to load last week's metrics for yesterday comparison
      try {
        const lastWeekData = await apiRequest<LastWeekMetrics>('/api/whoop/lastweek');
        setLastWeekMetrics(lastWeekData);
      } catch (error) {
        console.log('No last week metrics available');
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const calculateDelta = (today: number | undefined, yesterday: number | undefined): number | undefined => {
    if (today === undefined || yesterday === undefined || yesterday === 0) return undefined;
    return Math.round(((today - yesterday) / yesterday) * 100);
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
  const calculateAbsoluteDelta = (today: number | undefined, yesterday: number | undefined): number | undefined => {
    if (today === undefined || yesterday === undefined) return undefined;
    return Math.round((today - yesterday) * 10) / 10;
  };

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

          {forecast && (
            <>
              <FitScorePulseRing score={forecast.forecast} />
              <Text style={styles.forecastInsight}>{forecast.insight}</Text>
              <Text style={styles.updatedTime}>
                Updated: {formatUpdatedTime(forecast.updatedAt)}
              </Text>
            </>
          )}

          {!forecast && !loading && (
            <View style={styles.forecastPlaceholder}>
              <Text style={styles.placeholderText}>Loading forecast...</Text>
            </View>
          )}
        </View>

        {/* Today's Metric Cards */}
        <View style={styles.metricsSection}>
          <View style={styles.metricRow}>
            <MetricCard
              icon="moon-outline"
              label="Sleep"
              value={todayMetrics?.sleep_score ? `${todayMetrics.sleep_score}%` : 'N/A'}
              delta={calculateDelta(todayMetrics?.sleep_score, yesterdayMetrics?.sleep_score)}
              borderColor={todayMetrics?.sleep_score ? getSleepColor(todayMetrics.sleep_score) : undefined}
              valueColor={todayMetrics?.sleep_score ? getSleepColor(todayMetrics.sleep_score) : undefined}
            />
            <MetricCard
              icon="heart-outline"
              label="Recovery"
              value={todayMetrics?.recovery_score ? `${todayMetrics.recovery_score}%` : 'N/A'}
              delta={calculateDelta(todayMetrics?.recovery_score, yesterdayMetrics?.recovery_score)}
              borderColor={todayMetrics?.recovery_score ? getRecoveryColor(todayMetrics.recovery_score) : undefined}
              valueColor={todayMetrics?.recovery_score ? getRecoveryColor(todayMetrics.recovery_score) : undefined}
            />
          </View>
          <View style={styles.metricRow}>
            <MetricCard
              icon="flame-outline"
              label="Strain"
              value={todayMetrics?.strain ? `${todayMetrics.strain.toFixed(1)}` : 'N/A'}
              delta={calculateAbsoluteDelta(todayMetrics?.strain, yesterdayMetrics?.strain)}
              borderColor={todayMetrics?.strain ? getStrainColor(todayMetrics.strain, todayMetrics?.recovery_score) : undefined}
              valueColor={todayMetrics?.strain ? getStrainColor(todayMetrics.strain, todayMetrics?.recovery_score) : undefined}
              neutralDelta={true}
            />
            <MetricCard
              icon="pulse-outline"
              label="HRV"
              value={todayMetrics?.hrv ? `${Math.round(todayMetrics.hrv)} ms` : 'N/A'}
              delta={calculateAbsoluteDelta(todayMetrics?.hrv, yesterdayMetrics?.hrv)}
              borderColor={colors.textMuted}
              valueColor={colors.textMuted}
              neutralDelta={true}
            />
          </View>
        </View>

        {/* Yesterday's Metrics */}
        <Text style={styles.sectionTitle}>YESTERDAY'S METRICS</Text>
        <View style={styles.metricsSection}>
          <View style={styles.metricRow}>
            <MetricCard
              icon="moon-outline"
              label="Sleep"
              value={yesterdayMetrics?.sleep_score ? `${yesterdayMetrics.sleep_score}%` : 'N/A'}
              delta={calculateDelta(yesterdayMetrics?.sleep_score, lastWeekMetrics?.sleep_score)}
              deltaLabel="vs. last week"
              borderColor={yesterdayMetrics?.sleep_score ? getSleepColor(yesterdayMetrics.sleep_score) : undefined}
              valueColor={yesterdayMetrics?.sleep_score ? getSleepColor(yesterdayMetrics.sleep_score) : undefined}
            />
            <MetricCard
              icon="heart-outline"
              label="Recovery"
              value={yesterdayMetrics?.recovery_score ? `${yesterdayMetrics.recovery_score}%` : 'N/A'}
              delta={calculateDelta(yesterdayMetrics?.recovery_score, lastWeekMetrics?.recovery_score)}
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
              delta={calculateAbsoluteDelta(yesterdayMetrics?.strain, lastWeekMetrics?.strain)}
              deltaLabel="vs. last week"
              borderColor={yesterdayMetrics?.strain ? getStrainColor(yesterdayMetrics.strain, yesterdayMetrics?.recovery_score) : undefined}
              valueColor={yesterdayMetrics?.strain ? getStrainColor(yesterdayMetrics.strain, yesterdayMetrics?.recovery_score) : undefined}
              neutralDelta={true}
            />
            <MetricCard
              icon="pulse-outline"
              label="HRV"
              value={yesterdayMetrics?.hrv ? `${Math.round(yesterdayMetrics.hrv)} ms` : 'N/A'}
              delta={calculateAbsoluteDelta(yesterdayMetrics?.hrv, lastWeekMetrics?.hrv)}
              deltaLabel="vs. last week"
              borderColor={colors.textMuted}
              valueColor={colors.textMuted}
              neutralDelta={true}
            />
          </View>
        </View>

        {/* Weekly Averages */}
        <Text style={styles.sectionTitle}>WEEKLY AVERAGES</Text>
        <View style={styles.metricsSection}>
          <View style={styles.metricRow}>
            <MetricCard
              icon="moon-outline"
              label="Avg Sleep"
              value={weeklyMetrics?.averages?.sleep_score_percent ? `${weeklyMetrics.averages.sleep_score_percent}%` : 'N/A'}
              delta={weeklyMetrics?.comparison?.vs_last_month?.sleep_percent_delta}
              deltaLabel="vs. last month"
              borderColor={weeklyMetrics?.averages?.sleep_score_percent ? getSleepColor(weeklyMetrics.averages.sleep_score_percent) : undefined}
              valueColor={weeklyMetrics?.averages?.sleep_score_percent ? getSleepColor(weeklyMetrics.averages.sleep_score_percent) : undefined}
            />
            <MetricCard
              icon="heart-outline"
              label="Avg Recovery"
              value={weeklyMetrics?.averages?.recovery_score_percent ? `${weeklyMetrics.averages.recovery_score_percent}%` : 'N/A'}
              delta={weeklyMetrics?.comparison?.vs_last_month?.recovery_percent_delta}
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
              delta={weeklyMetrics?.comparison?.vs_last_month?.strain_delta}
              deltaLabel="vs. last month"
              borderColor={weeklyMetrics?.averages?.strain_score ? getStrainColor(weeklyMetrics.averages.strain_score) : undefined}
              valueColor={weeklyMetrics?.averages?.strain_score ? getStrainColor(weeklyMetrics.averages.strain_score) : undefined}
              neutralDelta={true}
            />
            <MetricCard
              icon="pulse-outline"
              label="Avg HRV"
              value={weeklyMetrics?.averages?.hrv_ms ? `${Math.round(weeklyMetrics.averages.hrv_ms)} ms` : 'N/A'}
              delta={weeklyMetrics?.comparison?.vs_last_month?.hrv_ms_delta}
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
    marginBottom: spacing.md,
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
  forecastInsight: {
    ...typography.body,
    fontSize: 14,
    textAlign: 'center',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    lineHeight: 20,
  },
  updatedTime: {
    ...typography.small,
    color: colors.textMuted,
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
  sectionTitle: {
    ...typography.small,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  metricsSection: {
    marginBottom: spacing.sm,
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
