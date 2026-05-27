import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView, Alert, RefreshControl, Animated,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  getLeaderboard, leaveTeam,
  type LeaderboardResponse, type LeaderboardEntry, type AssessmentResponse, type CompetingResponse,
} from '../../api/teams';
import { colors, spacing, radii, typography, shadows } from '../../theme';

const ROW_HEIGHT = 80;

function medal(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

function scoreColor(avg: number): string {
  if (avg >= 7) return colors.success;
  if (avg >= 5) return colors.warning;
  return colors.danger;
}

function getWeekInfo(weekStart: string): { weekNumber: number; dayOfWeek: number } {
  const start = new Date(weekStart + 'T00:00:00');
  const diffDays = Math.floor((Date.now() - start.getTime()) / 86400000);
  return {
    weekNumber: Math.floor(diffDays / 7) + 1,
    dayOfWeek: Math.min(Math.max((diffDays % 7) + 1, 1), 7),
  };
}

type RowAnim = { translateY: Animated.Value; opacity: Animated.Value };

export default function TeamMainScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const teamId: number = route.params?.teamId;
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [rankDeltas, setRankDeltas] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const prevRanks = useRef<Map<string, number>>(new Map());
  const rowAnims = useRef<Map<string, RowAnim>>(new Map());

  const runRankAnimation = useCallback((entries: LeaderboardEntry[]) => {
    const deltas = new Map<string, number>();
    entries.forEach(e => {
      const prev = prevRanks.current.get(e.userId);
      const delta = prev !== undefined ? prev - e.rank : 0;
      deltas.set(e.userId, delta);

      const startY = prev !== undefined ? delta * ROW_HEIGHT : 40;
      const startOpacity = prev !== undefined ? 1 : 0;
      if (!rowAnims.current.has(e.userId)) {
        rowAnims.current.set(e.userId, {
          translateY: new Animated.Value(startY),
          opacity: new Animated.Value(startOpacity),
        });
      } else {
        const a = rowAnims.current.get(e.userId)!;
        a.translateY.setValue(startY);
        if (prev === undefined) a.opacity.setValue(0);
      }
    });

    setRankDeltas(deltas);

    const animations = entries.map(e => {
      const a = rowAnims.current.get(e.userId)!;
      return Animated.parallel([
        Animated.spring(a.translateY, { toValue: 0, tension: 55, friction: 11, useNativeDriver: true }),
        Animated.timing(a.opacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      ]);
    });
    Animated.stagger(70, animations).start();

    entries.forEach(e => prevRanks.current.set(e.userId, e.rank));
  }, []);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const result = await getLeaderboard(teamId);
      setData(result);
      if (result.phase === 'competing') {
        setTimeout(() => runRankAnimation(result.leaderboard), 80);
      }
    } catch (err: any) {
      console.error('[TeamMain] load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, runRankAnimation]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleLeave = () => {
    Alert.alert('Leave Team', 'Are you sure you want to leave this team?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
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
        <View style={styles.centered}><ActivityIndicator color={colors.accent} /></View>
      </SafeAreaView>
    );
  }
  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.mutedText}>Failed to load team data.</Text>
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
        {data.phase === 'assessment'
          ? <AssessmentView data={data as AssessmentResponse} />
          : <LeaderboardView data={data as CompetingResponse} rowAnims={rowAnims.current} rankDeltas={rankDeltas} />
        }
        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <Text style={styles.leaveBtnText}>Leave Team</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Assessment View ───────────────────────────────────────────────────────────

function AssessmentView({ data }: { data: AssessmentResponse }) {
  const { weekNumber, dayOfWeek } = getWeekInfo(data.weekStart);
  return (
    <View>
      <Text style={styles.screenTitle}>Assessment Week</Text>
      <WeekHeader weekNumber={weekNumber} dayOfWeek={dayOfWeek} />

      <View style={styles.assessmentCard}>
        <Ionicons name="eye-off-outline" size={22} color={colors.accent} style={{ marginBottom: spacing.sm }} />
        <Text style={styles.assessmentTitle}>Rankings hidden</Text>
        <Text style={styles.assessmentMessage}>
          Groups are revealed after week 1. Keep logging meals, training, and recovery every day.
        </Text>
        <View style={styles.daysRemainingRow}>
          <Ionicons name="time-outline" size={14} color={colors.accent} />
          <Text style={styles.daysRemainingText}>{data.daysRemaining} day{data.daysRemaining !== 1 ? 's' : ''} remaining</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>TEAM PROGRESS</Text>
      {data.progress.map(p => (
        <View key={p.userId} style={styles.progressRow}>
          <Text style={styles.progressName} numberOfLines={1}>{p.displayName ?? 'Athlete'}</Text>
          <View style={styles.progressDots}>
            {Array.from({ length: 7 }, (_, i) => (
              <View
                key={i}
                style={[styles.progressDot, i < p.daysLogged ? styles.progressDotFilled : null]}
              />
            ))}
          </View>
          <Text style={styles.progressCount}>{p.daysLogged}/7</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Leaderboard View ─────────────────────────────────────────────────────────

function LeaderboardView({
  data, rowAnims, rankDeltas,
}: {
  data: CompetingResponse;
  rowAnims: Map<string, RowAnim>;
  rankDeltas: Map<string, number>;
}) {
  const { weekNumber, dayOfWeek } = getWeekInfo(data.weekStart);
  const leaderAvg = data.leaderboard.find(e => e.rank === 1)?.weekAvg ?? 0;
  return (
    <View>
      <Text style={styles.screenTitle}>Leaderboard</Text>
      {data.groupName && <Text style={styles.groupBadge}>{data.groupName}</Text>}
      <WeekHeader weekNumber={weekNumber} dayOfWeek={dayOfWeek} />

      {data.leaderboard.map(entry => {
        const anim = rowAnims.get(entry.userId);
        const delta = rankDeltas.get(entry.userId) ?? 0;
        const medalIcon = medal(entry.rank);
        const leaderPct = Math.min(leaderAvg / 10, 1) * 100;

        const row = (
          <View key={entry.userId} style={[styles.leaderRow, entry.isYou && styles.leaderRowYou]}>
            {/* Rank / Medal */}
            <View style={styles.rankCol}>
              {medalIcon ? (
                <Text style={styles.medalEmoji}>{medalIcon}</Text>
              ) : (
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{entry.rank}</Text>
                </View>
              )}
              {delta !== 0 && (
                <View style={styles.deltaWrap}>
                  <Ionicons
                    name={delta > 0 ? 'caret-up' : 'caret-down'}
                    size={10}
                    color={delta > 0 ? colors.success : colors.warning}
                  />
                </View>
              )}
            </View>

            {/* Name + bar + score all in one column */}
            <View style={styles.leaderInfo}>
              <View style={styles.nameRow}>
                <Text style={[styles.leaderName, entry.isYou && styles.leaderNameYou]} numberOfLines={1}>
                  {entry.displayName ?? 'Athlete'}
                </Text>
                {entry.isYou && <View style={styles.youChip}><Text style={styles.youChipText}>YOU</Text></View>}
              </View>
              {/* Bar + score in one row */}
              <View style={styles.scoreBarRow}>
                <Text style={styles.scoreBarLabel}>AVG</Text>
                <View style={styles.scoreBarWrapper}>
                  <View style={styles.scoreBarTrack}>
                    <View style={[styles.scoreBarFill, {
                      width: `${Math.min(entry.weekAvg / 10, 1) * 100}%` as any,
                      backgroundColor: scoreColor(entry.weekAvg),
                      opacity: entry.isYou ? 1 : 0.7,
                    }]} />
                  </View>
                  {entry.rank !== 1 && leaderAvg > 0 && (
                    <View style={[styles.leaderMark, { left: `${leaderPct}%` as any }]} />
                  )}
                </View>
                <Text style={[styles.leaderScore, { color: scoreColor(entry.weekAvg) }]}>
                  {entry.weekAvg.toFixed(1)}
                </Text>
                <Text style={styles.scoreDenom}>/10</Text>
              </View>
              {entry.cheatDate && (
                <Text style={styles.cheatDayText}>Cheat day used</Text>
              )}
            </View>
          </View>
        );

        if (anim) {
          return (
            <Animated.View
              key={entry.userId}
              style={{ transform: [{ translateY: anim.translateY }], opacity: anim.opacity }}
            >
              {row}
            </Animated.View>
          );
        }
        return row;
      })}
    </View>
  );
}

// ─── Week Header ──────────────────────────────────────────────────────────────

function WeekHeader({ weekNumber, dayOfWeek }: { weekNumber: number; dayOfWeek: number }) {
  return (
    <View style={styles.weekHeader}>
      <Text style={styles.weekLabel}>Week {weekNumber} · Day {dayOfWeek} of 7</Text>
      <View style={styles.weekDots}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={[styles.weekDot, i < dayOfWeek ? styles.weekDotFilled : null]} />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  screenTitle: { ...typography.h1, marginBottom: spacing.xs },
  mutedText: { ...typography.bodyMuted },

  // Week header
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  weekLabel: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  weekDots: { flexDirection: 'row', gap: 5 },
  weekDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceMute,
  },
  weekDotFilled: { backgroundColor: colors.accent },

  // Group badge
  groupBadge: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: spacing.sm,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Leaderboard row
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    ...shadows.card,
  },
  leaderRowYou: {
    borderColor: colors.accent + '50',
    backgroundColor: colors.accent + '0D',
  },

  // Rank column
  rankCol: {
    width: 44,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  medalEmoji: {
    fontSize: 28,
    lineHeight: 32,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMute + '50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { color: colors.textMuted, fontWeight: '800', fontSize: 13 },
  deltaWrap: { marginTop: 2 },

  // Player info
  leaderInfo: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  leaderName: { ...typography.body, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  leaderNameYou: { color: colors.accent },
  youChip: {
    backgroundColor: colors.accent + '25',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  youChipText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  scoreBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  scoreBarLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.6,
    flexShrink: 0,
  },
  scoreBarWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  scoreBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceMute + '60',
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: 4,
    borderRadius: 2,
  },
  leaderMark: {
    position: 'absolute',
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
    marginLeft: -1,
    top: -4,
  },
  cheatDayText: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 1,
  },

  leaderScore: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, lineHeight: 22 },
  scoreDenom: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },

  // Assessment
  assessmentCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent + '20',
    ...shadows.card,
  },
  assessmentTitle: { ...typography.title, marginBottom: spacing.xs },
  assessmentMessage: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  daysRemainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent + '15',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  daysRemainingText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  sectionLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  progressName: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '500',
    width: 110,
    flexShrink: 0,
  },
  progressDots: { flexDirection: 'row', gap: 5, flex: 1 },
  progressDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.surfaceMute,
  },
  progressDotFilled: { backgroundColor: colors.accent },
  progressCount: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'right',
  },

  // Footer
  leaveBtn: { marginTop: spacing.xl, alignItems: 'center', paddingVertical: spacing.sm },
  leaveBtnText: { color: colors.textMuted, fontSize: 14 },
  retryBtn: { marginTop: spacing.md },
  retryText: { color: colors.accent },
});
