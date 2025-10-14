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
};

type WhoopWeeklyResponse = {
  avg_sleep?: number | null;
  avg_recovery?: number | null;
  avg_strain?: number | null;
  avg_hrv?: number | null;
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
        <MetricCard label="Sleep Score" value={percentOrNA(yesterday?.sleep_score)} />
        <MetricCard label="Recovery" value={percentOrNA(yesterday?.recovery_score)} />
      </View>
      <View style={styles.cardRow}>
        <MetricCard label="Strain" value={strainOrNA(yesterday?.strain)} />
        <MetricCard label="HRV" value={msOrNA(yesterday?.hrv)} />
      </View>

      <Text style={styles.sectionTitle}>Weekly Averages</Text>
      <View style={styles.cardRow}>
        <MetricCard label="Avg Sleep" value={percentOrNA(weekly?.avg_sleep)} />
        <MetricCard label="Avg Recovery" value={percentOrNA(weekly?.avg_recovery)} />
      </View>
      <View style={styles.cardRow}>
        <MetricCard label="Avg Strain" value={strainOrNA(weekly?.avg_strain)} />
        <MetricCard label="Avg HRV" value={msOrNA(weekly?.avg_hrv)} />
      </View>


      <Text style={styles.footerNote}>Pull to refresh</Text>
    </ScrollView>
  );
}

function percentOrNA(v?: number | null) {
  if (v === null || v === undefined) return 'N/A';
  return `${Math.round(Math.min(Math.max(v, 0), 100))}%`;
}
function numberOrNA(v?: number | null) {
  if (v === null || v === undefined) return 'N/A';
  return `${v}`;
}

function strainOrNA(v?: number | null) {
  if (v === null || v === undefined) return 'N/A';
  return `${Math.round(v * 10) / 10}`; // Round to 1 decimal place
}
function msOrNA(v?: number | null) {
  if (v === null || v === undefined) return 'N/A';
  return `${Math.round(v * 10) / 10} ms`;
}
function hoursOrNA(v?: number | null) {
  if (v === null || v === undefined) return 'N/A';
  return `${v} hrs`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardValue}>{value}</Text>
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
