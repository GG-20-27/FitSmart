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
import Svg, { Circle, Path, LinearGradient, Stop, Defs } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

type CalendarEvent = {
  title: string;
  start: string;
  location?: string;
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

// Metric Card with trend indicator
function MetricCard({
  icon,
  label,
  value,
  delta,
  onPress,
  isStrain,
}: {
  icon: string;
  label: string;
  value: string;
  delta?: number;
  onPress?: () => void;
  isStrain?: boolean;
}) {
  // For strain, no color coding (neutral). For other metrics, use color coding
  const deltaColor = isStrain
    ? colors.textMuted
    : (delta && delta > 0 ? state.ready : delta && delta < 0 ? state.rest : colors.textMuted);
  const deltaIcon = delta && delta > 0 ? 'arrow-up' : delta && delta < 0 ? 'arrow-down' : 'remove';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <Card style={styles.metricCard}>
        <View style={styles.metricHeader}>
          <Ionicons name={icon as any} size={22} color={colors.accent} />
          <Text style={styles.metricLabel}>{label}</Text>
        </View>
        <Text style={styles.metricValue}>{value}</Text>
        {delta !== undefined && (
          <View style={styles.metricDelta}>
            <Ionicons name={deltaIcon as any} size={12} color={deltaColor} />
            <Text style={[styles.metricDeltaText, { color: deltaColor }]}>
              vs. yesterday: {delta > 0 ? '+' : ''}{delta}%
            </Text>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation();
  const [forecast, setForecast] = useState<FitScoreForecast | null>(null);
  const [todayMetrics, setTodayMetrics] = useState<DailyMetrics | null>(null);
  const [yesterdayMetrics, setYesterdayMetrics] = useState<YesterdayMetrics | null>(null);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [forecastData, todayData, yesterdayData] = await Promise.all([
        apiRequest<FitScoreForecast>('/api/fitscore/forecast'),
        apiRequest<DailyMetrics>('/api/whoop/today'),
        apiRequest<YesterdayMetrics>('/api/whoop/yesterday').catch(() => null),
      ]);

      setForecast(forecastData);
      setTodayMetrics(todayData);
      setYesterdayMetrics(yesterdayData);

      // Try to load today's calendar event
      try {
        const today = new Date().toISOString().split('T')[0];
        const calendarData = await apiRequest<{ events: CalendarEvent[] }>(
          `/api/calendar/events?start=${today}&end=${today}`
        );
        if (calendarData.events && calendarData.events.length > 0) {
          setNextEvent(calendarData.events[0]);
        }
      } catch (error) {
        console.log('No calendar events available');
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Home</Text>
      </View>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
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

      {/* Daily Metric Cards */}
      <View style={styles.metricsSection}>
        <View style={styles.metricRow}>
          <MetricCard
            icon="moon-outline"
            label="Sleep"
            value={todayMetrics?.sleep_hours ? `${todayMetrics.sleep_hours.toFixed(1)}h` : 'N/A'}
            delta={calculateDelta(todayMetrics?.sleep_score, yesterdayMetrics?.sleep_score)}
          />
          <MetricCard
            icon="fitness-outline"
            label="Recovery"
            value={todayMetrics?.recovery_score ? `${todayMetrics.recovery_score}%` : 'N/A'}
            delta={calculateDelta(todayMetrics?.recovery_score, yesterdayMetrics?.recovery_score)}
          />
        </View>
        <View style={styles.metricRow}>
          <MetricCard
            icon="flame-outline"
            label="Strain"
            value={todayMetrics?.strain ? `${todayMetrics.strain.toFixed(1)}` : 'N/A'}
            delta={calculateDelta(todayMetrics?.strain, yesterdayMetrics?.strain)}
            isStrain={true}
          />
          <MetricCard
            icon="pulse-outline"
            label="HRV"
            value={todayMetrics?.hrv ? `${Math.round(todayMetrics.hrv)} ms` : 'N/A'}
            delta={calculateDelta(todayMetrics?.hrv, yesterdayMetrics?.hrv)}
          />
        </View>
      </View>

      {/* Coach Insight Tile */}
      <Card style={styles.coachInsight}>
        <View style={styles.coachHeader}>
          <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.accent} />
          <Text style={styles.coachTitle}>Coach Insight</Text>
        </View>
        <Text style={styles.coachText}>
          {forecast?.insight || 'Your daily insight will appear here based on your metrics.'}
        </Text>
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => navigation.navigate('Coach' as never)}
        >
          <Text style={styles.chatButtonText}>Chat with Coach</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.bgPrimary} />
        </TouchableOpacity>
      </Card>

      {/* Calendar Preview */}
      {nextEvent && (
        <Card style={styles.calendarPreview}>
          <View style={styles.calendarHeader}>
            <Ionicons name="calendar-outline" size={24} color={colors.accent} />
            <Text style={styles.calendarTitle}>Next Event</Text>
          </View>
          <View style={styles.eventDetails}>
            <Text style={styles.eventTitle}>{nextEvent.title}</Text>
            <View style={styles.eventMeta}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={styles.eventTime}>{formatTime(nextEvent.start)}</Text>
              {nextEvent.location && (
                <>
                  <Ionicons name="location-outline" size={16} color={colors.textMuted} style={{ marginLeft: spacing.md }} />
                  <Text style={styles.eventLocation}>{nextEvent.location}</Text>
                </>
              )}
            </View>
          </View>
        </Card>
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgPrimary,
    borderBottomWidth: 0,
  },
  headerTitle: {
    ...typography.h1,
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + 60, // Extra padding for tab bar
  },
  forecastSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  forecastTitle: {
    ...typography.h2,
    fontSize: 22,
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
    fontSize: 15,
    textAlign: 'center',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    lineHeight: 22,
  },
  updatedTime: {
    ...typography.small,
    color: colors.textMuted,
  },
  forecastPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    ...typography.body,
    color: colors.textMuted,
  },
  metricsSection: {
    marginBottom: spacing.lg,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricCard: {
    flex: 1,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricLabel: {
    ...typography.bodyMuted,
    fontWeight: '600',
  },
  metricValue: {
    ...typography.h2,
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  metricDelta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricDeltaText: {
    ...typography.small,
    fontSize: 11,
  },
  coachInsight: {
    marginBottom: spacing.lg,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  coachTitle: {
    ...typography.title,
  },
  coachText: {
    ...typography.body,
    lineHeight: 24,
    marginBottom: spacing.lg,
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
  },
  chatButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '600',
  },
  calendarPreview: {
    marginBottom: spacing.xl,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  calendarTitle: {
    ...typography.title,
  },
  eventDetails: {
    gap: spacing.sm,
  },
  eventTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  eventTime: {
    ...typography.bodyMuted,
  },
  eventLocation: {
    ...typography.bodyMuted,
  },
});
