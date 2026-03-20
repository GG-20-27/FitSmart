import React, { useState, useCallback, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, typography, radii } from '../theme';
import { Card } from '../ui/components';
import { apiRequest } from '../api/client';
import {
  getImprovementPlanStatus,
  activateImprovementPlan,
  getPlanContent,
  generateFitCookMealPlan,
  regenerateSingleMeal,
  generateGroceryList,
  generateRecoveryRoutine,
  generateTrainingSession,
  abandonPlan,
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
  completedAt?: string | null; // non-null = archived/completed
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

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // ## Heading → Heading
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')       // *italic* → italic
    .replace(/`(.+?)`/g, '$1')         // `code` → code
    .trim();
}

interface FitCookMealBlock {
  header: string;
  main: string;
  prep: string;
  prepTip?: string;
  swap: string;
}
interface ParsedFitCookPlan {
  title: string;
  timing: string;
  macros: string;
  completesTitle: string;
  completesHabits: string[];
  meals: FitCookMealBlock[];
  hydrationAmount: string;
  hydrationTip: string;
  groceries: string[];
}

function cleanPlanLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .trim();
}

function parseCompletesHabits(line: string, colonIdx: number): string[] {
  const inline = line.slice(colonIdx + 1).trim();
  if (!inline) return [];
  return inline.split(/\s*✓\s*/).filter(Boolean).map(h => h.trim());
}

function parseFitCookPlan(text: string): ParsedFitCookPlan {
  const result: ParsedFitCookPlan = {
    title: '', timing: '', macros: '', completesTitle: '', completesHabits: [],
    meals: [], hydrationAmount: '', hydrationTip: '', groceries: [],
  };
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    const lines = para.split('\n').map(cleanPlanLine).filter(Boolean);
    if (!lines.length) continue;
    const first = lines[0];
    if (/Fuel Plan|Meal Plan/.test(first)) {
      result.title = first;
      let inCompletes = false;
      for (const line of lines.slice(1)) {
        if (line.startsWith('Timing:')) { result.timing = line.replace('Timing:', '').trim(); inCompletes = false; }
        else if (line.startsWith('~') || line.includes('kcal')) { result.macros = line; inCompletes = false; }
        else if (line.startsWith('Completes')) {
          result.completesTitle = line;
          inCompletes = true;
          const ci = line.indexOf(':');
          if (ci !== -1) {
            const habits = parseCompletesHabits(line, ci);
            if (habits.length) { result.completesHabits = habits; inCompletes = false; }
          }
        } else if (inCompletes && line.startsWith('✓')) {
          result.completesHabits.push(line.replace(/^✓\s*/, '').trim());
        }
      }
    } else if (first.startsWith('Completes')) {
      result.completesTitle = first;
      const ci = first.indexOf(':');
      if (ci !== -1) result.completesHabits = parseCompletesHabits(first, ci);
      for (const line of lines.slice(1)) {
        if (line.startsWith('✓')) result.completesHabits.push(line.replace(/^✓\s*/, '').trim());
      }
    } else if (/^(Breakfast|Lunch|Snack|Dinner)/.test(first)) {
      const colonIdx = first.search(/:\s/);
      const header = colonIdx !== -1 ? first.slice(0, colonIdx).trim() : first;
      const inlineContent = colonIdx !== -1 ? first.slice(colonIdx + 2).trim() : '';
      const meal: FitCookMealBlock = { header, main: '', prep: '', swap: '' };
      if (inlineContent) {
        const prepMatch = inlineContent.match(/(?:\.?\s*)Prep:\s*([\d]+\s*min)/i);
        if (prepMatch) {
          meal.prep = prepMatch[1];
          meal.main = inlineContent.replace(/\.?\s*Prep:\s*[\d]+\s*min\.?/i, '').replace(/\.$/, '').trim();
        } else {
          meal.main = inlineContent.replace(/\.$/, '').trim();
        }
      }
      for (const line of lines.slice(1)) {
        if (/^Prep tip\s*→/.test(line)) meal.prepTip = line.replace(/^Prep tip\s*→\s*/, '').trim();
        else if (line.startsWith('Prep:')) meal.prep = line.replace('Prep:', '').trim().replace(/\.$/, '');
        else if (/^Swap\s*→/.test(line)) meal.swap = line.replace(/^Swap\s*→\s*/, '').trim();
        else if (!meal.main) meal.main = line.replace(/\.$/, '');
      }
      result.meals.push(meal);
    } else if (first.startsWith('Hydration')) {
      for (const line of lines.slice(1)) {
        if (/^Tip\s*→/.test(line)) result.hydrationTip = line.replace(/^Tip\s*→\s*/, '').trim();
        else if (!result.hydrationAmount) result.hydrationAmount = line;
      }
    } else if (first.startsWith('💧')) {
      result.hydrationAmount = first.replace(/^💧\s*/, '').replace(/^Drink\s+/, '').trim();
    } else if (first.startsWith('Groceries')) {
      result.groceries = lines.slice(1);
    } else if (first.startsWith('🛒')) {
      const items = first.replace(/^🛒\s*(Groceries:?\s*)?/i, '').trim();
      if (items) result.groceries = [items];
    }
  }
  return result;
}

function FitCookPlanView({
  text,
  mealOverrides,
  onRegenerateMeal,
  regeneratingMealIdx,
}: {
  text: string;
  mealOverrides?: Record<number, FitCookMealBlock>;
  onRegenerateMeal?: (mealIdx: number, meal: FitCookMealBlock) => void;
  regeneratingMealIdx?: number | null;
  preferences?: string;
  allergies?: string;
}) {
  const [copiedMeal, setCopiedMeal] = useState<number | null>(null);
  const plan = parseFitCookPlan(text);

  if (!plan.title && !plan.meals.length) {
    return <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 22 }}>{text}</Text>;
  }

  const copyMeal = async (meal: FitCookMealBlock, idx: number) => {
    const lines = [meal.header, meal.main, meal.prep ? `Prep: ${meal.prep}` : '', meal.prepTip ?? '', meal.swap ? `Swap → ${meal.swap}` : ''].filter(Boolean);
    await Clipboard.setStringAsync(lines.join('\n'));
    setCopiedMeal(idx);
    setTimeout(() => setCopiedMeal(null), 2000);
  };

  return (
    <View>
      {/* Section label */}
      <Text style={{ fontSize: 9, color: colors.accent, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>YOUR FUEL PLAN</Text>

      {/* Title */}
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>{plan.title}</Text>

      {/* Timing chips */}
      {!!plan.timing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
          <Ionicons name="time-outline" size={12} color={colors.accent} />
          {plan.timing.split(' → ').map((t, i, arr) => (
            <React.Fragment key={i}>
              <View style={{ backgroundColor: colors.bgSecondary, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: colors.surfaceMute + '50' }}>
                <Text style={{ fontSize: 12, color: colors.textPrimary, fontWeight: '500' }}>{t}</Text>
              </View>
              {i < arr.length - 1 && <Text style={{ fontSize: 11, color: colors.textMuted }}>→</Text>}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Macros */}
      {!!plan.macros && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.md }}>
          <Ionicons name="flame-outline" size={12} color={colors.textMuted} />
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{plan.macros}</Text>
        </View>
      )}

      {/* Habits checklist */}
      {plan.completesHabits.length > 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={{ fontSize: 9, color: colors.accent, fontWeight: '700', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Today's Plan Habits</Text>
          {plan.completesHabits.map((habit, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <Ionicons name="checkmark" size={13} color={colors.accent} />
              <Text style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 20, flex: 1 }}>{habit}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Divider before meals */}
      <View style={{ height: 1, backgroundColor: colors.surfaceMute + '40', marginBottom: spacing.md }} />

      {/* Meal cards */}
      {plan.meals.map((meal, i) => {
        const displayMeal = mealOverrides?.[i] ?? meal;
        const isRegenerating = regeneratingMealIdx === i;
        return (
          <View key={i} style={{ backgroundColor: colors.bgSecondary, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm, opacity: isRegenerating ? 0.6 : 1, borderWidth: 1, borderColor: colors.surfaceMute + '40', borderLeftWidth: 3, borderLeftColor: colors.accent + '70' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>{displayMeal.header}</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {onRegenerateMeal && (
                  <TouchableOpacity onPress={() => !isRegenerating && onRegenerateMeal(i, displayMeal)} style={{ padding: 4 }}>
                    {isRegenerating
                      ? <ActivityIndicator size={13} color={colors.accent} />
                      : <Ionicons name="refresh-outline" size={14} color={colors.accent} />}
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => copyMeal(displayMeal, i)} style={{ padding: 4 }}>
                  <Ionicons name={copiedMeal === i ? 'checkmark' : 'copy-outline'} size={14} color={copiedMeal === i ? colors.success : colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={{ fontSize: 14, color: colors.textPrimary + 'CC', lineHeight: 20, marginBottom: 6 }}>{displayMeal.main}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginBottom: displayMeal.swap ? 6 : 0 }}>
              {!!displayMeal.prep && (
                <View style={{ backgroundColor: colors.accent + '18', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: colors.accent, fontWeight: '600' }}>{`Prep: ${displayMeal.prep}`}</Text>
                </View>
              )}
              {!!displayMeal.prepTip && (
                <Text style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic' }}>{displayMeal.prepTip}</Text>
              )}
            </View>
            {!!displayMeal.swap && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 12, color: colors.accent, fontWeight: '600' }}>Swap → </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>{displayMeal.swap}</Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Hydration */}
      {!!plan.hydrationAmount && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.bgSecondary, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.surfaceMute + '40' }}>
          <Ionicons name="water-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Hydration</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>{plan.hydrationAmount}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function GroceryCard({ groceries, onCopy }: { groceries: string[]; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <View style={{ backgroundColor: colors.bgSecondary, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ fontSize: 16 }}>🛒</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Groceries</Text>
        </View>
        <TouchableOpacity onPress={handleCopy} style={{ padding: 4 }}>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? colors.success : colors.textMuted} />
        </TouchableOpacity>
      </View>
      {groceries.map((line, i) => {
        const ci = line.indexOf(':');
        if (ci !== -1) {
          const cat = line.slice(0, ci).trim();
          const items = line.slice(ci + 1).trim().split(',').map(s => {
            const t = s.trim();
            return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
          }).filter(Boolean);
          return (
            <View key={i} style={{ marginBottom: spacing.sm }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5, marginBottom: 3, textTransform: 'uppercase' }}>{cat}</Text>
              {items.map((item, j) => (
                <Text key={j} style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 20 }}>{item}</Text>
              ))}
            </View>
          );
        }
        return <Text key={i} style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 20 }}>{line}</Text>;
      })}
    </View>
  );
}

interface TrainingExercise { exercise: string; detail: string; }
interface ParsedTrainingSession {
  totalTime: string;
  warmup: TrainingExercise[]; warmupDuration: string;
  mainBlock: TrainingExercise[];
  finisher: TrainingExercise[];
}
function parseTrainingSession(text: string): ParsedTrainingSession {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let totalTime = '', warmupDuration = '';
  let section: 'warmup' | 'main' | 'finisher' | null = null;
  const warmup: TrainingExercise[] = [], mainBlock: TrainingExercise[] = [], finisher: TrainingExercise[] = [];
  for (const line of lines) {
    if (/^total time:/i.test(line)) { totalTime = line.replace(/^total time:\s*/i, ''); continue; }
    if (/^warm.?up/i.test(line)) { section = 'warmup'; const m = line.match(/\(([^)]+)\)/); if (m) warmupDuration = m[1]; continue; }
    if (/^main block/i.test(line)) { section = 'main'; continue; }
    if (/^(finisher|cooldown)/i.test(line)) { section = 'finisher'; continue; }
    if ((line.startsWith('•') || line.startsWith('-')) && section) {
      const content = line.replace(/^[•\-]\s*/, '');
      const dashIdx = content.indexOf(' — ');
      const item: TrainingExercise = dashIdx >= 0
        ? { exercise: content.substring(0, dashIdx), detail: content.substring(dashIdx + 3) }
        : { exercise: content, detail: '' };
      if (section === 'warmup') warmup.push(item);
      else if (section === 'main') mainBlock.push(item);
      else if (section === 'finisher') finisher.push(item);
    }
  }
  return { totalTime, warmup, warmupDuration, mainBlock, finisher };
}

