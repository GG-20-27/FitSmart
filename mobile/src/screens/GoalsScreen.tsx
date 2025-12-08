import React, { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, typography } from '../theme';
import { Card } from '../ui/components';

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

  // Load goals from storage
  const loadGoals = useCallback(async () => {
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

  // Save goals to storage
  const saveGoals = async (newGoals: Goal[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newGoals));
      setGoals(newGoals);
      calculateTotalStreak(newGoals);
    } catch (error) {
      console.error('Failed to save goals:', error);
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
    }, [loadGoals])
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

        return { ...goal, microhabits: updatedHabits, progress, streak: newStreak };
      }
      return goal;
    });

    saveGoals(updatedGoals);
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
            const filtered = goals.filter(g => g.id !== goalId);
            saveGoals(filtered);
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
    saveGoals(updatedGoals);
    setShowEditModal(false);
    setEditingGoal(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Your Goals</Text>
          <Text style={styles.headerSubtitle}>Small wins build lasting performance.</Text>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Streak Widget */}
        {totalStreak > 0 && (
          <LinearGradient
            colors={['#27E9B5', '#6B5BFD']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.streakWidget}
          >
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakText}>
              {totalStreak}-day streak — keep going!
            </Text>
          </LinearGradient>
        )}

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
              <Text style={styles.coachPanelButtonText}>Review Goals with FitCoach</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.accent} />
            </TouchableOpacity>
          </Card>
        )}
      </ScrollView>

      {/* Add Goal Modal */}
      <AddGoalModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={(newGoal) => {
          saveGoals([...goals, newGoal]);
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
              <Text style={styles.goalTitle}>{goal.title}</Text>
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
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create New Goal</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll}>
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
                      category === cat && {
                        backgroundColor: categoryColors[cat] + '30',
                        borderColor: categoryColors[cat],
                      },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryButtonText,
                        category === cat && { color: categoryColors[cat] },
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
            <LinearGradient
              colors={['#27E9B5', '#6B5BFD']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.createButtonGradient}
            >
              <Text style={styles.createButtonText}>Create Goal</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
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
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Goal</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll}>
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
                      category === cat && {
                        backgroundColor: categoryColors[cat] + '30',
                        borderColor: categoryColors[cat],
                      },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryButtonText,
                        category === cat && { color: categoryColors[cat] },
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
            <LinearGradient
              colors={['#27E9B5', '#6B5BFD']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.createButtonGradient}
            >
              <Text style={styles.createButtonText}>Save Changes</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
    backgroundColor: colors.surfaceMute,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  coachButton: {
    borderColor: colors.accent + '50',
  },
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
    padding: spacing.lg,
  },
  coachPanelHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  coachPanelContent: {
    flex: 1,
  },
  coachPanelTitle: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  coachPanelText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  coachPanelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMute,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  coachPanelButtonText: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
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
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMute,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  categoryButtonText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  createButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  createButtonGradient: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
