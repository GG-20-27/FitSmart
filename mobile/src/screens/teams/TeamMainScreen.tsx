import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { getLeaderboard, leaveTeam, type LeaderboardResponse } from '../../api/teams';
import { colors, spacing, radii, typography } from '../../theme';

export default function TeamMainScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const teamId: number = route.params?.teamId;
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const result = await getLeaderboard(teamId);
      setData(result);
    } catch (err: any) {
      console.error('[TeamMain] load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleLeave = () => {
    Alert.alert('Leave Team', 'Are you sure you want to leave this team?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveTeam();
            (global as any).refreshTeamStatus?.();
            navigation.replace('TeamLanding');
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to leave team');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={typography.bodyMuted}>Failed to load team data.</Text>
          <TouchableOpacity onPress={() => load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        {data.phase === 'assessment' ? (
          <AssessmentView />
        ) : (
          <LeaderboardView data={data} />
        )}

        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <Text style={styles.leaveBtnText}>Leave Team</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function AssessmentView() {
  return (
    <View>
      <Text style={styles.screenTitle}>Assessment Week</Text>
      <View style={styles.assessmentCard}>
        <Text style={styles.assessmentMessage}>
          Groups will be revealed after the first week of logging. Keep logging your meals, training, and recovery every day.
        </Text>
      </View>
    </View>
  );
}

function LeaderboardView({ data }: { data: Extract<LeaderboardResponse, { phase: 'competing' }> }) {
  return (
    <View>
      <Text style={styles.screenTitle}>Leaderboard</Text>
      {data.groupName && (
        <Text style={styles.groupBadge}>{data.groupName}</Text>
      )}

      {data.leaderboard.map((entry) => (
        <View key={entry.userId} style={[styles.leaderRow, entry.isYou && styles.leaderRowYou]}>
          <View style={[styles.rankBadge, entry.rank === 1 && styles.rankBadgeFirst]}>
            <Text style={styles.rankText}>#{entry.rank}</Text>
          </View>
          <View style={styles.leaderInfo}>
            <Text style={[styles.leaderName, entry.isYou && styles.leaderNameYou]}>
              {entry.displayName}{entry.isYou ? ' (you)' : ''}
            </Text>
            {entry.isYou && entry.cheatUsed && (
              <Text style={styles.cheatTag}>Cheat day used</Text>
            )}
          </View>
          <Text style={[styles.leaderScore, entry.isYou && styles.leaderScoreYou]}>
            {entry.weekAvg.toFixed(1)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...typography.h1, marginBottom: spacing.xs },
  assessmentCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  assessmentMessage: { ...typography.body, lineHeight: 24, color: colors.textMuted },
  groupBadge: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: spacing.lg,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  leaderRowYou: {
    borderColor: colors.accent + '60',
    backgroundColor: colors.accent + '10',
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMute + '60',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rankBadgeFirst: { backgroundColor: colors.accent + '30' },
  rankText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  leaderInfo: { flex: 1 },
  leaderName: { ...typography.body, fontSize: 15 },
  leaderNameYou: { color: colors.accent, fontWeight: '700' },
  cheatTag: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  leaderScore: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  leaderScoreYou: { color: colors.accent },
  leaveBtn: { marginTop: spacing.xl, alignItems: 'center' },
  leaveBtnText: { color: colors.textMuted, fontSize: 14 },
  retryBtn: { marginTop: spacing.md },
  retryText: { color: colors.accent },
});
