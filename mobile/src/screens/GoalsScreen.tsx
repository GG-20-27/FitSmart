import React, { useState, useCallback, useEffect, useRef } from 'react';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Animated,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, typography, radii } from '../theme';
import { Card } from '../ui/components';
import { apiRequest, getIsAdmin } from '../api/client';
import {
  getImprovementPlanStatus,
  getPlanContent,
  generateFitCookMealPlan,
  PILLAR_LABELS,
  type ImprovementPlanStatus,
  type PlanContent,
} from '../api/improvementPlan';
import {
  getUserContext, saveUserContext,
  type UserContext,
  DEFAULTS as CTX_DEFAULTS,
  TIER1_GOALS, TIER1_GOAL_DESCRIPTIONS, TIER1_PRIORITIES,
  TIER2_PHASES, TIER2_DIET_PHASES, TIER2_EMPHASIS,
  INJURY_TYPES, BODY_REGIONS, REHAB_STAGES,
  TIER3_WEEK_LOADS, TIER3_STRESS_LEVELS, TIER3_SLEEP_EXPECTATIONS,
  WORK_HOURS_OPTIONS, TRAINING_SESSIONS_OPTIONS,
} from '../api/context';

type GoalCategory = 'Recovery' | 'Training' | 'Nutrition' | 'Mindset';

type Microhabit = {
  text: string;
  done: boolean;
  impact: number;
  isSubgoal?: boolean; // if true, stored as a sub-goal (milestone), not a daily habit
};

type Subgoal = {
  text: string;
  done: boolean;
};

type Goal = {
  id: string;
  title: string;
  emoji: string;
  category: GoalCategory;
  progress: number;
  streak: number;
  microhabits: Microhabit[]; // daily habits — streak & progress tracked
  subgoals: Subgoal[];       // milestone to-dos — checked off, not streak-based
  createdAt: string;
};

const STORAGE_KEY = '@fitsmart_goals';

const categoryColors: Record<GoalCategory, string> = {
  Recovery: '#27E9B5',
  Training: '#6B5BFD',
  Nutrition: '#F9A825',
  Mindset: '#FF5F56',
};

const categoryEmojis: Record<GoalCategory, string> = {
  Recovery: '💤',
  Training: '🏋️',
  Nutrition: '🥗',
  Mindset: '🧠',
};

const fitCookMarkdownStyles = {
  body: { color: colors.textPrimary, fontSize: 14, lineHeight: 22 },
  heading1: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' as const, marginTop: 16, marginBottom: 6 },
  heading2: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' as const, marginTop: 14, marginBottom: 4 },
  heading3: { color: colors.accent, fontSize: 14, fontWeight: '600' as const, marginTop: 10, marginBottom: 2 },
  strong: { fontWeight: '700' as const, color: colors.textPrimary },
  em: { fontStyle: 'italic' as const },
  bullet_list: { marginBottom: 6 },
  ordered_list: { marginBottom: 6 },
  list_item: { marginBottom: 2 },
  hr: { backgroundColor: colors.surfaceMute, height: 1, marginVertical: 12 },
  code_block: { backgroundColor: colors.bgSecondary, borderRadius: 6, padding: 10, fontSize: 12 },
  code_inline: { backgroundColor: colors.bgSecondary, borderRadius: 4, paddingHorizontal: 4, fontSize: 12 },
};

