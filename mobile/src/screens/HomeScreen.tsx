import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { apiRequest } from '../api/client';
import { colors, spacing, radii, typography } from '../theme';
import { Card } from '../ui/components';

type WhoopTodayResponse = {
  sleep_score?: number | null;
  recovery_score?: number | null;
  strain?: number | null;
  hrv?: number | null;
  sleep_hours?: number | null;
  resting_heart_rate?: number | null;
};

type WhoopYesterdayResponse = {
  sleep_score?: number | null;
  recovery_score?: number | null;
  strain?: number | null;
  hrv?: number | null;
  comparison?: {
    vs_last_week?: {
      sleep_percent_delta?: number | null;
      recovery_percent_delta?: number | null;
      strain_delta?: number | null;
      hrv_ms_delta?: number | null;
    };
  };
};

type WhoopWeeklyResponse = {
  averages?: {
    sleep_score_percent?: number | null;
    recovery_score_percent?: number | null;
    strain_score?: number | null;
    hrv_ms?: number | null;
  };
  comparison?: {
    vs_last_month?: {
      sleep_percent_delta?: number | null;
      recovery_percent_delta?: number | null;
      strain_delta?: number | null;
      hrv_ms_delta?: number | null;
    };
  };
};


export default function HomeScreen() {
  const [today, setToday] = useState<WhoopTodayResponse | null>(null);
  const [yesterday, setYesterday] = useState<WhoopYesterdayResponse | null>(null);
  const [weekly, setWeekly] = useState<WhoopWeeklyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [todayRes, yesterdayRes, weeklyRes] = await Promise.all([
        apiRequest<WhoopTodayResponse>('/api/whoop/today'),
        apiRequest<WhoopYesterdayResponse>('/api/whoop/yesterday'),
        apiRequest<WhoopWeeklyResponse>('/api/whoop/weekly'),
      ]);
    

      console.log('[HomeScreen] Weekly response:', weeklyRes);
      console.log('[HomeScreen] Weekly comparison:', weeklyRes?.comparison);
      console.log('[HomeScreen] Yesterday response:', yesterdayRes);
      console.log('[HomeScreen] Yesterday comparison:', yesterdayRes?.comparison);
      setToday(todayRes);
      setYesterday(yesterdayRes);
      setWeekly(weeklyRes);
    } catch (e) {
      console.warn('Failed to load dashboard data', e);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={styles.header}>FitScore Health Dashboard</Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Today's Health Metrics</Text>
      <View style={styles.cardRow}>
        <MetricCard label="Sleep Score" value={percentOrNA(today?.sleep_score)} />
        <MetricCard label="Recovery" value={percentOrNA(today?.recovery_score)} />
      </View>
      <View style={styles.cardRow}>
        <MetricCard label="Strain" value={strainOrNA(today?.strain)} />
        <MetricCard label="HRV" value={msOrNA(today?.hrv)} />
      </View>
      <View style={styles.cardRow}>
        <MetricCard label="Sleep Hours" value={hoursOrNA(today?.sleep_hours)} />
        <MetricCard label="Resting HR" value={numberOrNA(today?.resting_heart_rate)} />
      </View>

      <Text style={styles.sectionTitle}>Yesterday's Metrics</Text>
      <View style={styles.cardRow}>
        <MetricCard
          label="Sleep Score"
          value={percentOrNA(yesterday?.sleep_score)}
          subtitle={formatDeltaLastWeek(yesterday?.comparison?.vs_last_week?.sleep_percent_delta, '%')}
        />
        <MetricCard
          label="Recovery"
          value={percentOrNA(yesterday?.recovery_score)}
          subtitle={formatDeltaLastWeek(yesterday?.comparison?.vs_last_week?.recovery_percent_delta, '%')}
        />
      </View>
      <View style={styles.cardRow}>
        <MetricCard
          label="Strain"
          value={strainOrNA(yesterday?.strain)}
          subtitle={formatStrainDeltaLastWeek(yesterday?.comparison?.vs_last_week?.strain_delta)}
        />
        <MetricCard
          label="HRV"
          value={msOrNA(yesterday?.hrv)}
          subtitle={formatDeltaLastWeek(yesterday?.comparison?.vs_last_week?.hrv_ms_delta, ' ms')}
        />
      </View>

      <Text style={styles.sectionTitle}>Weekly Averages</Text>
      <View style={styles.cardRow}>
        <MetricCard
          label="Avg Sleep"
          value={percentOrNA(weekly?.averages?.sleep_score_percent)}
          subtitle={formatDelta(weekly?.comparison?.vs_last_month?.sleep_percent_delta, '%')}
        />
        <MetricCard
          label="Avg Recovery"
          value={percentOrNA(weekly?.averages?.recovery_score_percent)}
          subtitle={formatDelta(weekly?.comparison?.vs_last_month?.recovery_percent_delta, '%')}
        />
      </View>
      <View style={styles.cardRow}>
        <MetricCard
          label="Avg Strain"
          value={strainOrNA(weekly?.averages?.strain_score)}
          subtitle={formatStrainDelta(weekly?.comparison?.vs_last_month?.strain_delta)}
        />
        <MetricCard
          label="Avg HRV"
          value={msOrNA(weekly?.averages?.hrv_ms)}
          subtitle={formatDelta(weekly?.comparison?.vs_last_month?.hrv_ms_delta, ' ms')}
        />
      </View>


      <Text style={styles.footerNote}>Pull to refresh</Text>
    </ScrollView>
  );
}