function parseRoutine(text: string): { totalTime: string; steps: { time: string; action: string; sub?: string }[]; why: string[] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const steps: { time: string; action: string; sub?: string }[] = [];
  const why: string[] = [];
  let totalTime = '';
  let inWhy = false;
  for (const line of lines) {
    if (/^total time:/i.test(line)) { totalTime = line.replace(/^total time:\s*/i, ''); continue; }
    if (/^why this helps/i.test(line)) { inWhy = true; continue; }
    if (inWhy) { why.push(line.replace(/^[-•]\s*/, '')); continue; }
    const m = line.match(/^(\d{1,2}:\d{2})\s*\|\s*(.+)$/);
    if (m) { steps.push({ time: m[1], action: m[2] }); continue; }
    if (steps.length > 0) { steps[steps.length - 1].sub = line; }
  }
  return { totalTime, steps, why };
}

function RoutineBody({ routine }: { routine: string }) {
  const parsed = parseRoutine(routine);
  if (parsed.steps.length === 0) {
    return <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 18 }}>{routine}</Text>;
  }
  return (
    <View>
      {parsed.totalTime ? (
        <Text style={{ fontSize: 10, color: colors.textMuted, marginBottom: 8 }}>Total time: {parsed.totalTime}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        <Text style={{ width: 46, fontSize: 9, color: colors.accent, fontWeight: '700', letterSpacing: 0.8 }}>TIME</Text>
        <Text style={{ flex: 1, fontSize: 9, color: colors.accent, fontWeight: '700', letterSpacing: 0.8 }}>ACTION</Text>
      </View>
      {parsed.steps.map((step, i) => (
        <View key={i} style={{ marginBottom: step.sub ? 12 : 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Text style={{ width: 46, fontSize: 11, color: colors.textMuted + '99', fontWeight: '400' }}>{step.time}</Text>
            <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary, lineHeight: 18, fontWeight: '600' }}>{step.action}</Text>
          </View>
          {step.sub && (
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: 46 }} />
              <Text style={{ flex: 1, fontSize: 12, color: colors.textPrimary + 'CC', lineHeight: 17, marginTop: 2 }}>{step.sub}</Text>
            </View>
          )}
        </View>
      ))}
      {parsed.why.length > 0 && (
        <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.surfaceMute, paddingTop: 8 }}>
          <Text style={{ fontSize: 9, color: colors.accent, fontWeight: '700', letterSpacing: 0.8, marginBottom: 5 }}>WHY THIS HELPS</Text>
          {parsed.why.map((b, i) => (
            <Text key={i} style={{ fontSize: 11, color: colors.textMuted, lineHeight: 16, marginBottom: 3 }}>· {b}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function GoalsScreen() {
  const navigation = useNavigation();
  const scrollViewRef = useRef<ScrollView>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [activeGoalsTab, setActiveGoalsTab] = useState<'Active' | 'Completed'>('Active');
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [totalStreak, setTotalStreak] = useState(0);
  const [avgFitScore, setAvgFitScore] = useState(0);
  const [fitScoreDelta, setFitScoreDelta] = useState(0);


  // Load saved FitCook settings
  useEffect(() => {
    AsyncStorage.multiGet(['@fitcook_times', '@fitcook_prefs', '@fitcook_allergies']).then(pairs => {
      const times = pairs[0][1]; const prefs = pairs[1][1]; const allergies = pairs[2][1];
      if (times) { try { setFitCookTimes(JSON.parse(times)); } catch {} }
      if (prefs) setFitCookPrefs(prefs);
      if (allergies) setFitCookAllergies(allergies);
    }).catch(() => {});
  }, []);

  // Improvement Plan state
  const [improvementPlanStatus, setImprovementPlanStatus] = useState<ImprovementPlanStatus | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planContent, setPlanContent] = useState<PlanContent | null>(null);
  const [modalPillar, setModalPillar] = useState<string>('');
  const [activatingPlan, setActivatingPlan] = useState(false);
  const [sleepWindowSetup, setSleepWindowSetup] = useState(false);
  // FitCook state
  const [showFitCookModal, setShowFitCookModal] = useState(false);
  const [fitCookTimes, setFitCookTimes] = useState({ breakfast: '', lunch: '', dinner: '' });
  const [fitCookPrefs, setFitCookPrefs] = useState('');
  const [fitCookAllergies, setFitCookAllergies] = useState('');
  const [fitCookLoading, setFitCookLoading] = useState(false);
  const [fitCookRegenerating, setFitCookRegenerating] = useState(false);
  const [fitCookResult, setFitCookResult] = useState<string | null>(null);
  const [fitCookMealOverrides, setFitCookMealOverrides] = useState<Record<number, FitCookMealBlock>>({});
  const [fitCookRegeneratingMealIdx, setFitCookRegeneratingMealIdx] = useState<number | null>(null);
  const [fitCookCopied, setFitCookCopied] = useState(false);
  const [fitCookGroceries, setFitCookGroceries] = useState<string[] | null>(null);
  const [fitCookGroceriesStale, setFitCookGroceriesStale] = useState(false);
  const [fitCookGroceriesLoading, setFitCookGroceriesLoading] = useState(false);
  const fitCookLastSettings = useRef<{
    times?: { breakfast: string; lunch: string; dinner: string };
    preferences?: string;
    allergies?: string;
  } | null>(null);

  // Recovery routine state
  const [morningRoutine, setMorningRoutine] = useState<string | null>(null);
  const [windDownRoutine, setWindDownRoutine] = useState<string | null>(null);
  const [generatingMorningRoutine, setGeneratingMorningRoutine] = useState(false);
  const [generatingWindDownRoutine, setGeneratingWindDownRoutine] = useState(false);
  const [morningRoutineCopied, setMorningRoutineCopied] = useState(false);
  const [windDownRoutineCopied, setWindDownRoutineCopied] = useState(false);
  const morningVariantIdx = useRef(0);
  const windDownVariantIdx = useRef(0);
  const ROUTINE_VARIANTS = ['A', 'B', 'C', 'D'];
  // Training session generator state
  const [showTrainingGenerator, setShowTrainingGenerator] = useState(false);
  const [trainingSessionGoal, setTrainingSessionGoal] = useState('');
  const [trainingBodyFocus, setTrainingBodyFocus] = useState<'Upper body' | 'Lower body' | ''>('');
  const [trainingSessionLoading, setTrainingSessionLoading] = useState(false);
  const [trainingSessionResult, setTrainingSessionResult] = useState<string | null>(null);
  const [trainingSessionCopied, setTrainingSessionCopied] = useState(false);
  const trainingVariantRef = useRef(0);
  const TRAINING_SESSION_GOALS = ['Strength', 'Explosiveness', 'Endurance', 'Core / mobility', 'Recovery / Light Movement'];
  // Compose the final goal string sent to the API
  const trainingFinalGoal = (trainingSessionGoal === 'Strength' || trainingSessionGoal === 'Explosiveness')
    ? (trainingBodyFocus ? `${trainingBodyFocus} ${trainingSessionGoal.toLowerCase()}` : '')
    : trainingSessionGoal;
  const [sleepBedtime, setSleepBedtime] = useState('');
  const [sleepWakeTime, setSleepWakeTime] = useState('');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionData, setCompletionData] = useState<{ pillar: string; avg: number } | null>(null);
  const completionScaleAnim = useRef(new Animated.Value(0));
  const [showEndedModal, setShowEndedModal] = useState(false);
  const [endedData, setEndedData] = useState<{ pillar: string; avg: number | null } | null>(null);
  const endedSlideAnim = useRef(new Animated.Value(300));
  const prevActivePlanIdsRef = useRef<Map<number, { pillar: string }>>(new Map());

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
    setModalPillar(pillar);
    setShowPlanModal(true);
    if (!planContent) {
      try {
        const content = await getPlanContent(pillar);
        setPlanContent(content);
      } catch {}
    }
  };

  const handleActivatePlan = async (pillar: string, bedtime?: string, wakeTime?: string) => {
    setActivatingPlan(true);
    try {
      const plan = await activateImprovementPlan({ pillar, bedtime, wakeTime });
      setSleepWindowSetup(false);
      try {
        const fresh = await getImprovementPlanStatus();
        setImprovementPlanStatus(fresh);
      } catch {
        setImprovementPlanStatus(prev => prev ? {
          ...prev,
          activePlan: plan,
          activePlans: [...(prev.activePlans ?? (prev.activePlan ? [prev.activePlan] : [])), plan],
          pendingPlan: undefined,
        } : prev);
      }
      handleOpenPlanModal(plan.pillar);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not activate plan');
    } finally {
      setActivatingPlan(false);
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
      const serverCtx = await saveUserContext(updated);
      setContext(serverCtx);
    } catch {
      // silent fail
    }
  }, [context]);

  const updateContextBatch = useCallback(async (updates: Partial<UserContext>) => {
    const updated = { ...context, ...updates };
    setContext(updated);
    try {
      const serverCtx = await saveUserContext(updated);
      setContext(serverCtx);
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
            completedAt: g.completedAt ?? null,
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
          completedAt: goal.completedAt ?? null,
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
      getImprovementPlanStatus()
        .then(status => {
          const prevMap = prevActivePlanIdsRef.current;
          const newActiveIds = new Set((status.activePlans ?? []).map(p => p.id));
          if (prevMap.size > 0) {
            for (const [id, { pillar }] of prevMap) {
              if (!newActiveIds.has(id)) {
                const resolved = status.completedPlans.find(p => p.id === id);
                // Only celebrate genuine completions — not expirations
                if (resolved?.status === 'completed') {
                  const avg = resolved.rollingAvgAtCompletion ?? 0;
                  setCompletionData({ pillar, avg });
                  completionScaleAnim.current.setValue(0);
                  setShowCompletionModal(true);
                  Animated.spring(completionScaleAnim.current, {
                    toValue: 1, useNativeDriver: true, tension: 80, friction: 7,
                  }).start();
                } else if (resolved?.status === 'expired') {
                  setEndedData({ pillar, avg: resolved.rollingAvgAtCompletion ?? null });
                  endedSlideAnim.current.setValue(300);
                  setShowEndedModal(true);
                  Animated.spring(endedSlideAnim.current, { toValue: 0, useNativeDriver: true, tension: 80, friction: 8 }).start();
                }
                break;
              }
            }
          }
          const newMap = new Map<number, { pillar: string }>();
          for (const p of (status.activePlans ?? [])) newMap.set(p.id, { pillar: p.pillar });
          prevActivePlanIdsRef.current = newMap;
          setImprovementPlanStatus(status);
        })
        .catch(() => {});
    }, [loadGoals, loadContext])
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

  // Mark goal as complete (archive it)
  const completeGoal = (goalId: string) => {
    const now = new Date().toISOString();
    const updated = goals.map(g => g.id === goalId ? { ...g, completedAt: now } : g);
    saveGoalsLocal(updated);
    const goal = updated.find(g => g.id === goalId);
    if (goal) updateGoalOnServer(goal);
  };

  // Restore a completed goal back to active
  const restoreGoal = (goalId: string) => {
    const updated = goals.map(g => g.id === goalId ? { ...g, completedAt: null } : g);
    saveGoalsLocal(updated);
    const goal = updated.find(g => g.id === goalId);
    if (goal) updateGoalOnServer(goal);
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
              const activeGoals = goals.filter(g => !g.completedAt);
              Alert.alert(
                'Edit Goals',
                'Select a goal to edit:',
                [
                  ...activeGoals.map(goal => ({
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

        {/* Goals List — Active / Completed tabs */}
        {(() => {
          const activeGoals = goals.filter(g => !g.completedAt);
          const completedGoals = goals.filter(g => !!g.completedAt);
          return (
            <>
              {/* Segmented control */}
              <View style={styles.goalsTabRow}>
                {(['Active', 'Completed'] as const).map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.goalsTab, activeGoalsTab === tab && styles.goalsTabActive]}
                    onPress={() => setActiveGoalsTab(tab)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.goalsTabText, activeGoalsTab === tab && styles.goalsTabTextActive]}>
                      {tab === 'Active' ? `Active (${activeGoals.length})` : `Completed (${completedGoals.length})`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {activeGoalsTab === 'Active' ? (
                activeGoals.length === 0 ? (
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
                  activeGoals.map(goal => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      expanded={expandedGoalId === goal.id}
                      onToggle={() => setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)}
                      onToggleMicrohabit={toggleMicrohabit}
                      onToggleSubgoal={toggleSubgoal}
                      onDelete={deleteGoal}
                      onComplete={completeGoal}
                      scrollViewRef={scrollViewRef}
                    />
                  ))
                )
              ) : (
                completedGoals.length === 0 ? (
                  <View style={styles.completedEmptyState}>
                    <Text style={styles.completedEmptyText}>No completed goals yet.</Text>
                  </View>
                ) : (
                  completedGoals.map(goal => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      expanded={expandedGoalId === goal.id}
                      onToggle={() => setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)}
                      onToggleMicrohabit={toggleMicrohabit}
                      onToggleSubgoal={toggleSubgoal}
                      onDelete={deleteGoal}
                      onRestore={restoreGoal}
                      scrollViewRef={scrollViewRef}
                    />
                  ))
                )
              )}
            </>
          );
        })()}

        {/* Plan Completion Celebration Modal */}
        <Modal visible={showCompletionModal} transparent animationType="fade" onRequestClose={() => setShowCompletionModal(false)}>
          <View style={styles.completionOverlay}>
            <Animated.View style={[styles.completionCard, { transform: [{ scale: completionScaleAnim.current }] }]}>
              <View style={styles.completionIconWrap}>
                <Ionicons name="trophy" size={48} color={colors.warning} />
              </View>
              <Text style={styles.completionTitle}>Plan Complete!</Text>
              <Text style={styles.completionPillar}>
                {completionData ? `${PILLAR_LABELS[completionData.pillar as keyof typeof PILLAR_LABELS] ?? completionData.pillar} Plan` : ''}
              </Text>
              {completionData && completionData.avg > 0 && (
                <Text style={styles.completionAvg}>{`${completionData.avg.toFixed(1)} / 10`}</Text>
              )}
              <Text style={styles.completionMessage}>Great work! You've consistently hit your targets this week.</Text>
              <TouchableOpacity
                style={styles.completionCloseBtn}
                onPress={() => { setShowCompletionModal(false); setCompletionData(null); completionScaleAnim.current.setValue(0); }}
                activeOpacity={0.8}
              >
                <Text style={styles.completionCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>

        {/* Plan Ended / Expired Modal */}
        <Modal visible={showEndedModal} transparent animationType="fade" onRequestClose={() => setShowEndedModal(false)}>
          <View style={styles.completionOverlay}>
            <Animated.View style={[styles.endedCard, { transform: [{ translateY: endedSlideAnim.current }] }]}>
              <Ionicons name="leaf-outline" size={40} color={colors.warning} />
              <Text style={styles.endedTitle}>Almost there.</Text>
              <Text style={styles.endedPillar}>
                {endedData ? `${PILLAR_LABELS[endedData.pillar as keyof typeof PILLAR_LABELS] ?? endedData.pillar} Plan` : ''}
              </Text>
              <Text style={styles.endedMessage}>You didn't complete this plan, but you started building the habit. Reset and go again — you're closer than you think.</Text>
              {endedData?.avg != null && endedData.avg > 0 && (
                <Text style={styles.endedAvg}>{`Average score: ${endedData.avg.toFixed(1)} / 10`}</Text>
              )}
              <TouchableOpacity
                style={styles.endedCloseBtn}
                onPress={() => { setShowEndedModal(false); setEndedData(null); endedSlideAnim.current.setValue(300); }}
                activeOpacity={0.8}
              >
                <Text style={styles.endedCloseBtnText}>Start again when ready</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>

        {/* Improvement Plans */}
        {improvementPlanStatus && (
          <>
            {/* Active plans */}
            {(improvementPlanStatus.activePlans ?? (improvementPlanStatus.activePlan ? [improvementPlanStatus.activePlan] : [])).map((plan) => {
              const avg = plan.currentRollingAvg ?? 0;
              const days = plan.daysCount ?? 0;
              const dayProgress = Math.min(days / 7, 1);
              const avgColor = avg >= 7 ? colors.success : avg >= 5 ? colors.warning : avg > 0 ? colors.danger : colors.textMuted;
              const label = PILLAR_LABELS[plan.pillar as keyof typeof PILLAR_LABELS] ?? plan.pillar;
              return (
                <View key={plan.id} style={styles.improvementPlansCard}>
                  <View style={styles.planCardHeader}>
                    <View style={styles.planCardIconWrap}>
                      <Ionicons name="shield-checkmark-outline" size={15} color={colors.accent} />
                    </View>
                    <Text style={styles.planCardLabel}>{`${label} Plan`}</Text>
                  </View>
                  <View style={styles.improvementPlanActiveBlock}>
                    <Text style={styles.planActiveMeta}>{`Active · Day ${days} of 7`}</Text>
                    <View style={styles.planProgressRow}>
                      <View style={styles.planProgressBar}>
                        <View style={[styles.planProgressFill, { width: `${dayProgress * 100}%` as any }]} />
                      </View>
                      <Text style={[styles.planProgressLabel, { color: avgColor }]}>
                        {avg > 0 ? `avg ${avg.toFixed(1)}` : `${days}/7`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.planViewBtn}
                      onPress={() => handleOpenPlanModal(plan.pillar)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.planViewBtnText}>View Plan</Text>
                      <Ionicons name="arrow-forward" size={13} color={colors.bgPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* Pending plans */}
            {(improvementPlanStatus.pendingPlans ?? (improvementPlanStatus.pendingPlan ? [improvementPlanStatus.pendingPlan] : [])).map((pending) => {
              const label = PILLAR_LABELS[pending.pillar as keyof typeof PILLAR_LABELS] ?? pending.pillar;
              return (
                <View key={pending.pillar} style={styles.improvementPlansCard}>
                  <View style={styles.planCardHeader}>
                    <View style={styles.planCardIconWrap}>
                      <Ionicons name="shield-checkmark-outline" size={15} color={colors.accent} />
                    </View>
                    <Text style={styles.planCardLabel}>{`${label} Plan`}</Text>
                  </View>
                  <View style={styles.improvementPlanActiveBlock}>
                    {pending.unlocked ? (
                      <>
                        <Text style={styles.planActiveMeta}>{`${label} was your lowest pillar this week`}</Text>
                        {pending.pillar === 'recovery' && sleepWindowSetup ? (
                          <View style={{ marginTop: 10, gap: 8 }}>
                            <Text style={styles.planActiveMeta}>Set your sleep window:</Text>
                            <TextInput
                              style={{ borderWidth: 1, borderColor: colors.surfaceMute, borderRadius: 8, padding: 10, color: colors.textPrimary, fontSize: 14, marginTop: 4 }}
                              placeholder="Earliest bedtime (e.g. 22:30)"
                              placeholderTextColor={colors.textMuted}
                              value={sleepBedtime}
                              onChangeText={setSleepBedtime}
                            />
                            <TextInput
                              style={{ borderWidth: 1, borderColor: colors.surfaceMute, borderRadius: 8, padding: 10, color: colors.textPrimary, fontSize: 14 }}
                              placeholder="Latest wake time (e.g. 07:00)"
                              placeholderTextColor={colors.textMuted}
                              value={sleepWakeTime}
                              onChangeText={setSleepWakeTime}
                            />
                            <TouchableOpacity
                              style={styles.planViewBtn}
                              onPress={() => handleActivatePlan('recovery', sleepBedtime || undefined, sleepWakeTime || undefined)}
                              disabled={activatingPlan}
                              activeOpacity={0.75}
                            >
                              {activatingPlan ? <ActivityIndicator size="small" color={colors.bgPrimary} /> : (
                                <>
                                  <Ionicons name="shield-checkmark-outline" size={14} color={colors.bgPrimary} />
                                  <Text style={styles.planViewBtnText}>Confirm & Start Recovery Plan</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.planViewBtn}
                            onPress={pending.pillar === 'recovery' ? () => setSleepWindowSetup(true) : () => handleActivatePlan(pending.pillar)}
                            disabled={activatingPlan}
                            activeOpacity={0.75}
                          >
                            {activatingPlan ? <ActivityIndicator size="small" color={colors.bgPrimary} /> : (
                              <>
                                <Ionicons name="shield-checkmark-outline" size={14} color={colors.bgPrimary} />
                                <Text style={styles.planViewBtnText}>{`Start ${label} Plan`}</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </>
                    ) : (
                      <>
                        <Text style={styles.planActiveMeta}>{`${label} is your weak pillar`}</Text>
                        <View style={styles.planProgressRow}>
                          {[0,1,2,3,4].map(i => (
                            <View key={i} style={[styles.planDot, i < pending.weaknessCount && styles.planDotFilled]} />
                          ))}
                          <Text style={styles.planProgressLabel}>{`${pending.weaknessCount}/5 — plan unlocks at 5`}</Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Completed plans history */}
            {improvementPlanStatus.completedPlans.length > 0 && (
              <View style={styles.improvementPlansCard}>
                <View style={styles.planCardHeader}>
                  <View style={[styles.planCardIconWrap, { backgroundColor: colors.surfaceMute + '30' }]}>
                    <Ionicons name="time-outline" size={15} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.planCardLabel, { color: colors.textMuted }]}>Plan History</Text>
                </View>
                {improvementPlanStatus.completedPlans.map(cp => {
                  const label = PILLAR_LABELS[cp.pillar as keyof typeof PILLAR_LABELS] ?? cp.pillar;
                  if (cp.status === 'expired') {
                    return (
                      <View key={cp.id} style={[styles.completedPlanCard, { borderLeftColor: colors.surfaceMute }]}>
                        <Text style={styles.completedPlanLabel}>{`${label} Plan`}</Text>
                        <Text style={styles.completedPlanDate}>Plan expired — start a new one when ready</Text>
                      </View>
                    );
                  }
                  const completedDate = cp.completedAt
                    ? new Date(cp.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—';
                  const avgColor = (cp.rollingAvgAtCompletion ?? 0) >= 7 ? colors.success : colors.textMuted;
                  return (
                    <View key={cp.id} style={styles.completedPlanCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.completedPlanLabel}>{`${label} Plan`}</Text>
                        <Text style={[styles.completedPlanAvg, { color: avgColor }]}>
                          {cp.rollingAvgAtCompletion != null ? `${cp.rollingAvgAtCompletion.toFixed(1)} avg` : '—'}
                        </Text>
                      </View>
                      <Text style={styles.completedPlanDate}>{`Completed ${completedDate}`}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* Plan Modal */}
        <Modal
          visible={showPlanModal}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => { setShowPlanModal(false); setPlanContent(null); setModalPillar(''); setMorningRoutine(null); setWindDownRoutine(null); setShowTrainingGenerator(false); setTrainingSessionResult(null); }}
        >
          <View style={styles.planModalContainer}>
            <TouchableOpacity
              onPress={() => { setShowPlanModal(false); setPlanContent(null); setModalPillar(''); setMorningRoutine(null); setWindDownRoutine(null); setShowTrainingGenerator(false); setTrainingSessionResult(null); }}
              style={styles.planModalCloseBtn}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>

            {planContent ? (
              <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
                {/* Hero header */}
                {(() => {
                  const plan = (improvementPlanStatus?.activePlans ?? []).find(p => p.pillar === modalPillar) ?? improvementPlanStatus?.activePlan;
                  const avg = plan?.currentRollingAvg ?? 0;
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
                          {/* Days progress bar */}
                          <View style={{ width: '100%' as any, gap: 4 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600', letterSpacing: 0.5 }}>DAYS</Text>
                              <Text style={{ fontSize: 10, color: colors.textMuted }}>{`${days} / 7`}</Text>
                            </View>
                            <View style={{ position: 'relative' as const }}>
                              <View style={styles.planModalProgressBg}>
                                <View style={[styles.planModalProgressFill, { width: `${Math.min(days / 7, 1) * 100}%` as any }]} />
                              </View>
                              <View style={{ position: 'absolute' as const, left: '71%' as any, top: -2, bottom: -2, width: 2, backgroundColor: colors.accent, borderRadius: 1 }} />
                            </View>
                            <Text style={{ fontSize: 9, color: colors.accent, textAlign: 'right' as const }}>≥ 5 days to complete</Text>
                          </View>
                          {/* Avg bar — 0–10 scale with 7.0 completion threshold */}
                          <View style={{ width: '100%' as any, gap: 4, marginTop: 8 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600', letterSpacing: 0.5 }}>AVG SCORE</Text>
                              <Text style={{ fontSize: 10, fontWeight: '700' as const, color: avgColor }}>
                                {avg > 0 ? avg.toFixed(1) : '—'} / 10
                              </Text>
                            </View>
                            <View style={{ position: 'relative' as const }}>
                              <View style={styles.planModalProgressBg}>
                                <View style={[styles.planModalProgressFill, { width: `${Math.min(avg / 10, 1) * 100}%` as any, backgroundColor: avgColor }]} />
                              </View>
                              <View style={{ position: 'absolute' as const, left: '70%' as any, top: -2, bottom: -2, width: 2, backgroundColor: colors.success, borderRadius: 1 }} />
                            </View>
                            <Text style={{ fontSize: 9, color: colors.success, textAlign: 'right' as const }}>≥ 7.0 to complete</Text>
                          </View>
                          {days < 5 && avg >= 7.0 && (
                            <Text style={{ fontSize: 10, color: colors.warning, textAlign: 'center' as const, marginTop: 6 }}>
                              {`${5 - days} more logged day${5 - days !== 1 ? 's' : ''} to complete`}
                            </Text>
                          )}
                        </>
                      )}
                    </View>
                  );
                })()}

                <View style={{ paddingHorizontal: spacing.xl }}>
                  {/* Trigger line */}
                  <Text style={styles.planModalTrigger}>{planContent.triggerLine}</Text>

                  {/* Evidence — only when available */}
                  {planContent.evidence && planContent.evidence.length > 0 && (
                    <>
                      <Text style={styles.planSectionLabel}>Why this plan</Text>
                      <View style={styles.planEvidenceBlock}>
                        {planContent.evidence.map((e, i) => (
                          <View key={i} style={styles.planEvidenceRow}>
                            <Ionicons name="stats-chart-outline" size={14} color={colors.accent} />
                            <Text style={styles.planEvidenceText}>{e}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Targets */}
                  {planContent.targets && planContent.targets.length > 0 && (
                    <>
                      <Text style={styles.planSectionLabel}>Plan goals</Text>
                      <View style={styles.planTargetsBlock}>
                        {planContent.targets.map((t, i) => (
                          <View key={i} style={styles.planTargetRow}>
                            <Ionicons name="add-circle-outline" size={16} color={colors.accent} />
                            <Text style={styles.planTargetText}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Today's Training Direction — training pillar only */}
                  {modalPillar === 'training' && planContent.trainingDirection && (
                    <>
                      <Text style={styles.planSectionLabel}>Today's training direction</Text>
                      <View style={styles.trainingDirectionCard}>
                        <View style={styles.trainingDirectionHeader}>
                          <Ionicons name="flash-outline" size={16} color={colors.accent} />
                          <Text style={styles.trainingDirectionLabel}>{planContent.trainingDirection.direction}</Text>
                        </View>
                        <Text style={styles.trainingDirectionExplanation}>{planContent.trainingDirection.explanation}</Text>
                        <TouchableOpacity
                          style={styles.trainingDirectionCTA}
                          activeOpacity={0.7}
                          onPress={() => {
                            const dir = (planContent.trainingDirection?.direction ?? '').toLowerCase();
                            const preGoal = dir.includes('endurance') ? 'Endurance'
                              : dir.includes('rest') || dir.includes('recovery mobil') ? 'Recovery / Light Movement'
                              : dir.includes('light movement') ? 'Recovery / Light Movement'
                              : dir.includes('mobil') ? 'Core / mobility'
                              : dir.includes('explos') ? 'Explosiveness'
                              : 'Strength';
                            setTrainingSessionGoal(preGoal);
                            setTrainingBodyFocus(preGoal === 'Strength' ? (dir.includes('lower') ? 'Lower body' : 'Upper body') : '');
                            setShowTrainingGenerator(true);
                            setTrainingSessionResult(null);
                          }}
                        >
                          <Text style={styles.trainingDirectionCTAText}>Generate a training session  →</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Training Session Generator — expands inline */}
                      {showTrainingGenerator && (
                        <View style={styles.trainingGeneratorSection}>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                            {TRAINING_SESSION_GOALS.map(goal => (
                              <TouchableOpacity
                                key={goal}
                                onPress={() => {
                                  setTrainingSessionGoal(goal);
                                  if (goal !== 'Strength' && goal !== 'Explosiveness') setTrainingBodyFocus('');
                                }}
                                style={[styles.trainingGoalPill, trainingSessionGoal === goal && styles.trainingGoalPillActive]}
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.trainingGoalPillText, trainingSessionGoal === goal && styles.trainingGoalPillTextActive]}>{goal}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>

                          {/* Secondary body focus selector */}
                          {(trainingSessionGoal === 'Strength' || trainingSessionGoal === 'Explosiveness') && (
                            <View style={{ marginBottom: spacing.sm }}>
                              <Text style={styles.bodyFocusLabel}>Select focus area</Text>
                              <View style={styles.bodyFocusRow}>
                                {(['Upper body', 'Lower body'] as const).map(focus => (
                                  <TouchableOpacity
                                    key={focus}
                                    onPress={() => setTrainingBodyFocus(focus)}
                                    style={[styles.bodyFocusBtn, trainingBodyFocus === focus && styles.bodyFocusBtnActive]}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={[styles.bodyFocusBtnText, trainingBodyFocus === focus && styles.bodyFocusBtnTextActive]}>{focus}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}

                          <TouchableOpacity
                            style={[styles.trainingGenerateBtn, (!trainingFinalGoal || trainingSessionLoading) && { opacity: 0.45 }]}
                            disabled={!trainingFinalGoal || trainingSessionLoading}
                            activeOpacity={0.75}
                            onPress={async () => {
                              setTrainingSessionLoading(true);
                              setTrainingSessionResult(null);
                              try {
                                const res = await generateTrainingSession({
                                  goal: trainingFinalGoal,
                                  direction: planContent?.trainingDirection?.direction,
                                  variant: ['A', 'B', 'C', 'D'][trainingVariantRef.current % 4],
                                });
                                setTrainingSessionResult(res.session);
                              } catch (e: any) {
                                Alert.alert('Error', e?.message || 'Could not generate session');
                              } finally {
                                setTrainingSessionLoading(false);
                              }
                            }}
                          >
                            {trainingSessionLoading
                              ? <ActivityIndicator size="small" color={colors.bgPrimary} />
                              : <><Ionicons name="barbell-outline" size={14} color={colors.bgPrimary} /><Text style={styles.trainingGenerateBtnText}>Generate Session</Text></>
                            }
                          </TouchableOpacity>

                          {trainingSessionResult && (() => {
                            const parsed = parseTrainingSession(trainingSessionResult);
                            return (
                              <View style={styles.trainingSessionResult}>
                                <View style={styles.trainingSessionResultHeader}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons name="barbell-outline" size={14} color={colors.accent} />
                                    <Text style={styles.trainingSessionResultTitle}>{trainingFinalGoal}</Text>
                                  </View>
                                  <View style={styles.recoveryRoutineResultActions}>
                                    <TouchableOpacity
                                      style={styles.recoveryRoutineActionBtn}
                                      onPress={async () => {
                                        await Clipboard.setStringAsync(trainingSessionResult);
                                        setTrainingSessionCopied(true);
                                        setTimeout(() => setTrainingSessionCopied(false), 2000);
                                      }}
                                    >
                                      <Ionicons name={trainingSessionCopied ? 'checkmark' : 'copy-outline'} size={14} color={colors.accent} />
                                      <Text style={styles.recoveryRoutineActionText}>{trainingSessionCopied ? 'Copied' : 'Copy'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.recoveryRoutineActionBtn}
                                      onPress={async () => {
                                        trainingVariantRef.current = (trainingVariantRef.current + 1) % 4;
                                        setTrainingSessionLoading(true);
                                        setTrainingSessionResult(null);
                                        try {
                                          const res = await generateTrainingSession({
                                            goal: trainingFinalGoal,
                                            direction: planContent?.trainingDirection?.direction,
                                            variant: ['A', 'B', 'C', 'D'][trainingVariantRef.current % 4],
                                          });
                                          setTrainingSessionResult(res.session);
                                        } catch (e: any) {
                                          Alert.alert('Error', e?.message || 'Could not regenerate');
                                        } finally {
                                          setTrainingSessionLoading(false);
                                        }
                                      }}
                                    >
                                      <Ionicons name="refresh-outline" size={14} color={colors.accent} />
                                      <Text style={styles.recoveryRoutineActionText}>Regenerate</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                                <View style={{ height: 1, backgroundColor: colors.surfaceMute + '50', marginBottom: 10 }} />
                                {parsed.totalTime ? (
                                  <Text style={styles.trainingSessionTotalTime}>Total time: {parsed.totalTime}</Text>
                                ) : null}
                                {parsed.warmup.length > 0 && (
                                  <View style={styles.trainingSessionBlock}>
                                    <Text style={styles.trainingSessionBlockLabel}>WARM-UP{parsed.warmupDuration ? ` (${parsed.warmupDuration})` : ''}</Text>
                                    {parsed.warmup.map((ex, i) => (
                                      <View key={i} style={styles.trainingSessionExRow}>
                                        <Text style={styles.trainingSessionExName}>{ex.exercise}</Text>
                                        {ex.detail ? <Text style={styles.trainingSessionExDetail}>{ex.detail}</Text> : null}
                                      </View>
                                    ))}
                                  </View>
                                )}
                                {parsed.mainBlock.length > 0 && (
                                  <View style={styles.trainingSessionBlock}>
                                    <Text style={styles.trainingSessionBlockLabel}>MAIN BLOCK</Text>
                                    {parsed.mainBlock.map((ex, i) => (
                                      <View key={i} style={styles.trainingSessionExRow}>
                                        <Text style={styles.trainingSessionExName}>{ex.exercise}</Text>
                                        {ex.detail ? <Text style={styles.trainingSessionExDetail}>{ex.detail}</Text> : null}
                                      </View>
                                    ))}
                                  </View>
                                )}
                                {parsed.finisher.length > 0 && (
                                  <View style={[styles.trainingSessionBlock, { marginBottom: 0 }]}>
                                    <Text style={styles.trainingSessionBlockLabel}>FINISHER</Text>
                                    {parsed.finisher.map((ex, i) => (
                                      <View key={i} style={styles.trainingSessionExRow}>
                                        <Text style={styles.trainingSessionExName}>{ex.exercise}</Text>
                                        {ex.detail ? <Text style={styles.trainingSessionExDetail}>{ex.detail}</Text> : null}
                                      </View>
                                    ))}
                                  </View>
                                )}
                              </View>
                            );
                          })()}
                        </View>
                      )}
                    </>
                  )}

                  {/* Rules card with row separators */}
                  <Text style={styles.planSectionLabel}>Plan habits</Text>
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

                  {/* Recovery Routines — recovery plans only */}
                  {modalPillar === 'recovery' && (
                    <View style={styles.recoveryRoutinesSection}>
                      <Text style={styles.planSectionLabel}>Recovery Routines</Text>

                      {/* Sleep window inputs */}
                      <View style={styles.recoveryRoutinesTimeRow}>
                        <View style={styles.recoveryRoutinesTimeField}>
                          <Text style={styles.recoveryRoutinesTimeLabel}>WAKE TIME</Text>
                          <TextInput
                            style={styles.recoveryRoutinesTimeInput}
                            value={sleepWakeTime}
                            onChangeText={setSleepWakeTime}
                            onBlur={() => sleepWakeTime && setSleepWakeTime(normalizeTime(sleepWakeTime))}
                            placeholder="07:00"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                          />
                        </View>
                        <View style={styles.recoveryRoutinesTimeDivider}>
                          <Ionicons name="arrow-forward-outline" size={14} color={colors.textMuted} />
                        </View>
                        <View style={styles.recoveryRoutinesTimeField}>
                          <Text style={styles.recoveryRoutinesTimeLabel}>BEDTIME</Text>
                          <TextInput
                            style={styles.recoveryRoutinesTimeInput}
                            value={sleepBedtime}
                            onChangeText={setSleepBedtime}
                            onBlur={() => sleepBedtime && setSleepBedtime(normalizeTime(sleepBedtime))}
                            placeholder="22:30"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                          />
                        </View>
                      </View>

                      {/* Generate buttons */}
                      <View style={styles.recoveryRoutinesBtnRow}>
                        <TouchableOpacity
                          style={[styles.recoveryRoutinesBtn, (!sleepWakeTime || generatingMorningRoutine) && { opacity: 0.5 }]}
                          onPress={async () => {
                            if (!sleepWakeTime || !sleepBedtime) {
                              Alert.alert('Required', 'Enter your bedtime and wake time first.');
                              return;
                            }
                            setGeneratingMorningRoutine(true);
                            setMorningRoutine(null);
                            try {
                              const result = await generateRecoveryRoutine({ type: 'morning', bedtime: sleepBedtime, wakeTime: sleepWakeTime, variant: ROUTINE_VARIANTS[morningVariantIdx.current % 4] });
                              setMorningRoutine(result.routine);
                            } catch (e: any) {
                              Alert.alert('Error', e?.message || 'Could not generate routine');
                            } finally {
                              setGeneratingMorningRoutine(false);
                            }
                          }}
                          disabled={generatingMorningRoutine}
                          activeOpacity={0.75}
                        >
                          {generatingMorningRoutine ? (
                            <ActivityIndicator size="small" color={colors.accent} />
                          ) : (
                            <>
                              <Ionicons name="sunny-outline" size={16} color={colors.accent} />
                              <Text style={styles.recoveryRoutinesBtnText}>Morning Routine</Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.recoveryRoutinesBtn, (!sleepBedtime || generatingWindDownRoutine) && { opacity: 0.5 }]}
                          onPress={async () => {
                            if (!sleepBedtime || !sleepWakeTime) {
                              Alert.alert('Required', 'Enter your bedtime and wake time first.');
                              return;
                            }
                            setGeneratingWindDownRoutine(true);
                            setWindDownRoutine(null);
                            try {
                              const result = await generateRecoveryRoutine({ type: 'winddown', bedtime: sleepBedtime, wakeTime: sleepWakeTime, variant: ROUTINE_VARIANTS[windDownVariantIdx.current % 4] });
                              setWindDownRoutine(result.routine);
                            } catch (e: any) {
                              Alert.alert('Error', e?.message || 'Could not generate routine');
                            } finally {
                              setGeneratingWindDownRoutine(false);
                            }
                          }}
                          disabled={generatingWindDownRoutine}
                          activeOpacity={0.75}
                        >
                          {generatingWindDownRoutine ? (
                            <ActivityIndicator size="small" color={colors.accent} />
                          ) : (
                            <>
                              <Ionicons name="moon-outline" size={16} color={colors.accent} />
                              <Text style={styles.recoveryRoutinesBtnText}>Wind-Down Routine</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>

                      {/* Morning routine result */}
                      {morningRoutine && (
                        <View style={styles.recoveryRoutineResult}>
                          <View style={styles.recoveryRoutineResultHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="sunny-outline" size={14} color={colors.accent} />
                              <Text style={styles.recoveryRoutineResultTitle}>Morning Routine</Text>
                            </View>
                            <View style={styles.recoveryRoutineResultActions}>
                              <TouchableOpacity
                                style={styles.recoveryRoutineActionBtn}
                                onPress={async () => {
                                  await Clipboard.setStringAsync(morningRoutine);
                                  setMorningRoutineCopied(true);
                                  setTimeout(() => setMorningRoutineCopied(false), 2000);
                                }}
                              >
                                <Ionicons name={morningRoutineCopied ? 'checkmark' : 'copy-outline'} size={14} color={colors.accent} />
                                <Text style={styles.recoveryRoutineActionText}>{morningRoutineCopied ? 'Copied' : 'Copy'}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.recoveryRoutineActionBtn}
                                onPress={async () => {
                                  if (!sleepBedtime || !sleepWakeTime) return;
                                  morningVariantIdx.current = (morningVariantIdx.current + 1) % 4;
                                  setGeneratingMorningRoutine(true);
                                  setMorningRoutine(null);
                                  try {
                                    const result = await generateRecoveryRoutine({ type: 'morning', bedtime: sleepBedtime, wakeTime: sleepWakeTime, variant: ROUTINE_VARIANTS[morningVariantIdx.current] });
                                    setMorningRoutine(result.routine);
                                  } catch (e: any) {
                                    Alert.alert('Error', e?.message || 'Could not regenerate');
                                  } finally {
                                    setGeneratingMorningRoutine(false);
                                  }
                                }}
                              >
                                <Ionicons name="refresh-outline" size={14} color={colors.accent} />
                                <Text style={styles.recoveryRoutineActionText}>Regenerate</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          <View style={{ height: 1, backgroundColor: colors.surfaceMute + '50', marginBottom: 10 }} />
                          <Text style={{ fontSize: 9, color: colors.accent, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>YOUR MORNING ROUTINE</Text>
                          <RoutineBody routine={morningRoutine} />
                        </View>
                      )}

                      {/* Wind-down routine result */}
                      {windDownRoutine && (
                        <View style={styles.recoveryRoutineResult}>
                          <View style={styles.recoveryRoutineResultHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="moon-outline" size={14} color={colors.accent} />
                              <Text style={styles.recoveryRoutineResultTitle}>Wind-Down Routine</Text>
                            </View>
                            <View style={styles.recoveryRoutineResultActions}>
                              <TouchableOpacity
                                style={styles.recoveryRoutineActionBtn}
                                onPress={async () => {
                                  await Clipboard.setStringAsync(windDownRoutine);
                                  setWindDownRoutineCopied(true);
                                  setTimeout(() => setWindDownRoutineCopied(false), 2000);
                                }}
                              >
                                <Ionicons name={windDownRoutineCopied ? 'checkmark' : 'copy-outline'} size={14} color={colors.accent} />
                                <Text style={styles.recoveryRoutineActionText}>{windDownRoutineCopied ? 'Copied' : 'Copy'}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.recoveryRoutineActionBtn}
                                onPress={async () => {
                                  if (!sleepBedtime || !sleepWakeTime) return;
                                  windDownVariantIdx.current = (windDownVariantIdx.current + 1) % 4;
                                  setGeneratingWindDownRoutine(true);
                                  setWindDownRoutine(null);
                                  try {
                                    const result = await generateRecoveryRoutine({ type: 'winddown', bedtime: sleepBedtime, wakeTime: sleepWakeTime, variant: ROUTINE_VARIANTS[windDownVariantIdx.current] });
                                    setWindDownRoutine(result.routine);
                                  } catch (e: any) {
                                    Alert.alert('Error', e?.message || 'Could not regenerate');
                                  } finally {
                                    setGeneratingWindDownRoutine(false);
                                  }
                                }}
                              >
                                <Ionicons name="refresh-outline" size={14} color={colors.accent} />
                                <Text style={styles.recoveryRoutineActionText}>Regenerate</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          <View style={{ height: 1, backgroundColor: colors.surfaceMute + '50', marginBottom: 10 }} />
                          <Text style={{ fontSize: 9, color: colors.accent, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>YOUR WIND-DOWN ROUTINE</Text>
                          <RoutineBody routine={windDownRoutine} />
                        </View>
                      )}
                    </View>
                  )}

                  {/* FitCook button — nutrition plans only */}
                  {modalPillar === 'nutrition' && (
                    <TouchableOpacity
                      style={styles.fitCookBtn}
                      onPress={() => { setFitCookResult(null); setShowFitCookModal(true); }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="restaurant-outline" size={16} color={colors.bgPrimary} />
                      <Text style={styles.fitCookBtnText}>Generate Meal Plan</Text>
                    </TouchableOpacity>
                  )}

                  {/* Abandon plan — always last */}
                  <TouchableOpacity
                    style={styles.abandonPlanBtn}
                    onPress={() => {
                      Alert.alert(
                        'Abandon Plan',
                        'This will remove your active plan. Your progress will be lost. Are you sure?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Abandon', style: 'destructive', onPress: async () => {
                              try {
                                await abandonPlan(modalPillar);
                                setShowPlanModal(false);
                                setPlanContent(null);
                                const fresh = await getImprovementPlanStatus();
                                setImprovementPlanStatus(fresh);
                                prevActivePlanIdsRef.current = new Map();
                              } catch (e: any) {
                                Alert.alert('Error', e?.message || 'Could not abandon plan');
                              }
                            }
                          },
                        ]
                      );
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.abandonPlanBtnText}>Abandon Plan</Text>
                  </TouchableOpacity>

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
                          <>
                            <ScrollView style={styles.fitCookResultScroll} contentContainerStyle={{ paddingBottom: 16 }}>
                              <FitCookPlanView
                                text={fitCookResult}
                                mealOverrides={fitCookMealOverrides}
                                regeneratingMealIdx={fitCookRegeneratingMealIdx}
                                preferences={fitCookPrefs || undefined}
                                allergies={fitCookAllergies || undefined}
                                onRegenerateMeal={async (mealIdx, meal) => {
                                  setFitCookRegeneratingMealIdx(mealIdx);
                                  try {
                                    const timeMatch = meal.header.match(/\((\d{2}:\d{2})\)/);
                                    const timing = timeMatch?.[1] ?? '12:00';
                                    const mealTypeMap = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];
                                    const mealType = (mealTypeMap[mealIdx] ?? 'Lunch') as 'Breakfast' | 'Lunch' | 'Snack' | 'Dinner';
                                    const existingText = [meal.header, meal.main, meal.prep ? `Prep: ${meal.prep}` : '', meal.prepTip ?? '', meal.swap ? `Swap → ${meal.swap}` : ''].filter(Boolean).join('\n');
                                    const res = await regenerateSingleMeal({ mealType, existingMeal: existingText, timing, preferences: fitCookPrefs || undefined, allergies: fitCookAllergies || undefined });
                                    const parsed = parseFitCookPlan(res.meal + '\n');
                                    const newMeal = parsed.meals[0] ?? { header: res.meal, main: '', prep: '', swap: '' };
                                    setFitCookMealOverrides(prev => ({ ...prev, [mealIdx]: newMeal }));
                                    if (fitCookGroceries !== null) setFitCookGroceriesStale(true);
                                  } catch (e: any) {
                                    Alert.alert('Error', e?.message || 'Could not regenerate meal');
                                  } finally {
                                    setFitCookRegeneratingMealIdx(null);
                                  }
                                }}
                              />
                              {/* Grocery List button — inline below hydration */}
                              <TouchableOpacity
                                style={[styles.fitCookBtn, styles.fitCookBtnOutline, { marginTop: spacing.sm, marginBottom: spacing.sm }, fitCookGroceriesLoading && { opacity: 0.6 }]}
                                disabled={fitCookGroceriesLoading}
                                onPress={async () => {
                                  const basePlan = parseFitCookPlan(fitCookResult ?? '');
                                  if (!fitCookGroceries) {
                                    setFitCookGroceries(basePlan.groceries.length > 0 ? basePlan.groceries : ['Loading...']);
                                    if (basePlan.groceries.length === 0 || fitCookGroceriesStale) {
                                      setFitCookGroceriesLoading(true);
                                      try {
                                        const mealTexts = basePlan.meals.map((m, i) => {
                                          const override = fitCookMealOverrides[i];
                                          const meal = override ?? m;
                                          return [meal.header, meal.main, meal.prep ? `Prep: ${meal.prep}` : '', meal.swap ? `Swap → ${meal.swap}` : ''].filter(Boolean).join(' — ');
                                        });
                                        const { groceries } = await generateGroceryList(mealTexts);
                                        setFitCookGroceries(groceries);
                                      } catch {
                                        setFitCookGroceries(basePlan.groceries.length > 0 ? basePlan.groceries : []);
                                      } finally {
                                        setFitCookGroceriesLoading(false);
                                      }
                                    }
                                  } else {
                                    setFitCookGroceriesLoading(true);
                                    try {
                                      const mealTexts = basePlan.meals.map((m, i) => {
                                        const override = fitCookMealOverrides[i];
                                        const meal = override ?? m;
                                        return [meal.header, meal.main, meal.prep ? `Prep: ${meal.prep}` : '', meal.swap ? `Swap → ${meal.swap}` : ''].filter(Boolean).join(' — ');
                                      });
                                      const { groceries } = await generateGroceryList(mealTexts);
                                      setFitCookGroceries(groceries);
                                      setFitCookGroceriesStale(false);
                                    } catch {
                                      // keep existing groceries
                                    } finally {
                                      setFitCookGroceriesLoading(false);
                                    }
                                  }
                                }}
                                activeOpacity={0.75}
                              >
                                {fitCookGroceriesLoading
                                  ? <ActivityIndicator size="small" color={colors.accent} />
                                  : <Ionicons name="cart-outline" size={14} color={colors.accent} />}
                                <Text style={[styles.fitCookBtnText, { color: colors.accent }]}>
                                  {fitCookGroceriesLoading ? 'Generating...' : fitCookGroceries ? (fitCookGroceriesStale ? 'Refresh Grocery List' : 'Grocery List ✓') : 'Generate Grocery List'}
                                </Text>
                              </TouchableOpacity>

                              {/* Grocery card — shown after user generates */}
                              {fitCookGroceries && (
                                <>
                                  {fitCookGroceriesStale && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
                                      <Ionicons name="alert-circle-outline" size={13} color={colors.warning} />
                                      <Text style={{ fontSize: 12, color: colors.warning }}>Meal plan changed — refresh grocery list</Text>
                                    </View>
                                  )}
                                  <GroceryCard
                                    groceries={fitCookGroceries}
                                    onCopy={() => Clipboard.setStringAsync(fitCookGroceries.join('\n'))}
                                  />
                                </>
                              )}
                            </ScrollView>
                            <View style={styles.fitCookResultActions}>
                              <TouchableOpacity
                                style={[styles.fitCookBtn, styles.fitCookBtnOutline, fitCookCopied && styles.fitCookBtnCopied]}
                                onPress={async () => {
                                  await Clipboard.setStringAsync(stripMarkdown(fitCookResult));
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
                                style={[styles.fitCookBtn, fitCookRegenerating && { opacity: 0.6 }]}
                                disabled={fitCookRegenerating}
                                onPress={async () => {
                                  if (!fitCookLastSettings.current) return;
                                  setFitCookRegenerating(true);
                                  try {
                                    const result = await generateFitCookMealPlan({
                                      ...fitCookLastSettings.current,
                                      previousPlan: fitCookResult ?? undefined,
                                    });
                                    setFitCookResult(result.mealPlan); setFitCookMealOverrides({}); setFitCookGroceries(null); setFitCookGroceriesStale(false);
                                  } catch (e: any) {
                                    Alert.alert('FitCook Error', e?.message || 'Could not regenerate meal plan');
                                  } finally {
                                    setFitCookRegenerating(false);
                                  }
                                }}
                                activeOpacity={0.75}
                              >
                                {fitCookRegenerating ? (
                                  <ActivityIndicator size="small" color={colors.bgPrimary} />
                                ) : (
                                  <Ionicons name="refresh-outline" size={14} color={colors.bgPrimary} />
                                )}
                                <Text style={styles.fitCookBtnText}>{fitCookRegenerating ? 'Regenerating...' : 'Regenerate'}</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        ) : (
                          <ScrollView style={styles.fitCookFormScroll} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
                            <View style={styles.fitCookTimeSection}>
                              <Text style={styles.fitCookFieldLabel}>When do you eat? (optional)</Text>
                              <Text style={styles.fitCookFieldHint}>Leave blank for flexible timing. Snack placed in biggest gap.</Text>
                              {(['breakfast', 'lunch', 'dinner'] as const).map(meal => (
                                <View key={meal} style={styles.fitCookTimeRow}>
                                  <Text style={styles.fitCookMealLabel}>{meal.charAt(0).toUpperCase() + meal.slice(1)}</Text>
                                  <View style={styles.fitCookTimeFields}>
                                    <TextInput
                                      style={[styles.fitCookTimeInput, { flex: 1 }]}
                                      value={fitCookTimes[meal]}
                                      onChangeText={v => setFitCookTimes(t => ({ ...t, [meal]: v }))}
                                      onBlur={() => { const v = fitCookTimes[meal]; if (v) setFitCookTimes(t => ({ ...t, [meal]: normalizeTime(v) })); }}
                                      placeholder={meal === 'breakfast' ? '07:00' : meal === 'lunch' ? '12:00' : '18:00'}
                                      placeholderTextColor={colors.textMuted}
                                      keyboardType="numbers-and-punctuation"
                                      maxLength={5}
                                    />
                                  </View>
                                </View>
                              ))}
                            </View>

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
                                const hasTimes = fitCookTimes.breakfast || fitCookTimes.lunch || fitCookTimes.dinner;
                                const settings = {
                                  times: hasTimes ? fitCookTimes : undefined,
                                  preferences: fitCookPrefs || undefined,
                                  allergies: fitCookAllergies || undefined,
                                };
                                fitCookLastSettings.current = settings;
                                await AsyncStorage.multiSet([
                                  ['@fitcook_times', JSON.stringify(fitCookTimes)],
                                  ['@fitcook_prefs', fitCookPrefs],
                                  ['@fitcook_allergies', fitCookAllergies],
                                ]).catch(() => {});
                                setFitCookLoading(true);
                                try {
                                  const result = await generateFitCookMealPlan(settings);
                                  setFitCookResult(result.mealPlan); setFitCookMealOverrides({}); setFitCookGroceries(null); setFitCookGroceriesStale(false);
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
  onComplete,
  onRestore,
  scrollViewRef,
}: {
  goal: Goal;
  expanded: boolean;
  onToggle: () => void;
  onToggleMicrohabit: (goalId: string, habitIndex: number) => void;
  onToggleSubgoal: (goalId: string, subgoalIndex: number) => void;
  onDelete: (goalId: string) => void;
  onComplete?: (goalId: string) => void;
  onRestore?: (goalId: string) => void;
  scrollViewRef?: React.RefObject<ScrollView | null>;
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
            {onComplete && (
              <TouchableOpacity style={styles.completeGoalButton} onPress={() => onComplete(goal.id)}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                <Text style={styles.completeGoalButtonText}>Complete</Text>
              </TouchableOpacity>
            )}
            {onRestore && (
              <TouchableOpacity style={styles.restoreGoalButton} onPress={() => onRestore(goal.id)}>
                <Ionicons name="refresh-outline" size={18} color={colors.textMuted} />
                <Text style={styles.restoreGoalButtonText}>Restore</Text>
              </TouchableOpacity>
            )}
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
  const [expandedTier, setExpandedTier] = useState<1 | 2 | 3 | 4 | null>(null);

  // Track Y positions via onLayout — reliable content-relative coordinates
  // that update automatically whenever tiers collapse/expand and layout re-settles.
  const wrapperYRef  = useRef(0);
  const tierYRef     = useRef<Record<1 | 2 | 3 | 4, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });

  const toggle = (t: 1 | 2 | 3 | 4) => {
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
        label="Phase"
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

      {/* Tier 4 — Body & Fuel */}
      <ContextTier
        label="Body & Fuel"
        badge="Tier 4"
        summary={context.weightKg ? `${context.weightKg}kg` : 'Set weight'}
        expanded={expandedTier === 4}
        onToggle={() => toggle(4)}
        onLayout={e => { tierYRef.current[4] = e.nativeEvent.layout.y; }}
      >
        <BodyFuelSection context={context} onBatchUpdate={onBatchUpdate} />
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

function BodyFuelSection({ context, onBatchUpdate }: { context: UserContext; onBatchUpdate: (u: Partial<UserContext>) => void }) {
  const [weightText, setWeightText] = useState(context.weightKg != null ? String(context.weightKg) : '');
  const [heightText, setHeightText] = useState(context.heightCm != null ? String(context.heightCm) : '');
  const [showOverride, setShowOverride] = useState(context.macroTargetOverridden);
  const [proteinText, setProteinText] = useState(context.proteinTarget != null ? String(context.proteinTarget) : '');
  const [calorieText, setCalorieText] = useState(context.calorieTarget != null ? String(context.calorieTarget) : '');

  const saveWeight = () => {
    const val = parseFloat(weightText);
    if (!isNaN(val) && val > 0) onBatchUpdate({ weightKg: val });
    else setWeightText(context.weightKg != null ? String(context.weightKg) : '');
  };

  const saveHeight = () => {
    const val = parseFloat(heightText);
    if (!isNaN(val) && val > 0) onBatchUpdate({ heightCm: val });
    else setHeightText(context.heightCm != null ? String(context.heightCm) : '');
  };

  const saveOverrideTargets = () => {
    const protein = parseInt(proteinText, 10);
    const calorie = parseInt(calorieText, 10);
    if (isNaN(protein) || isNaN(calorie)) return;
    onBatchUpdate({ proteinTarget: protein, calorieTarget: calorie, macroTargetOverridden: true });
    setShowOverride(false);
  };

  const resetToAutomatic = () => {
    setShowOverride(false);
    onBatchUpdate({ macroTargetOverridden: false });
  };

  return (
    <View style={{ paddingTop: spacing.xs }}>
      {/* Weight & Height row */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text style={ctxStyles.optGroupLabel}>WEIGHT (KG)</Text>
          <TextInput
            style={bodyFuelInputStyle}
            value={weightText}
            onChangeText={setWeightText}
            onBlur={saveWeight}
            placeholder="e.g. 80"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ctxStyles.optGroupLabel}>HEIGHT (CM)</Text>
          <TextInput
            style={bodyFuelInputStyle}
            value={heightText}
            onChangeText={setHeightText}
            onBlur={saveHeight}
            placeholder="e.g. 178"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      {/* Estimated targets display */}
      {context.proteinTarget != null && !showOverride && (
        <View style={{ backgroundColor: colors.accent + '12', borderRadius: radii.sm, padding: spacing.sm, marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 3 }}>
            {context.macroTargetOverridden ? 'Manual targets' : 'Estimated daily targets'}
          </Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
            {`${context.proteinTarget}g protein  ·  ${context.calorieTarget} kcal`}
          </Text>
        </View>
      )}

      {/* Adjust Targets / override form */}
      {showOverride ? (
        <View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={ctxStyles.optGroupLabel}>PROTEIN (G)</Text>
              <TextInput
                style={bodyFuelInputStyle}
                value={proteinText}
                onChangeText={setProteinText}
                placeholder="e.g. 160"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ctxStyles.optGroupLabel}>CALORIES (KCAL)</Text>
              <TextInput
                style={bodyFuelInputStyle}
                value={calorieText}
                onChangeText={setCalorieText}
                placeholder="e.g. 2400"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: colors.accent, borderRadius: radii.sm, paddingVertical: spacing.sm, alignItems: 'center' }}
              onPress={saveOverrideTargets}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.bgPrimary }}>Save override</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: colors.surfaceMute + '50', borderRadius: radii.sm, paddingVertical: spacing.sm, alignItems: 'center' }}
              onPress={resetToAutomatic}
            >
              <Text style={{ fontSize: 13, color: colors.textMuted }}>Reset to auto</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        context.weightKg != null && (
          <TouchableOpacity
            onPress={() => {
              setProteinText(context.proteinTarget != null ? String(context.proteinTarget) : '');
              setCalorieText(context.calorieTarget != null ? String(context.calorieTarget) : '');
              setShowOverride(true);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
          >
            <Ionicons name="create-outline" size={13} color={colors.accent} />
            <Text style={{ fontSize: 12, color: colors.accent }}>Adjust targets</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}

const bodyFuelInputStyle = {
  backgroundColor: colors.bgPrimary,
  borderRadius: radii.sm,
  borderWidth: 1,
  borderColor: colors.surfaceMute,
  paddingHorizontal: spacing.sm,
  paddingVertical: 8,
  fontSize: 14,
  color: colors.textPrimary,
};

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
  planDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceMute + '60',
  },
  planDotFilled: {
    backgroundColor: colors.accent,
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
  completedPlanCard: {
    backgroundColor: colors.bgPrimary,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.success,
  },
  completedPlanDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Plan completion celebration
  completionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: spacing.xl,
  },
  completionCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: 'center' as const,
    width: '100%' as any,
    gap: spacing.sm,
  },
  completionIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.warning + '20',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.sm,
  },
  completionTitle: {
    ...typography.h2,
    textAlign: 'center' as const,
  },
  completionPillar: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center' as const,
  },
  completionAvg: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.success,
    textAlign: 'center' as const,
  },
  completionMessage: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  completionCloseBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  completionCloseBtnText: {
    color: colors.bgPrimary,
    fontWeight: '700' as const,
    fontSize: 15,
  },
  // Abandon plan button (red outline)
  abandonPlanBtn: {
    alignSelf: 'center' as const,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  abandonPlanBtnText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: '600' as const,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute + '40',
    backgroundColor: colors.bgPrimary,
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

  // Plan modal sections
  planEvidenceBlock: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  planEvidenceRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: spacing.xs,
  },
  planEvidenceText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  planTargetsBlock: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  planTargetRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
  },
  planTargetText: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
  },
  trainingDirectionCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  trainingDirectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  trainingDirectionLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  trainingDirectionExplanation: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  trainingDirectionCTA: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  trainingDirectionCTAText: {
    fontSize: 12,
    color: colors.bgPrimary,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
  // Training Session Generator styles
  trainingGeneratorSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  trainingGoalPill: {
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginRight: spacing.xs,
  },
  trainingGoalPillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '20',
  },
  trainingGoalPillText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500' as const,
  },
  trainingGoalPillTextActive: {
    color: colors.accent,
    fontWeight: '700' as const,
  },
  bodyFocusLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
  bodyFocusRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  bodyFocusBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 11,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '80',
    backgroundColor: colors.bgSecondary,
  },
  bodyFocusBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '18',
  },
  bodyFocusBtnText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
    letterSpacing: 0.2,
  },
  bodyFocusBtnTextActive: {
    color: colors.accent,
    fontWeight: '700' as const,
  },
  trainingGenerateBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  trainingGenerateBtnText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.bgPrimary,
  },
  trainingSessionResult: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  trainingSessionResultHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
  },
  trainingSessionResultTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  trainingSessionTotalTime: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  trainingSessionBlock: {
    marginBottom: spacing.md,
  },
  trainingSessionBlockLabel: {
    fontSize: 9,
    fontWeight: '700' as const,
    color: colors.accent,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  trainingSessionExRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: spacing.xs,
    marginBottom: 4,
  },
  trainingSessionExName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  trainingSessionExDetail: {
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 0,
  },

  // Recovery Routines section
  recoveryRoutinesSection: {
    marginBottom: spacing.xl,
  },
  recoveryRoutinesTimeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  recoveryRoutinesTimeField: {
    flex: 1,
  },
  recoveryRoutinesTimeLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  recoveryRoutinesTimeInput: {
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  recoveryRoutinesTimeDivider: {
    paddingTop: 14,
    alignItems: 'center' as const,
  },
  recoveryRoutinesBtnRow: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  recoveryRoutinesBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '60',
  },
  recoveryRoutinesBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  recoveryRoutineResult: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '40',
  },
  recoveryRoutineResultHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: spacing.sm,
  },
  recoveryRoutineResultTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  recoveryRoutineResultActions: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
  },
  recoveryRoutineActionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  recoveryRoutineActionText: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600' as const,
  },
  recoveryRoutineResultText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },

  // Plan Ended / Expired modal
  endedCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: 'center' as const,
    marginHorizontal: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning + '30',
  },
  endedTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  endedPillar: {
    fontSize: 14,
    color: colors.warning,
    fontWeight: '600' as const,
  },
  endedMessage: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  endedAvg: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  endedCloseBtn: {
    backgroundColor: colors.warning,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  endedCloseBtnText: {
    color: colors.bgPrimary,
    fontWeight: '700' as const,
    fontSize: 14,
  },

  // Goals Active/Completed tab toggle
  goalsTabRow: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 12,
  },
  goalsTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center' as const,
    borderRadius: 8,
    backgroundColor: colors.surfaceMute + '15',
  },
  goalsTabActive: {
    backgroundColor: colors.accent + '20',
  },
  goalsTabText: {
    ...typography.small,
    color: colors.textMuted,
  },
  goalsTabTextActive: {
    color: colors.accent,
    fontWeight: '600' as const,
  },
  completedEmptyState: {
    alignItems: 'center' as const,
    paddingVertical: 32,
  },
  completedEmptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
  completeGoalButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.success + '60',
    backgroundColor: colors.success + '10',
  },
  completeGoalButtonText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  restoreGoalButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  restoreGoalButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500' as const,
  },
});