export default function GoalsScreen() {
  const navigation = useNavigation();
  const scrollViewRef = useRef<ScrollView>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [totalStreak, setTotalStreak] = useState(0);
  const [avgFitScore, setAvgFitScore] = useState(0);
  const [fitScoreDelta, setFitScoreDelta] = useState(0);

  // Admin gate
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { getIsAdmin().then(setIsAdmin); }, []);

  // Improvement Plan state
  const [improvementPlanStatus, setImprovementPlanStatus] = useState<ImprovementPlanStatus | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planContent, setPlanContent] = useState<PlanContent | null>(null);
  // FitCook state
  const [showFitCookModal, setShowFitCookModal] = useState(false);
  const [fitCookFlexible, setFitCookFlexible] = useState(false);
  const [fitCookWindows, setFitCookWindows] = useState({
    breakfast: { from: '07:00', until: '09:00' },
    lunch: { from: '12:00', until: '14:00' },
    dinner: { from: '18:00', until: '20:00' },
  });
  const [fitCookPrefs, setFitCookPrefs] = useState('');
  const [fitCookAllergies, setFitCookAllergies] = useState('');
  const [fitCookLoading, setFitCookLoading] = useState(false);
  const [fitCookResult, setFitCookResult] = useState<string | null>(null);
  const [fitCookCopied, setFitCookCopied] = useState(false);

  const normalizeTime = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return raw;
    if (digits.length <= 2) {
      const h = parseInt(digits, 10);
      return `${String(h).padStart(2, '0')}:00`;
    }
    const h = parseInt(digits.slice(0, -2), 10);
    const m = parseInt(digits.slice(-2), 10);
    const clampedM = Math.min(m, 59);
    return `${String(h).padStart(2, '0')}:${String(clampedM).padStart(2, '0')}`;
  };

  const handleOpenPlanModal = async (pillar: string) => {
    setShowPlanModal(true);
    if (!planContent) {
      try {
        const content = await getPlanContent(pillar);
        setPlanContent(content);
      } catch {}
    }
  };

  // User context state
  const [context, setContext] = useState<UserContext>(CTX_DEFAULTS);

  const loadContext = useCallback(async () => {
    try {
      const ctx = await getUserContext();
      setContext(ctx);
    } catch {
      // keep defaults
    }
  }, []);

  const updateContextField = useCallback(async (
    field: keyof UserContext,
    value: string | null,
  ) => {
    const updated = { ...context, [field]: value };
    setContext(updated);
    try {
      await saveUserContext(updated);
    } catch {
      // silent fail
    }
  }, [context]);

  const updateContextBatch = useCallback(async (updates: Partial<UserContext>) => {
    const updated = { ...context, ...updates };
    setContext(updated);
    try {
      await saveUserContext(updated);
    } catch {
      // silent fail
    }
  }, [context]);

  // Load goals from backend, fallback to local storage
  const loadGoals = useCallback(async () => {
    try {
      const serverGoals = await apiRequest<any[]>('/api/goals');
      if (serverGoals && serverGoals.length > 0) {
        const mapped: Goal[] = serverGoals.map((g: any) => {
          const allItems: Microhabit[] = g.microhabits
            ? (typeof g.microhabits === 'string' ? JSON.parse(g.microhabits) : g.microhabits)
            : [];
          return {
            id: String(g.id),
            title: g.title,
            emoji: g.emoji || '🎯',
            category: g.category as GoalCategory,
            progress: g.progress || 0,
            streak: g.streak || 0,
            microhabits: allItems.filter(h => !h.isSubgoal),
            subgoals: allItems.filter(h => h.isSubgoal).map(h => ({ text: h.text, done: h.done })),
            createdAt: g.createdAt || new Date().toISOString(),
          };
        });
        setGoals(mapped);
        calculateTotalStreak(mapped);
        // Cache locally
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
        console.log(`[GOALS] Loaded ${mapped.length} goals from server`);
        return;
      }
    } catch (error) {
      console.log('[GOALS] Server fetch failed, loading from local storage:', error);
    }

    // Fallback to local storage
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setGoals(parsed);
        calculateTotalStreak(parsed);
      }
    } catch (error) {
      console.error('Failed to load goals:', error);
    }
  }, []);

  // Save goals locally (cache)
  const saveGoalsLocal = async (newGoals: Goal[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newGoals));
      setGoals(newGoals);
      calculateTotalStreak(newGoals);
    } catch (error) {
      console.error('Failed to save goals locally:', error);
    }
  };

  // Merge habits + subgoals into one array for server storage
  const buildServerMicrohabits = (goal: Goal): Microhabit[] => [
    ...goal.microhabits,
    ...goal.subgoals.map(sg => ({ text: sg.text, done: sg.done, impact: 0, isSubgoal: true as const })),
  ];

  // Create goal on backend
  const createGoalOnServer = async (goal: Goal) => {
    try {
      const result = await apiRequest<any>('/api/goals', {
        method: 'POST',
        body: JSON.stringify({
          title: goal.title,
          emoji: goal.emoji,
          category: goal.category,
          progress: goal.progress,
          streak: goal.streak,
          microhabits: buildServerMicrohabits(goal),
        }),
      });
      console.log(`[GOALS] Created goal on server: ${result.id}`);
      return String(result.id);
    } catch (error) {
      console.error('[GOALS] Failed to create goal on server:', error);
      return null;
    }
  };

  // Update goal on backend
  const updateGoalOnServer = async (goal: Goal) => {
    try {
      await apiRequest(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: goal.title,
          emoji: goal.emoji,
          category: goal.category,
          progress: goal.progress,
          streak: goal.streak,
          microhabits: buildServerMicrohabits(goal),
        }),
      });
      console.log(`[GOALS] Updated goal on server: ${goal.id}`);
    } catch (error) {
      console.error('[GOALS] Failed to update goal on server:', error);
    }
  };

  // Delete goal on backend
  const deleteGoalOnServer = async (goalId: string) => {
    try {
      await apiRequest(`/api/goals/${goalId}`, { method: 'DELETE' });
      console.log(`[GOALS] Deleted goal on server: ${goalId}`);
    } catch (error) {
      console.error('[GOALS] Failed to delete goal on server:', error);
    }
  };

  // Calculate total streak across all goals
  const calculateTotalStreak = (goalsList: Goal[]) => {
    const maxStreak = Math.max(...goalsList.map(g => g.streak), 0);
    setTotalStreak(maxStreak);
  };

  useFocusEffect(
    useCallback(() => {
      loadGoals();
      loadContext();
      if (isAdmin) {
        getImprovementPlanStatus()
          .then(status => setImprovementPlanStatus(status))
          .catch(() => {});
      }
    }, [loadGoals, loadContext, isAdmin])
  );

  // One-time migration: reset all streaks that were set by the old Goals-based logic
  useEffect(() => {
    (async () => {
      const RESET_FLAG = '@goals_streak_reset_v3';
      const done = await AsyncStorage.getItem(RESET_FLAG);
      if (done) return;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) { await AsyncStorage.setItem(RESET_FLAG, '1'); return; }
        const parsed: Goal[] = JSON.parse(raw);
        const reset = parsed.map(g => ({ ...g, streak: 0 }));
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reset));
        setGoals(prev => prev.map(g => ({ ...g, streak: 0 })));
        // Sync each goal's streak reset to the server
        reset.forEach(g => {
          apiRequest(`/api/goals/${g.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ streak: 0 }),
          }).catch(() => {});
        });
        await AsyncStorage.setItem(RESET_FLAG, '1');
      } catch { /* graceful */ }
    })();
  }, []);

  // Toggle daily habit completion — streak is now driven by FitScore check-ins, not here
  const toggleMicrohabit = (goalId: string, habitIndex: number) => {
    const updatedGoals = goals.map(goal => {
      if (goal.id === goalId) {
        const updatedHabits = [...goal.microhabits];
        updatedHabits[habitIndex] = { ...updatedHabits[habitIndex], done: !updatedHabits[habitIndex].done };
        const updated = { ...goal, microhabits: updatedHabits };
        updateGoalOnServer(updated);
        return updated;
      }
      return goal;
    });
    saveGoalsLocal(updatedGoals);
  };

  // Toggle sub-goal completion (drives progress bar — each sub-goal is a milestone)
  const toggleSubgoal = (goalId: string, subgoalIndex: number) => {
    const updatedGoals = goals.map(goal => {
      if (goal.id === goalId) {
        const updatedSubgoals = [...goal.subgoals];
        updatedSubgoals[subgoalIndex] = { ...updatedSubgoals[subgoalIndex], done: !updatedSubgoals[subgoalIndex].done };
        const completedCount = updatedSubgoals.filter(s => s.done).length;
        const progress = updatedSubgoals.length > 0
          ? Math.round((completedCount / updatedSubgoals.length) * 100)
          : goal.progress;
        const updated = { ...goal, subgoals: updatedSubgoals, progress };
        updateGoalOnServer(updated);
        return updated;
      }
      return goal;
    });
    saveGoalsLocal(updatedGoals);
  };

  // Delete goal
  const deleteGoal = (goalId: string) => {
    Alert.alert(
      'Delete Goal',
      'Are you sure you want to delete this goal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteGoalOnServer(goalId);
            const filtered = goals.filter(g => g.id !== goalId);
            saveGoalsLocal(filtered);
          },
        },
      ]
    );
  };

  // Navigate to FitCoach with context
  const reviewWithCoach = () => {
    navigation.navigate('FitCoach', {
      prefilledMessage: `Review my current goals based on:
- My injury phase and limitations
- My long-term objective
- My recent health data (recovery, sleep, HRV, strain trends)
- My fitness context (Identity, Phase & Constraints)

Identify:
1. Any unrealistic or misaligned goals, sub-goals or daily habits
2. What should be adjusted right now
3. One priority goal for this phase`,
      autoSubmit: true,
    });
  };

  // State for edit goals modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  // Edit goal handler
  const editGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setShowEditModal(true);
  };

  // Save edited goal
  const saveEditedGoal = (updatedGoal: Goal) => {
    const updatedGoals = goals.map(g => g.id === updatedGoal.id ? updatedGoal : g);
    updateGoalOnServer(updatedGoal);
    saveGoalsLocal(updatedGoals);
    setShowEditModal(false);
    setEditingGoal(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Goals & Context</Text>
          <Text style={styles.headerSubtitle}>Personalise your performance assistant with your goals and current life reality.</Text>
        </View>
      </View>

      <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content}>
        {/* My Context — 3-tier panel */}
        <ContextPanel context={context} onUpdate={updateContextField} onBatchUpdate={updateContextBatch} scrollViewRef={scrollViewRef} />

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowAddModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            <Text style={styles.actionButtonText}>Add Goal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.coachButton]}
            onPress={() => {
              if (goals.length === 0) {
                Alert.alert('No Goals', 'Create a goal first before editing.');
                return;
              }
              Alert.alert(
                'Edit Goals',
                'Select a goal to edit:',
                [
                  ...goals.map(goal => ({
                    text: `${goal.emoji} ${goal.title}`,
                    onPress: () => editGoal(goal),
                  })),
                  { text: 'Cancel', style: 'cancel' },
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={20} color={colors.accent} />
            <Text style={styles.actionButtonText}>Edit Goals</Text>
          </TouchableOpacity>
        </View>

        {/* Goals List */}
        {goals.length === 0 ? (
          <Card style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>No goals yet</Text>
            <Text style={styles.emptyText}>
              Set your first goal to start tracking progress with FitSmart.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={styles.emptyButtonText}>Create Goal</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              expanded={expandedGoalId === goal.id}
              onToggle={() =>
                setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)
              }
              onToggleMicrohabit={toggleMicrohabit}
              onToggleSubgoal={toggleSubgoal}
              onDelete={deleteGoal}
              scrollViewRef={scrollViewRef}
            />
          ))
        )}

        {/* Improvement Plans Section — admin only until feature is fully released */}
        {isAdmin && improvementPlanStatus && (improvementPlanStatus.activePlan || (improvementPlanStatus.completedPlans && improvementPlanStatus.completedPlans.length > 0)) && (
          <View style={styles.improvementPlansCard}>
            {/* Card header matching FitScore card style */}
            <View style={styles.planCardHeader}>
              <View style={styles.planCardIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={15} color={colors.accent} />
              </View>
              <Text style={styles.planCardLabel}>Improvement Plans</Text>
            </View>

            {improvementPlanStatus.activePlan && (() => {
              const plan = improvementPlanStatus.activePlan!;
              const dayCount = Math.max(1, Math.ceil((Date.now() - new Date(plan.activatedAt).getTime()) / 86400000));
              const avg = plan.currentRollingAvg ?? 0;
              const progress = Math.min(avg / 7.0, 1);
              const avgColor = avg >= 7 ? colors.success : avg >= 5 ? colors.warning : avg > 0 ? colors.danger : colors.textMuted;
              const days = plan.daysCount ?? 0;
              return (
                <View style={styles.improvementPlanActiveBlock}>
                  <Text style={styles.planActiveName}>{`${PILLAR_LABELS[plan.pillar]} Plan`}</Text>
                  <Text style={styles.planActiveMeta}>{`Active · Day ${days}`}</Text>
                  <View style={styles.planProgressRow}>
                    <View style={styles.planProgressBar}>
                      <View style={[styles.planProgressFill, { width: `${progress * 100}%` as any }]} />
                    </View>
                    <Text style={[styles.planProgressLabel, { color: avgColor }]}>
                      {avg > 0 ? `${avg.toFixed(1)} / 7.0` : '— / 7.0'}
                    </Text>
                  </View>
                  <Text style={styles.planDaysCountedLabel}>{`Days counted: ${days}/7`}</Text>
                  <TouchableOpacity
                    style={styles.planViewBtn}
                    onPress={() => handleOpenPlanModal(plan.pillar)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.planViewBtnText}>View Plan</Text>
                    <Ionicons name="arrow-forward" size={13} color={colors.bgPrimary} />
                  </TouchableOpacity>
                </View>
              );
            })()}

            {improvementPlanStatus.completedPlans && improvementPlanStatus.completedPlans.length > 0 && (
              <View style={styles.completedPlansSection}>
                {improvementPlanStatus.activePlan && <View style={styles.plansDivider} />}
                {improvementPlanStatus.completedPlans.map(plan => (
                  <View key={plan.id} style={styles.completedPlanRow}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.completedPlanLabel}>
                      {`${PILLAR_LABELS[plan.pillar]} Plan`}
                    </Text>
                    {plan.completedAt && (
                      <Text style={styles.completedPlanMeta}>
                        {new Date(plan.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </Text>
                    )}
                    {plan.rollingAvgAtCompletion != null && (
                      <Text style={styles.completedPlanAvg}>{`Avg ${plan.rollingAvgAtCompletion.toFixed(1)}`}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.improvementPlansHint}>
              Daily plan habits appear in FitScore for quick check-off.
            </Text>
          </View>
        )}

        {/* Plan Modal */}
        <Modal
          visible={showPlanModal}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowPlanModal(false)}
        >
          <View style={styles.planModalContainer}>
            <TouchableOpacity
              onPress={() => setShowPlanModal(false)}
              style={styles.planModalCloseBtn}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>

            {planContent ? (
              <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
                {/* Hero header */}
                {(() => {
                  const plan = improvementPlanStatus?.activePlan;
                  const dayCount = plan ? Math.max(1, Math.ceil((Date.now() - new Date(plan.activatedAt).getTime()) / 86400000)) : null;
                  const avg = plan?.currentRollingAvg ?? 0;
                  const progress = Math.min(avg / 7.0, 1);
                  const avgColor = avg >= 7 ? colors.success : avg >= 5 ? colors.warning : avg > 0 ? colors.danger : colors.textMuted;
                  const days = plan?.daysCount ?? 0;
                  return (
                    <View style={styles.planModalHero}>
                      <View style={styles.planModalHeroIcon}>
                        <Ionicons name="shield-checkmark-outline" size={32} color={colors.accent} />
                      </View>
                      <Text style={styles.planModalHeroTitle}>{planContent.title}</Text>
                      {plan && (
                        <>
                          <Text style={styles.planModalHeroMeta}>{`Day ${days}`}</Text>
                          <View style={styles.planModalProgressWrap}>
                            <View style={styles.planModalProgressBg}>
                              <View style={[styles.planModalProgressFill, { width: `${progress * 100}%` as any }]} />
                            </View>
                            <Text style={[styles.planModalProgressTarget, { color: avgColor }]}>
                              {`Avg ${avg > 0 ? avg.toFixed(1) : '—'} / 7.0`}
                            </Text>
                          </View>
                          <Text style={styles.planModalDaysCountedLabel}>{`Days counted: ${days}/7`}</Text>
                        </>
                      )}
                    </View>
                  );
                })()}

                <View style={{ paddingHorizontal: spacing.xl }}>
                  <Text style={styles.planModalTrigger}>{planContent.triggerLine}</Text>
                  <Text style={styles.planSectionLabel}>Plan Habits</Text>
                  <View style={styles.planRulesCard}>
                    {planContent.rules.map((rule, i) => (
                      <View key={i}>
                        {i > 0 && <View style={styles.planRuleSeparator} />}
                        <View style={styles.planRuleRow}>
                          <View style={styles.planRuleNumber}>
                            <Text style={styles.planRuleNumberText}>{i + 1}</Text>
                          </View>
                          <Text style={styles.planRuleText}>{rule}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.planModalExit}>{`Exit condition: ${planContent.exitCondition}`}</Text>

                  {/* FitCook button — nutrition plans only */}
                  {improvementPlanStatus?.activePlan?.pillar === 'nutrition' && (
                    <TouchableOpacity
                      style={styles.fitCookBtn}
                      onPress={() => { setFitCookResult(null); setShowFitCookModal(true); }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="restaurant-outline" size={16} color={colors.bgPrimary} />
                      <Text style={styles.fitCookBtnText}>Generate Meal Plan</Text>
                    </TouchableOpacity>
                  )}

                  {/* FitCook sub-modal — nested inside plan modal so it renders above it on iOS */}
                  <Modal
                    visible={showFitCookModal}
                    animationType="slide"
                    presentationStyle="pageSheet"
                    onRequestClose={() => setShowFitCookModal(false)}
                  >
                    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                      <View style={styles.fitCookModalContainer}>
                        <View style={styles.fitCookModalHeader}>
                          <View style={styles.fitCookModalHeaderLeft}>
                            <Ionicons name="restaurant-outline" size={18} color={colors.accent} />
                            <Text style={styles.fitCookModalTitle}>FitCook Meal Plan</Text>
                          </View>
                          <TouchableOpacity onPress={() => setShowFitCookModal(false)} style={{ padding: spacing.xs }}>
                            <Ionicons name="close" size={22} color={colors.textMuted} />
                          </TouchableOpacity>
                        </View>

                        {fitCookResult ? (
                          <ScrollView style={styles.fitCookResultScroll} contentContainerStyle={{ paddingBottom: 48 }}>
                            <Markdown style={fitCookMarkdownStyles}>{fitCookResult}</Markdown>
                            <View style={styles.fitCookResultActions}>
                              <TouchableOpacity
                                style={[styles.fitCookBtn, styles.fitCookBtnOutline, fitCookCopied && styles.fitCookBtnCopied]}
                                onPress={async () => {
                                  await Clipboard.setStringAsync(fitCookResult);
                                  setFitCookCopied(true);
                                  setTimeout(() => setFitCookCopied(false), 2000);
                                }}
                                activeOpacity={0.75}
                              >
                                <Ionicons name={fitCookCopied ? 'checkmark' : 'copy-outline'} size={14} color={fitCookCopied ? colors.success : colors.accent} />
                                <Text style={[styles.fitCookBtnText, { color: fitCookCopied ? colors.success : colors.accent }]}>
                                  {fitCookCopied ? 'Copied!' : 'Copy'}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.fitCookBtn}
                                onPress={() => setFitCookResult(null)}
                                activeOpacity={0.75}
                              >
                                <Ionicons name="refresh-outline" size={14} color={colors.bgPrimary} />
                                <Text style={styles.fitCookBtnText}>Regenerate</Text>
                              </TouchableOpacity>
                            </View>
                          </ScrollView>
                        ) : (
                          <ScrollView style={styles.fitCookFormScroll} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
                            <View style={styles.fitCookRow}>
                              <View>
                                <Text style={styles.fitCookFieldLabel}>Flexible timing</Text>
                                <Text style={styles.fitCookFieldHint}>App suggests sensible meal spacing</Text>
                              </View>
                              <Switch
                                value={fitCookFlexible}
                                onValueChange={setFitCookFlexible}
                                trackColor={{ false: colors.surfaceMute, true: colors.accent + '60' }}
                                thumbColor={fitCookFlexible ? colors.accent : colors.textMuted}
                              />
                            </View>

                            {!fitCookFlexible && (
                              <View style={styles.fitCookTimeSection}>
                                {(['breakfast', 'lunch', 'dinner'] as const).map(meal => (
                                  <View key={meal} style={styles.fitCookTimeRow}>
                                    <Text style={styles.fitCookMealLabel}>{meal.charAt(0).toUpperCase() + meal.slice(1)}</Text>
                                    <View style={styles.fitCookTimeFields}>
                                      <View style={styles.fitCookTimeField}>
                                        <Text style={styles.fitCookTimeFieldLabel}>From</Text>
                                        <TextInput
                                          style={styles.fitCookTimeInput}
                                          value={fitCookWindows[meal].from}
                                          onChangeText={v => setFitCookWindows(w => ({ ...w, [meal]: { ...w[meal], from: v } }))}
                                          onBlur={() => setFitCookWindows(w => ({ ...w, [meal]: { ...w[meal], from: normalizeTime(w[meal].from) } }))}
                                          placeholder="07:00"
                                          placeholderTextColor={colors.textMuted}
                                          keyboardType="numbers-and-punctuation"
                                          maxLength={5}
                                        />
                                      </View>
                                      <View style={styles.fitCookTimeField}>
                                        <Text style={styles.fitCookTimeFieldLabel}>Until</Text>
                                        <TextInput
                                          style={styles.fitCookTimeInput}
                                          value={fitCookWindows[meal].until}
                                          onChangeText={v => setFitCookWindows(w => ({ ...w, [meal]: { ...w[meal], until: v } }))}
                                          onBlur={() => setFitCookWindows(w => ({ ...w, [meal]: { ...w[meal], until: normalizeTime(w[meal].until) } }))}
                                          placeholder="09:00"
                                          placeholderTextColor={colors.textMuted}
                                          keyboardType="numbers-and-punctuation"
                                          maxLength={5}
                                        />
                                      </View>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            )}

                            <Text style={styles.fitCookFieldLabel}>Meal preferences (optional)</Text>
                            <TextInput
                              style={styles.fitCookTextInput}
                              value={fitCookPrefs}
                              onChangeText={setFitCookPrefs}
                              placeholder="e.g. high-protein, Mediterranean, vegetarian"
                              placeholderTextColor={colors.textMuted}
                              multiline
                            />

                            <Text style={[styles.fitCookFieldLabel, { marginTop: spacing.md }]}>Allergies / intolerances (optional)</Text>
                            <TextInput
                              style={styles.fitCookTextInput}
                              value={fitCookAllergies}
                              onChangeText={setFitCookAllergies}
                              placeholder="e.g. gluten, dairy, nuts"
                              placeholderTextColor={colors.textMuted}
                              multiline
                            />

                            <TouchableOpacity
                              style={[styles.fitCookBtn, { marginTop: spacing.xl }, fitCookLoading && { opacity: 0.6 }]}
                              disabled={fitCookLoading}
                              onPress={async () => {
                                setFitCookLoading(true);
                                try {
                                  const result = await generateFitCookMealPlan({
                                    timingMode: fitCookFlexible ? 'flexible' : 'fixed',
                                    windows: fitCookFlexible ? undefined : fitCookWindows,
                                    preferences: fitCookPrefs || undefined,
                                    allergies: fitCookAllergies || undefined,
                                  });
                                  setFitCookResult(result.mealPlan);
                                } catch (e: any) {
                                  Alert.alert('FitCook Error', e?.message || 'Could not generate meal plan');
                                } finally {
                                  setFitCookLoading(false);
                                }
                              }}
                              activeOpacity={0.75}
                            >
                              {fitCookLoading ? (
                                <>
                                  <ActivityIndicator size="small" color={colors.bgPrimary} />
                                  <Text style={styles.fitCookBtnText}>Generating meal plan...</Text>
                                </>
                              ) : (
                                <>
                                  <Ionicons name="restaurant-outline" size={14} color={colors.bgPrimary} />
                                  <Text style={styles.fitCookBtnText}>Generate Meal Plan</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </ScrollView>
                        )}
                      </View>
                    </KeyboardAvoidingView>
                  </Modal>
                </View>
              </ScrollView>
            ) : (
              <View style={styles.planModalLoading}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}
          </View>
        </Modal>

        {/* Coach Panel */}
        {goals.length > 0 && (
          <Card style={styles.coachPanel}>
            <View style={styles.coachPanelHeader}>
              <Ionicons name="chatbubbles" size={28} color={colors.accent} />
              <View style={styles.coachPanelContent}>
                <Text style={styles.coachPanelTitle}>
                  Want help refining your weekly goals?
                </Text>
                <Text style={styles.coachPanelText}>
                  Ask FitCoach to review your current progress.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.coachPanelButton}
              onPress={reviewWithCoach}
            >
              <Ionicons name="chatbubbles-outline" size={18} color={colors.accent} />
              <Text style={styles.coachPanelButtonText}>Review Goals with FitCoach</Text>
            </TouchableOpacity>
          </Card>
        )}
      </ScrollView>

      {/* Add Goal Modal */}
      <AddGoalModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={async (newGoal) => {
          // Create on server first to get the real ID
          const serverId = await createGoalOnServer(newGoal);
          if (serverId) {
            newGoal.id = serverId;
          }
          saveGoalsLocal([...goals, newGoal]);
          setShowAddModal(false);
        }}
      />

      {/* Edit Goal Modal */}
      {editingGoal && (
        <EditGoalModal
          visible={showEditModal}
          goal={editingGoal}
          onClose={() => {
            setShowEditModal(false);
            setEditingGoal(null);
          }}
          onSave={saveEditedGoal}
        />
      )}
    </SafeAreaView>
  );
}

// Goal Card Component
function GoalCard({
  goal,
  expanded,
  onToggle,
  onToggleMicrohabit,
  onToggleSubgoal,
  onDelete,
  scrollViewRef,
}: {
  goal: Goal;
  expanded: boolean;
  onToggle: () => void;
  onToggleMicrohabit: (goalId: string, habitIndex: number) => void;
  onToggleSubgoal: (goalId: string, subgoalIndex: number) => void;
  onDelete: (goalId: string) => void;
  scrollViewRef?: React.RefObject<ScrollView>;
}) {
  const [animation] = useState(new Animated.Value(0));
  const cardYRef = useRef(0);

  useEffect(() => {
    Animated.timing(animation, {
      toValue: expanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [expanded]);

  const handleToggle = () => {
    const isOpening = !expanded;
    onToggle();
    if (isOpening && scrollViewRef?.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: Math.max(0, cardYRef.current - 8), animated: true });
      }, 160);
    }
  };

  const maxHeight = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 500],
  });

  return (
    <View onLayout={e => { cardYRef.current = e.nativeEvent.layout.y; }}>
    <Card style={styles.goalCard}>
      <TouchableOpacity onPress={handleToggle} activeOpacity={0.7}>
        <View style={styles.goalHeader}>
          <View style={styles.goalTitleRow}>
            <Text style={styles.goalEmoji}>{goal.emoji}</Text>
            <View style={styles.goalInfo}>
              <Text style={styles.goalTitle} numberOfLines={expanded ? undefined : 2} ellipsizeMode="tail">{goal.title}</Text>
              <View style={styles.goalMeta}>
                <View
                  style={[
                    styles.categoryTag,
                    { backgroundColor: categoryColors[goal.category] + '20' },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      { color: categoryColors[goal.category] },
                    ]}
                  >
                    {goal.category}
                  </Text>
                </View>
                {goal.streak > 0 && (
                  <View style={styles.streakBadge}>
                    <Text style={styles.streakBadgeText}>
                      🔥 {goal.streak}-day
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${goal.progress}%`,
                    backgroundColor: categoryColors[goal.category],
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{goal.progress}%</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded Details */}
      {expanded && (
        <Animated.View style={[styles.goalDetails, { maxHeight }]}>
          {/* Daily Habits — planning view only, not tickable here */}
          {goal.microhabits.length > 0 && (
            <View style={styles.microhabitsSection}>
              <Text style={styles.microhabitsTitle}>Daily Habits</Text>
              <Text style={styles.habitsInfoText}>Daily habits are checked in your FitScore each day.</Text>
              {goal.microhabits.map((habit, index) => (
                <View key={index} style={styles.microhabitRow}>
                  <View style={styles.checkbox} />
                  <Text style={styles.microhabitText}>{habit.text}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Sub-goals */}
          {goal.subgoals && goal.subgoals.length > 0 && (
            <View style={[styles.microhabitsSection, goal.microhabits.length > 0 && styles.subgoalSectionBorder]}>
              <Text style={styles.subgoalsTitle}>Sub-goals</Text>
              {goal.subgoals.map((sg, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.microhabitRow}
                  onPress={() => onToggleSubgoal(goal.id, index)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, styles.checkboxSubgoal, sg.done && styles.checkboxSubgoalDone]}>
                    {sg.done && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                  </View>
                  <Text style={[styles.microhabitText, sg.done && styles.microhabitTextDone]}>
                    {sg.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.goalActions}>
            <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(goal.id)}>
              <Ionicons name="trash-outline" size={18} color="#FF5F56" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </Card>
    </View>
  );
}

// Add Goal Modal Component
function AddGoalModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (goal: Goal) => void;
}) {
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  const [category, setCategory] = useState<GoalCategory>('Training');
  const [habits, setHabits] = useState<string[]>(['', '', '']);
  const [subgoalInputs, setSubgoalInputs] = useState<string[]>(['', '', '']);

  const handleAdd = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a goal title');
      return;
    }

    const validHabits = habits.filter(h => h.trim().length > 0);
    const validSubgoals = subgoalInputs.filter(s => s.trim().length > 0);

    if (validHabits.length === 0 && validSubgoals.length === 0) {
      Alert.alert('Error', 'Please add at least one daily habit or sub-goal');
      return;
    }

    const newGoal: Goal = {
      id: Date.now().toString(),
      title: title.trim(),
      emoji,
      category,
      progress: 0,
      streak: 0,
      microhabits: validHabits.map(h => ({
        text: h.trim(),
        done: false,
        impact: validHabits.length > 0 ? Math.round(100 / validHabits.length) : 0,
      })),
      subgoals: validSubgoals.map(s => ({ text: s.trim(), done: false })),
      createdAt: new Date().toISOString(),
    };

    onAdd(newGoal);
    setTitle('');
    setEmoji('🎯');
    setCategory('Training');
    setHabits(['', '', '']);
    setSubgoalInputs(['', '', '']);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create New Goal</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {/* Title Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Goal Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Sleep 8 hours daily"
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={setTitle}
              />
            </View>

            {/* Emoji Picker */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Icon</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.emojiScrollContent}
              >
                {['🎯', '💪', '🏃', '🥗', '💤', '🧠', '📈', '🏋️', '🚴', '🧘', '💧', '🥤', '🍎', '⚡', '🔥', '🌟', '✅', '🏆', '❤️', '🩺'].map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[
                      styles.emojiButton,
                      emoji === e && styles.emojiButtonSelected,
                    ]}
                    onPress={() => setEmoji(e)}
                  >
                    <Text style={styles.emojiButtonText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Category Picker */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryRow}>
                {(['Recovery', 'Training', 'Nutrition', 'Mindset'] as GoalCategory[]).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryButton,
                      category === cat && styles.categoryButtonActive,
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryButtonText,
                        category === cat && styles.categoryButtonTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Daily Habits Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Daily Habits (1-3)</Text>
              <Text style={styles.inputHint}>Recurring actions tracked daily — build your streak</Text>
              {habits.map((habit, index) => (
                <TextInput
                  key={index}
                  style={styles.textInput}
                  placeholder={`Habit ${index + 1}`}
                  placeholderTextColor={colors.textMuted}
                  value={habit}
                  onChangeText={(text) => {
                    const newHabits = [...habits];
                    newHabits[index] = text;
                    setHabits(newHabits);
                  }}
                />
              ))}
            </View>

            {/* Sub-goals Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Sub-goals (1-3)</Text>
              <Text style={styles.inputHint}>Milestones toward your goal — check off when done</Text>
              {subgoalInputs.map((sg, index) => (
                <TextInput
                  key={index}
                  style={styles.textInput}
                  placeholder={`Sub-goal ${index + 1}`}
                  placeholderTextColor={colors.textMuted}
                  value={sg}
                  onChangeText={(text) => {
                    const updated = [...subgoalInputs];
                    updated[index] = text;
                    setSubgoalInputs(updated);
                  }}
                />
              ))}
            </View>

            <TouchableOpacity style={[styles.createButton, { marginBottom: spacing.xl }]} onPress={handleAdd}>
              <View style={styles.createButtonSolid}>
                <Text style={styles.createButtonText}>Create Goal</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Edit Goal Modal Component
function EditGoalModal({
  visible,
  goal,
  onClose,
  onSave,
}: {
  visible: boolean;
  goal: Goal;
  onClose: () => void;
  onSave: (goal: Goal) => void;
}) {
  const [title, setTitle] = useState(goal.title);
  const [emoji, setEmoji] = useState(goal.emoji);
  const [category, setCategory] = useState<GoalCategory>(goal.category);
  const [habits, setHabits] = useState<string[]>(
    goal.microhabits.map(h => h.text).concat(['', '', '']).slice(0, 3)
  );
  const [subgoalInputs, setSubgoalInputs] = useState<string[]>(
    (goal.subgoals || []).map(s => s.text).concat(['', '', '']).slice(0, 3)
  );

  // Reset form when goal changes
  useEffect(() => {
    setTitle(goal.title);
    setEmoji(goal.emoji);
    setCategory(goal.category);
    setHabits(goal.microhabits.map(h => h.text).concat(['', '', '']).slice(0, 3));
    setSubgoalInputs((goal.subgoals || []).map(s => s.text).concat(['', '', '']).slice(0, 3));
  }, [goal]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a goal title');
      return;
    }

    const validHabits = habits.filter(h => h.trim().length > 0);
    const validSubgoals = subgoalInputs.filter(s => s.trim().length > 0);
    if (validHabits.length === 0 && validSubgoals.length === 0) {
      Alert.alert('Error', 'Please add at least one daily habit or sub-goal');
      return;
    }

    const updatedHabits = validHabits.map((h, i) => ({
      text: h.trim(),
      done: goal.microhabits[i]?.done || false,
      impact: validHabits.length > 0 ? Math.round(100 / validHabits.length) : 0,
    }));
    const updatedSubgoals = validSubgoals.map((s, i) => ({
      text: s.trim(),
      done: (goal.subgoals || [])[i]?.done || false,
    }));

    // Progress is driven by sub-goals (milestones), not daily habits
    const completedSubgoals = updatedSubgoals.filter(s => s.done).length;
    const progress = updatedSubgoals.length > 0
      ? Math.round((completedSubgoals / updatedSubgoals.length) * 100)
      : goal.progress;

    const updatedGoal: Goal = {
      ...goal,
      title: title.trim(),
      emoji,
      category,
      microhabits: updatedHabits,
      subgoals: updatedSubgoals,
      progress,
    };

    onSave(updatedGoal);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Goal</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {/* Title Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Goal Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Sleep 8 hours daily"
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={setTitle}
              />
            </View>

            {/* Emoji Picker */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Icon</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.emojiScrollContent}
              >
                {['🎯', '💪', '🏃', '🥗', '💤', '🧠', '📈', '🏋️', '🚴', '🧘', '💧', '🥤', '🍎', '⚡', '🔥', '🌟', '✅', '🏆', '❤️', '🩺'].map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[
                      styles.emojiButton,
                      emoji === e && styles.emojiButtonSelected,
                    ]}
                    onPress={() => setEmoji(e)}
                  >
                    <Text style={styles.emojiButtonText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Category Picker */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryRow}>
                {(['Recovery', 'Training', 'Nutrition', 'Mindset'] as GoalCategory[]).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryButton,
                      category === cat && styles.categoryButtonActive,
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryButtonText,
                        category === cat && styles.categoryButtonTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Daily Habits Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Daily Habits (1-3)</Text>
              <Text style={styles.inputHint}>Recurring actions tracked daily — build your streak</Text>
              {habits.map((habit, index) => (
                <TextInput
                  key={index}
                  style={styles.textInput}
                  placeholder={`Habit ${index + 1}`}
                  placeholderTextColor={colors.textMuted}
                  value={habit}
                  onChangeText={(text) => {
                    const newHabits = [...habits];
                    newHabits[index] = text;
                    setHabits(newHabits);
                  }}
                />
              ))}
            </View>

            {/* Sub-goals Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Sub-goals (1-3)</Text>
              <Text style={styles.inputHint}>Milestones toward your goal — check off when done</Text>
              {subgoalInputs.map((sg, index) => (
                <TextInput
                  key={index}
                  style={styles.textInput}
                  placeholder={`Sub-goal ${index + 1}`}
                  placeholderTextColor={colors.textMuted}
                  value={sg}
                  onChangeText={(text) => {
                    const updated = [...subgoalInputs];
                    updated[index] = text;
                    setSubgoalInputs(updated);
                  }}
                />
              ))}
            </View>

            <TouchableOpacity style={[styles.createButton, { marginBottom: spacing.xl }]} onPress={handleSave}>
              <View style={styles.createButtonSolid}>
                <Text style={styles.createButtonText}>Save Changes</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Context Panel — 3-tier collapsible section
// ─────────────────────────────────────────────────────────────

function ContextPanel({
  context,
  onUpdate,
  onBatchUpdate,
  scrollViewRef,
}: {
  context: UserContext;
  onUpdate: (field: keyof UserContext, value: string | null) => void;
  onBatchUpdate: (updates: Partial<UserContext>) => void;
  scrollViewRef?: React.RefObject<ScrollView>;
}) {
  const [expandedTier, setExpandedTier] = useState<1 | 2 | 3 | null>(null);

  // Track Y positions via onLayout — reliable content-relative coordinates
  // that update automatically whenever tiers collapse/expand and layout re-settles.
  const wrapperYRef  = useRef(0);
  const tierYRef     = useRef<Record<1 | 2 | 3, number>>({ 1: 0, 2: 0, 3: 0 });

  const toggle = (t: 1 | 2 | 3) => {
    const isOpening = expandedTier !== t;
    setExpandedTier(prev => (prev === t ? null : t));

    if (isOpening && scrollViewRef?.current) {
      // Wait for previous tier to collapse and layout to fully re-settle before scrolling.
      // onLayout fires synchronously after layout calculation, so by 160ms the
      // tierYRef values reflect the post-collapse positions.
      setTimeout(() => {
        const y = wrapperYRef.current + tierYRef.current[t];
        scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      }, 160);
    }
  };

  const hasInjury = !!context.injuryType && context.injuryType !== 'None';

  return (
    <View
      style={ctxStyles.wrapper}
      onLayout={e => { wrapperYRef.current = e.nativeEvent.layout.y; }}
    >
      <Text style={ctxStyles.sectionLabel}>MY CONTEXT</Text>

      {/* Tier 1 — Identity */}
      <ContextTier
        label="Identity"
        badge="Tier 1"
        summary={context.tier1Goal}
        expanded={expandedTier === 1}
        onToggle={() => toggle(1)}
        onLayout={e => { tierYRef.current[1] = e.nativeEvent.layout.y; }}
      >
        {/* Primary Goal — card chips with descriptions */}
        <View style={ctxStyles.optGroup}>
          <Text style={ctxStyles.optGroupLabel}>PRIMARY GOAL</Text>
          <View style={ctxStyles.goalCards}>
            {TIER1_GOALS.map(goal => {
              const active = goal === context.tier1Goal;
              return (
                <TouchableOpacity
                  key={goal}
                  style={[ctxStyles.goalCard, active && ctxStyles.goalCardActive]}
                  onPress={() => onUpdate('tier1Goal', goal)}
                  activeOpacity={0.7}
                >
                  <Text style={[ctxStyles.goalCardTitle, active && ctxStyles.goalCardTitleActive]}>
                    {goal}
                  </Text>
                  <Text style={[ctxStyles.goalCardDesc, active && ctxStyles.goalCardDescActive]}>
                    {TIER1_GOAL_DESCRIPTIONS[goal]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <OptionGroup
          label="FITNESS PRIORITY"
          options={TIER1_PRIORITIES}
          selected={context.tier1Priority}
          onSelect={v => onUpdate('tier1Priority', v)}
        />
      </ContextTier>

      {/* Tier 2 — Phase + Constraints */}
      <ContextTier
        label="Phase & Constraints"
        badge="Tier 2"
        summary={context.tier2Phase}
        expanded={expandedTier === 2}
        onToggle={() => toggle(2)}
        onLayout={e => { tierYRef.current[2] = e.nativeEvent.layout.y; }}
      >
        <OptionGroup
          label="TRAINING PHASE"
          options={TIER2_PHASES}
          selected={context.tier2Phase}
          onSelect={v => onUpdate('tier2Phase', v)}
        />

        <OptionGroup
          label="DIET PHASE"
          options={TIER2_DIET_PHASES}
          selected={context.tier2DietPhase}
          onSelect={v => onUpdate('tier2DietPhase', v)}
        />

        <OptionGroup
          label="CURRENT EMPHASIS"
          options={TIER2_EMPHASIS}
          selected={context.tier2Emphasis}
          onSelect={v => {
            if (v !== 'Sport-Specific') {
              onBatchUpdate({ tier2Emphasis: v, sportSpecific: null });
            } else {
              onUpdate('tier2Emphasis', v);
            }
          }}
        />

        {/* Sport-Specific conditional text input */}
        {context.tier2Emphasis === 'Sport-Specific' && (
          <View style={ctxStyles.subField}>
            <Text style={ctxStyles.subFieldLabel}>Which sport?</Text>
            <TextInput
              style={ctxStyles.textInput}
              placeholder="e.g. Basketball, Rowing..."
              placeholderTextColor={colors.textMuted}
              value={context.sportSpecific ?? ''}
              onChangeText={t => onUpdate('sportSpecific', t.slice(0, 30) || null)}
              maxLength={30}
            />
          </View>
        )}

        <OptionGroup
          label="INJURY / CONSTRAINT"
          options={INJURY_TYPES}
          selected={context.injuryType ?? 'None'}
          onSelect={v => {
            const val = v === 'None' ? null : v;
            if (!val) {
              onBatchUpdate({
                injuryType: null,
                injuryDescription: null,
                bodyRegion: null,
                injuryLocation: null,
                rehabStage: null,
              });
            } else if (v !== 'Other') {
              onBatchUpdate({ injuryType: val, injuryDescription: null });
            } else {
              onUpdate('injuryType', val);
            }
          }}
        />

        {/* "Other" injury free-text */}
        {context.injuryType === 'Other' && (
          <View style={ctxStyles.subField}>
            <Text style={ctxStyles.subFieldLabel}>Describe injury</Text>
            <TextInput
              style={ctxStyles.textInput}
              placeholder="Brief description..."
              placeholderTextColor={colors.textMuted}
              value={context.injuryDescription ?? ''}
              onChangeText={t => onUpdate('injuryDescription', t || null)}
            />
          </View>
        )}

        {/* Steps 2-4: only shown if injury ≠ None */}
        {hasInjury && (
          <>
            <OptionGroup
              label="BODY REGION"
              options={BODY_REGIONS}
              selected={context.bodyRegion ?? ''}
              onSelect={v => onUpdate('bodyRegion', v)}
            />

            <View style={ctxStyles.subField}>
              <Text style={ctxStyles.subFieldLabel}>Where exactly?</Text>
              <TextInput
                style={ctxStyles.textInput}
                placeholder="Left ankle – lateral ligament"
                placeholderTextColor={colors.textMuted}
                value={context.injuryLocation ?? ''}
                onChangeText={t => onUpdate('injuryLocation', t || null)}
              />
            </View>

            <OptionGroup
              label="REHAB STAGE"
              options={REHAB_STAGES}
              selected={context.rehabStage ?? ''}
              onSelect={v => onUpdate('rehabStage', v)}
            />
          </>
        )}
      </ContextTier>

      {/* Tier 3 — This Week */}
      <ContextTier
        label="This Week"
        badge="Tier 3"
        summary={context.tier3WeekLoad}
        expanded={expandedTier === 3}
        onToggle={() => toggle(3)}
        onLayout={e => { tierYRef.current[3] = e.nativeEvent.layout.y; }}
      >
        <OptionGroup
          label="WEEK LOAD"
          options={TIER3_WEEK_LOADS}
          selected={context.tier3WeekLoad}
          onSelect={v => onUpdate('tier3WeekLoad', v)}
        />
        <OptionGroup
          label="STRESS FORECAST"
          options={TIER3_STRESS_LEVELS}
          selected={context.tier3Stress}
          onSelect={v => onUpdate('tier3Stress', v)}
        />
        <OptionGroup
          label="SLEEP EXPECTATION"
          options={TIER3_SLEEP_EXPECTATIONS}
          selected={context.tier3SleepExpectation}
          onSelect={v => onUpdate('tier3SleepExpectation', v)}
        />
        <OptionGroup
          label="WORK HOURS / WEEK"
          options={WORK_HOURS_OPTIONS}
          selected={context.workHoursPerWeek ?? ''}
          onSelect={v => onUpdate('workHoursPerWeek', v)}
        />
        <OptionGroup
          label="TRAINING SESSIONS / WEEK"
          options={TRAINING_SESSIONS_OPTIONS}
          selected={context.trainingSessionsPerWeek ?? ''}
          onSelect={v => onUpdate('trainingSessionsPerWeek', v)}
        />
      </ContextTier>
    </View>
  );
}

function ContextTier({
  label, badge, summary, expanded, onToggle, onLayout, children,
}: {
  label: string;
  badge: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  onLayout?: (e: any) => void;
  children: React.ReactNode;
}) {
  return (
    <View style={ctxStyles.tier} onLayout={onLayout}>
      <TouchableOpacity
        style={ctxStyles.tierHeader}
        onPress={onToggle}
        activeOpacity={0.75}
      >
        <View style={ctxStyles.tierHeaderLeft}>
          <View style={ctxStyles.tierBadge}>
            <Text style={ctxStyles.tierBadgeText}>{badge}</Text>
          </View>
          <Text style={ctxStyles.tierLabel}>{label}</Text>
        </View>
        <View style={ctxStyles.tierHeaderRight}>
          <Text style={ctxStyles.tierSummary} numberOfLines={1}>{summary}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={ctxStyles.tierBody}>
          {children}
        </View>
      )}
    </View>
  );
}

function OptionGroup({
  label, options, selected, onSelect,
}: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={ctxStyles.optGroup}>
      <Text style={ctxStyles.optGroupLabel}>{label}</Text>
      <View style={ctxStyles.optPills}>
        {options.map(opt => {
          const active = opt === selected;
          return (
            <TouchableOpacity
              key={opt}
              style={[ctxStyles.pill, active && ctxStyles.pillActive]}
              onPress={() => onSelect(opt)}
              activeOpacity={0.7}
            >
              <Text style={[ctxStyles.pillText, active && ctxStyles.pillTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const ctxStyles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  sectionSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  tier: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '60',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  tierHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  tierHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '50%',
  },
  tierBadge: {
    backgroundColor: colors.accent + '20',
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.5,
  },
  tierLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tierSummary: {
    fontSize: 13,
    color: colors.textMuted,
    flex: 1,
    textAlign: 'right',
  },
  tierBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute + '50',
    gap: spacing.md,
  },
  optGroup: {
    marginTop: spacing.md,
  },
  optGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  optPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMute + '50',
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  pillActive: {
    backgroundColor: colors.accent + '25',
    borderColor: colors.accent,
  },
  pillText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  pillTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  // Goal cards (Tier 1 primary goal — strategic identity cards)
  goalCards: {
    gap: spacing.sm,
  },
  goalCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '80',
  },
  goalCardActive: {
    backgroundColor: colors.accent + '14',
    borderColor: colors.accent,
    borderWidth: 2,
  },
  goalCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 3,
    letterSpacing: -0.1,
  },
  goalCardTitleActive: {
    color: colors.accent,
  },
  goalCardDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  goalCardDescActive: {
    color: colors.accent + 'AA',
  },
  // Conditional sub-fields (text inputs beneath chip selections)
  subField: {
    marginTop: spacing.xs,
  },
  subFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  textInput: {
    backgroundColor: colors.surfaceMute + '40',
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
});

// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgPrimary,
  },
  headerTitle: {
    ...typography.h1,
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...typography.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + 60,
  },
  streakWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 16,
    marginBottom: spacing.lg,
  },
  streakEmoji: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  streakText: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '80',
  },
  coachButton: {},
  actionButtonText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h2,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  emptyButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: 12,
  },
  emptyButtonText: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  goalCard: {
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  goalHeader: {
    gap: spacing.md,
  },
  goalTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  goalEmoji: {
    fontSize: 32,
  },
  goalInfo: {
    flex: 1,
  },
  goalTitle: {
    ...typography.body,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  goalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    ...typography.small,
    fontSize: 11,
    fontWeight: '600',
  },
  streakBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: '#F9A82520',
    borderRadius: 6,
  },
  streakBadgeText: {
    ...typography.small,
    fontSize: 11,
    fontWeight: '600',
    color: '#F9A825',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceMute,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    ...typography.small,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    minWidth: 40,
    textAlign: 'right',
  },
  goalDetails: {
    overflow: 'hidden',
  },
  microhabitsSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute,
  },
  microhabitsTitle: {
    ...typography.body,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.accent,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  habitsInfoText: {
    ...typography.small,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  subgoalsTitle: {
    ...typography.body,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.accent,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  subgoalSectionBorder: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute + '40',
  },
  checkboxSubgoal: {
    borderRadius: 12, // circle for sub-goals vs square for habits
    borderColor: colors.accent + '80',
  },
  checkboxSubgoalDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  inputHint: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  microhabitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  microhabitText: {
    ...typography.body,
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
  },
  microhabitTextDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  impactText: {
    ...typography.small,
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  goalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  deleteButtonText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: '#FF5F56',
  },
  coachPanel: {
    marginTop: spacing.lg,
    padding: spacing.md,
    opacity: 0.75,
  },
  coachPanelHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  coachPanelContent: {
    flex: 1,
  },
  coachPanelTitle: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  coachPanelText: {
    ...typography.body,
    fontSize: 13,
    color: colors.textPrimary,
  },
  coachPanelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '60',
  },
  coachPanelButtonText: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl + 40,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.h2,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalScroll: {
    paddingHorizontal: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  textInput: {
    ...typography.body,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceMute,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    marginBottom: spacing.sm,
  },
  emojiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emojiScrollContent: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  emojiButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMute,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiButtonSelected: {
    borderColor: colors.accent,
  },
  emojiButtonText: {
    fontSize: 24,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryButton: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceMute,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
  },
  categoryButtonActive: {
    backgroundColor: colors.accent + '20',
    borderColor: colors.accent,
  },
  categoryButtonText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
  categoryButtonTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  createButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  createButtonSolid: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  createButtonText: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '700',
    color: colors.bgPrimary,
  },

  // Improvement Plans
  improvementPlansCard: {
    backgroundColor: colors.accent + '08',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.accent + '35',
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  planCardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  planCardIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  planCardLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
  },
  improvementPlanActiveBlock: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  planActiveName: {
    ...typography.body,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    fontSize: 17,
  },
  planActiveMeta: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  planProgressRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  planProgressBar: {
    flex: 1,
    height: 5,
    backgroundColor: colors.surfaceMute + '60',
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  planProgressFill: {
    height: '100%' as any,
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  planProgressLabel: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600' as const,
    minWidth: 50,
    textAlign: 'right' as const,
  },
  planDaysCountedLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  planViewBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  planViewBtnText: {
    ...typography.small,
    fontWeight: '600' as const,
    color: colors.bgPrimary,
  },
  completedPlansSection: {
    gap: spacing.xs,
  },
  plansDivider: {
    height: 1,
    backgroundColor: colors.surfaceMute,
    marginVertical: spacing.sm,
  },
  completedPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  completedPlanLabel: {
    ...typography.small,
    color: colors.textPrimary,
    flex: 1,
  },
  completedPlanMeta: {
    ...typography.small,
    color: colors.textMuted,
  },
  completedPlanAvg: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '600',
  },
  improvementPlansHint: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },

  // Plan modal
  planModalContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  planModalCloseBtn: {
    position: 'absolute' as const,
    top: 58,
    right: spacing.xl,
    padding: spacing.xs,
    zIndex: 10,
  },
  planModalHero: {
    alignItems: 'center' as const,
    paddingTop: 60,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute + '40',
  },
  planModalHeroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent + '18',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.md,
  },
  planModalHeroTitle: {
    ...typography.h2,
    fontSize: 22,
    textAlign: 'center' as const,
    marginBottom: spacing.xs,
  },
  planModalHeroMeta: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  planModalProgressWrap: {
    width: '100%' as any,
    gap: spacing.xs,
  },
  planModalProgressBg: {
    height: 6,
    backgroundColor: colors.surfaceMute + '60',
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  planModalProgressFill: {
    height: '100%' as any,
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  planModalProgressTarget: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'right' as const,
    fontWeight: '600' as const,
  },
  planModalDaysCountedLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  planModalTrigger: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  planSectionLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  planRulesCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    overflow: 'hidden' as const,
    marginBottom: spacing.xl,
  },
  planRuleSeparator: {
    height: 1,
    backgroundColor: colors.surfaceMute + '40',
    marginHorizontal: spacing.md,
  },
  planRuleRow: {
    flexDirection: 'row' as const,
    gap: spacing.md,
    alignItems: 'flex-start' as const,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  planRuleNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent + '20',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
    marginTop: 1,
  },
  planRuleNumberText: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '700' as const,
  },
  planRuleText: {
    ...typography.body,
    flex: 1,
    lineHeight: 22,
  },
  planModalExit: {
    ...typography.small,
    color: colors.textMuted,
    fontStyle: 'italic' as const,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute,
    marginBottom: spacing.xl,
  },
  planModalLoading: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  fitCookModalContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  fitCookModalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute + '40',
  },
  fitCookModalHeaderLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  fitCookModalTitle: {
    ...typography.body,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    fontSize: 17,
  },
  fitCookFormScroll: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  fitCookResultScroll: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  fitCookResultText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  fitCookResultActions: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  fitCookBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.accent,
    flex: 1,
  },
  fitCookBtnCopied: {
    borderColor: colors.success,
  },
  fitCookRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute + '30',
    marginBottom: spacing.sm,
  },
  fitCookFieldLabel: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  fitCookFieldHint: {
    fontSize: 11,
    color: colors.textMuted,
  },
  fitCookTimeSection: {
    marginBottom: spacing.md,
  },
  fitCookTimeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute + '25',
  },
  fitCookMealLabel: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: '600' as const,
    width: 72,
  },
  fitCookTimeFields: {
    flex: 1,
    flexDirection: 'row' as const,
    gap: spacing.sm,
  },
  fitCookTimeField: {
    flex: 1,
  },
  fitCookTimeFieldLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  fitCookTimeInput: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
  },
  fitCookTextInput: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 14,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  fitCookBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  fitCookBtnText: {
    ...typography.small,
    fontWeight: '600' as const,
    color: colors.bgPrimary,
  },
});