function percentOrNA(v?: number | null) {
  if (v === null || v === undefined) return 'N/A';
  const rounded = Math.round(Math.min(Math.max(v, 0), 100));
  console.log(`[percentOrNA] Input: ${v}, Rounded: ${rounded}`);
  return `${rounded}%`;
}
function numberOrNA(v?: number | null) {
  if (v === null || v === undefined) return 'N/A';
  return `${v}`;
}

function strainOrNA(v?: number | null) {
  if (v === null || v === undefined) return 'N/A';
  const rounded = Math.round(v * 10) / 10;
  const result = rounded % 1 === 0 ? `${Math.round(rounded)}` : `${rounded}`;
  console.log(`[strainOrNA] Input: ${v}, Rounded: ${rounded}, Result: ${result}`);
  return result;
}
function msOrNA(v?: number | null) {
  if (v === null || v === undefined) return 'N/A';
  return `${Math.round(v * 10) / 10} ms`;
}
function hoursOrNA(v?: number | null) {
  if (v === null || v === undefined) return 'N/A';
  return `${v} hrs`;
}

function formatDelta(delta?: number | null, suffix: string = '') {
  console.log('[formatDelta] called with:', delta, suffix);
  if (delta === null || delta === undefined) {
    console.log('[formatDelta] returning undefined');
    return undefined;
  }
  const sign = delta > 0 ? '+' : '';
  const rounded = Math.round(delta);
  const result = `${sign}${rounded}${suffix} vs last month`;
  console.log('[formatDelta] returning:', result);
  return result;
}

function formatStrainDelta(delta?: number | null) {
  if (delta === null || delta === undefined) return undefined;
  const sign = delta > 0 ? '+' : '';
  const rounded = Math.round(delta * 10) / 10;
  const displayValue = rounded % 1 === 0 ? Math.round(rounded) : rounded;
  return `${sign}${displayValue} vs last month`;
}

function formatDeltaLastWeek(delta?: number | null, suffix: string = '') {
  if (delta === null || delta === undefined) return undefined;
  const sign = delta > 0 ? '+' : '';
  const rounded = Math.round(delta);
  return `${sign}${rounded}${suffix} vs last week`;
}

function formatStrainDeltaLastWeek(delta?: number | null) {
  if (delta === null || delta === undefined) return undefined;
  const sign = delta > 0 ? '+' : '';
  const rounded = Math.round(delta * 10) / 10;
  const displayValue = rounded % 1 === 0 ? Math.round(rounded) : rounded;
  return `${sign}${displayValue} vs last week`;
}

function MetricCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <Card style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardValue}>{value}</Text>
      {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
    </Card>
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
  sectionTitle: {
    ...typography.title,
    color: colors.textMuted,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  card: {
    flex: 1,
  },
  cardLabel: {
    ...typography.small,
  },
  cardValue: {
    ...typography.h1,
    marginTop: 4,
  },
  cardSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: colors.danger + '20',
    borderColor: colors.danger,
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  footerNote: {
    ...typography.small,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
});
