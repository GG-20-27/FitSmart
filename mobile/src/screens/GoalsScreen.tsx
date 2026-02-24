import React, { useState, useCallback, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, typography, radii } from '../theme';
import { Card } from '../ui/components';
import { apiRequest } from '../api/client';
import {
  getUserContext, saveUserContext,
  type UserContext,
  DEFAULTS as CTX_DEFAULTS,
  TIER1_GOALS, TIER1_GOAL_DESCRIPTIONS, TIER1_PRIORITIES,
  TIER2_PHASES, TIER2_DIET_PHASES, TIER2_EMPHASIS,
  INJURY_TYPES, BODY_REGIONS, REHAB_STAGES,
  TIER3_WEEK_LOADS, TIER3_STRESS_LEVELS, TIER3_SLEEP_EXPECTATIONS,
} from '../api/context';

type GoalCategory = 'Recovery' | 'Training' | 'Nutrition' | 'Mindset';

type Microhabit = {
  text: string;
  done: boolean;
  impact: number;
};

type Goal = {
  id: string;
  title: string;
  emoji: string;
  category: GoalCategory;
  progress: number;
  streak: number;
  microhabits: Microhabit[];
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

export default function GoalsScreen() {
  const navigation = useNavigation();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [totalStreak, setTotalStreak] = useState(0);
  const [avgFitScore, setAvgFitScore] = useState(0);
  const [fitScoreDelta, setFitScoreDelta] = useState(0);

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
        const mapped: Goal[] = serverGoals.map((g: any) => ({
          id: String(g.id),
          title: g.title,
          emoji: g.emoji || '🎯',
          category: g.category as GoalCategory,
          progress: g.progress || 0,
          streak: g.streak || 0,
          microhabits: g.microhabits ? (typeof g.microhabits === 'string' ? JSON.parse(g.microhabits) : g.microhabits) : [],
          createdAt: g.createdAt || new Date().toISOString(),
        }));
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
          microhabits: goal.microhabits,
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
          microhabits: goal.microhabits,
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
    }, [loadGoals, loadContext])
  );

  // Toggle microhabit completion
  const toggleMicrohabit = (goalId: string, habitIndex: number) => {
    const updatedGoals = goals.map(goal => {
      if (goal.id === goalId) {
        const updatedHabits = [...goal.microhabits];
        updatedHabits[habitIndex] = {
          ...updatedHabits[habitIndex],
          done: !updatedHabits[habitIndex].done,
        };

        // Recalculate progress
        const completedCount = updatedHabits.filter(h => h.done).length;
        const progress = Math.round((completedCount / updatedHabits.length) * 100);

        // Update streak if all habits completed
        const allDone = updatedHabits.every(h => h.done);
        const newStreak = allDone ? goal.streak + 1 : goal.streak;

        const updated = { ...goal, microhabits: updatedHabits, progress, streak: newStreak };
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
      prefilledMessage: 'Please review my goals and suggest any improvements according to my injury and long-term goal context. Take into count also my health data metrics.',
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

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* My Context — 3-tier panel */}
        <ContextPanel context={context} onUpdate={updateContextField} onBatchUpdate={updateContextBatch} />

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
              onDelete={deleteGoal}
            />
          ))
        )}

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
  onDelete,
}: {
  goal: Goal;
  expanded: boolean;
  onToggle: () => void;
  onToggleMicrohabit: (goalId: string, habitIndex: number) => void;
  onDelete: (goalId: string) => void;
}) {
  const [animation] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(animation, {
      toValue: expanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [expanded]);

  const maxHeight = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 500],
  });

  return (
    <Card style={styles.goalCard}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
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
          <View style={styles.microhabitsSection}>
            <Text style={styles.microhabitsTitle}>Daily Habits</Text>
            {goal.microhabits.map((habit, index) => (
              <TouchableOpacity
                key={index}
                style={styles.microhabitRow}
                onPress={() => onToggleMicrohabit(goal.id, index)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.checkbox,
                    habit.done && styles.checkboxChecked,
                  ]}
                >
                  {habit.done && (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  )}
                </View>
                <Text
                  style={[
                    styles.microhabitText,
                    habit.done && styles.microhabitTextDone,
                  ]}
                >
                  {habit.text}
                </Text>
                <Text style={styles.impactText}>+{habit.impact}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.goalActions}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => onDelete(goal.id)}
            >
              <Ionicons name="trash-outline" size={18} color="#FF5F56" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </Card>
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

  const handleAdd = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a goal title');
      return;
    }

    const validHabits = habits.filter(h => h.trim().length > 0);
    if (validHabits.length === 0) {
      Alert.alert('Error', 'Please add at least one habit');
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
        impact: Math.round(100 / validHabits.length),
      })),
      createdAt: new Date().toISOString(),
    };

    onAdd(newGoal);
    setTitle('');
    setEmoji('🎯');
    setCategory('Training');
    setHabits(['', '', '']);
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

            {/* Habits Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Daily Habits (1-3)</Text>
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
          </ScrollView>

          <TouchableOpacity style={styles.createButton} onPress={handleAdd}>
            <View style={styles.createButtonSolid}>
              <Text style={styles.createButtonText}>Create Goal</Text>
            </View>
          </TouchableOpacity>
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

  // Reset form when goal changes
  useEffect(() => {
    setTitle(goal.title);
    setEmoji(goal.emoji);
    setCategory(goal.category);
    setHabits(goal.microhabits.map(h => h.text).concat(['', '', '']).slice(0, 3));
  }, [goal]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a goal title');
      return;
    }

    const validHabits = habits.filter(h => h.trim().length > 0);
    if (validHabits.length === 0) {
      Alert.alert('Error', 'Please add at least one habit');
      return;
    }

    const updatedGoal: Goal = {
      ...goal,
      title: title.trim(),
      emoji,
      category,
      microhabits: validHabits.map((h, i) => ({
        text: h.trim(),
        done: goal.microhabits[i]?.done || false,
        impact: Math.round(100 / validHabits.length),
      })),
    };

    // Recalculate progress
    const completedCount = updatedGoal.microhabits.filter(h => h.done).length;
    updatedGoal.progress = Math.round((completedCount / updatedGoal.microhabits.length) * 100);

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

            {/* Habits Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Daily Habits (1-3)</Text>
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
          </ScrollView>

          <TouchableOpacity style={styles.createButton} onPress={handleSave}>
            <View style={styles.createButtonSolid}>
              <Text style={styles.createButtonText}>Save Changes</Text>
            </View>
          </TouchableOpacity>
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
}: {
  context: UserContext;
  onUpdate: (field: keyof UserContext, value: string | null) => void;
  onBatchUpdate: (updates: Partial<UserContext>) => void;
}) {
  const [expandedTier, setExpandedTier] = useState<1 | 2 | 3 | null>(null);
  const toggle = (t: 1 | 2 | 3) => setExpandedTier(prev => (prev === t ? null : t));

  const hasInjury = !!context.injuryType && context.injuryType !== 'None';

  return (
    <View style={ctxStyles.wrapper}>
      <Text style={ctxStyles.sectionLabel}>MY CONTEXT</Text>

      {/* Tier 1 — Identity */}
      <ContextTier
        label="Identity"
        badge="Tier 1"
        summary={context.tier1Goal}
        expanded={expandedTier === 1}
        onToggle={() => toggle(1)}
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
      </ContextTier>
    </View>
  );
}

function ContextTier({
  label, badge, summary, expanded, onToggle, children,
}: {
  label: string;
  badge: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={ctxStyles.tier}>
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
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.md,
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
});
