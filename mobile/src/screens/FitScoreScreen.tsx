import React, { useState, useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { apiRequest } from '../api/client';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Modal, Alert, ActivityIndicator, Platform, Dimensions, FlatList, Animated, PanResponder, KeyboardAvoidingView, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, spacing, typography, radii } from '../theme';
import { Button } from '../ui/components';
import FitScoreTriangle from '../components/FitScoreTriangle';
import {
  uploadMeal,
  getMealsByDate,
  deleteMeal as deleteMealAPI,
  saveTrainingData,
  getTrainingDataByDate,
  updateTrainingData,
  deleteTrainingData as deleteTrainingDataAPI,
  analyzeTraining,
  calculateFitScore,
  getCoachSummary,
  getStoredFitScore,
  formatDate,
  type MealData,
  type TrainingDataEntry,
  type TrainingAnalysisResponse,
  type FitScoreResponse,
  type CoachSummaryResponse,
  type CoachSlide,
  type StoredFitScore,
  type WaterIntakeBand,
} from '../api/fitscore';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.92;
const DISMISS_THRESHOLD = 120;

function CoachModal({
  visible,
  onClose,
  coachSummary,
  activeSlideIndex,
  setActiveSlideIndex,
}: {
  visible: boolean;
  onClose: () => void;
  coachSummary: CoachSummaryResponse | null;
  activeSlideIndex: number;
  setActiveSlideIndex: (i: number) => void;
}) {
  const translateY = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(MODAL_HEIGHT);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 25,
          stiffness: 200,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const dismissModal = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: MODAL_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD || gestureState.vy > 0.5) {
          dismissModal();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 25,
            stiffness: 200,
          }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissModal}
    >
      <View style={styles.coachModalOverlay}>
        <Animated.View
          style={[styles.coachModalBackdrop, { opacity: backdropOpacity }]}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismissModal} />
        </Animated.View>

        <Animated.View
          style={[
            styles.coachModalSheet,
            { transform: [{ translateY }] },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Drag handle — tap to dismiss */}
          <TouchableOpacity
            style={styles.coachModalTopBar}
            activeOpacity={0.7}
            onPress={dismissModal}
          >
            <View style={styles.coachDragHandle} />
            <Ionicons name="chevron-down" size={20} color="#555" style={{ marginTop: 4 }} />
          </TouchableOpacity>

          {/* Title */}
          <View style={styles.coachModalHeader}>
            <Text style={styles.coachModalHeaderTitle}>FitCoach</Text>
          </View>

          {/* Slides */}
          {coachSummary?.slides && (
            <FlatList
              ref={(ref) => { (globalThis as any).__coachFlatListRef = ref; }}
              data={coachSummary.slides}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get('window').width);
                setActiveSlideIndex(index);
              }}
              keyExtractor={(_, i) => `slide-${i}`}
              style={{ flex: 1 }}
              renderItem={({ item, index }) => {
                const slideWidth = Dimensions.get('window').width;
                return (
                  <View style={{ width: slideWidth, flex: 1 }}>
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.coachSlideScroll}
                    >
                      {/* Slide number */}
                      <Text style={styles.coachSlideNumber}>{`${index + 1} / ${coachSummary.slides.length}`}</Text>

                      {/* Context strip - slide 1 only */}
                      {index === 0 && item.context_strip && (
                        <View style={styles.coachContextStripWrap}>
                          <Text style={styles.coachContextStrip}>{item.context_strip}</Text>
                        </View>
                      )}

                      {/* Title */}
                      <Text style={styles.coachSlideTitle}>{item.title}</Text>
                      <View style={styles.coachSlideDivider} />

                      {/* Chips */}
                      {item.chips && item.chips.length > 0 && (
                        <View style={styles.coachChipsContainer}>
                          {item.chips.map((chip: string, ci: number) => (
                            <View key={`chip-${ci}`} style={styles.coachChip}>
                              <Text style={styles.coachChipText}>{chip}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Content */}
                      <Text style={styles.coachSlideContent}>{item.content}</Text>

                      {/* Coach call */}
                      {item.coach_call && (
                        <View style={styles.coachCallContainer}>
                          <View style={styles.coachCallAccent} />
                          <Text style={styles.coachCallText}>{item.coach_call}</Text>
                        </View>
                      )}
                    </ScrollView>

                    {/* Tap zones overlay */}
                    <View style={styles.coachSlideTapZones} pointerEvents="box-none">
                      <TouchableOpacity
                        style={styles.coachSlideTapLeft}
                        activeOpacity={1}
                        onPress={() => {
                          if (activeSlideIndex > 0) {
                            const newIdx = activeSlideIndex - 1;
                            setActiveSlideIndex(newIdx);
                            (globalThis as any).__coachFlatListRef?.scrollToIndex({ index: newIdx, animated: true });
                          }
                        }}
                      />
                      <TouchableOpacity
                        style={styles.coachSlideTapRight}
                        activeOpacity={1}
                        onPress={() => {
                          if (coachSummary.slides && activeSlideIndex < coachSummary.slides.length - 1) {
                            const newIdx = activeSlideIndex + 1;
                            setActiveSlideIndex(newIdx);
                            (globalThis as any).__coachFlatListRef?.scrollToIndex({ index: newIdx, animated: true });
                          }
                        }}
                      />
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Progress dots */}
          <View style={styles.coachDotsContainer}>
            {coachSummary?.slides?.map((_: CoachSlide, i: number) => (
              <View
                key={`dot-${i}`}
                style={[
                  styles.coachDot,
                  i === activeSlideIndex && styles.coachDotActive,
                ]}
              />
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Weak Link Logic ──────────────────────────────────────────────────────────

type WeakLinkPillar = 'Nutrition' | 'Training' | 'Recovery';

interface WeakLinkResult {
  pillar: WeakLinkPillar;
  displayScore: number;
  reason: string;
  secondReason?: string; // shown only in extreme cases (two high-severity issues)
  ctaMessage: string;
  zoneColor: string;
}

function getWorstMealFactor(mealList: MealData[]): string | null {
  const counts: Record<string, number> = {
    fiberPlantVolume: 0, processingLoad: 0,
    proteinAdequacy: 0,  nutrientDiversity: 0, portionBalance: 0,
  };
  for (const meal of mealList) {
    const f = meal.mealQualityFlags;
    if (!f) continue;
    if (f.fiberPlantVolume?.effectiveStatus  === 'warning') counts.fiberPlantVolume++;
    if (f.processingLoad?.effectiveStatus    === 'warning') counts.processingLoad++;
    if (f.proteinAdequacy?.effectiveStatus   === 'warning') counts.proteinAdequacy++;
    if (f.nutrientDiversity?.effectiveStatus === 'warning') counts.nutrientDiversity++;
    if (f.portionBalance?.effectiveStatus    === 'warning') counts.portionBalance++;
  }
  const top = Object.entries(counts).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a)[0];
  if (!top) return null;
  const labels: Record<string, string> = {
    fiberPlantVolume:  'Low fiber and plant volume',
    processingLoad:    'High processing load in meals',
    proteinAdequacy:   'Protein intake was low',
    nutrientDiversity: 'Low nutrient diversity',
    portionBalance:    'Portion balance was off',
  };
  return labels[top[0]] ?? null;
}

function computeWeakLink(result: FitScoreResponse, mealList: MealData[], sessions: TrainingDataEntry[], waterBand?: WaterIntakeBand | null): WeakLinkResult {
  const nutRaw = result.breakdown.nutrition.score;
  const traRaw = result.breakdown.training.score;
  const recRaw = result.breakdown.recovery.score;

  // Pick the actual lowest pillar. Exact ties broken by priority: Nutrition > Training > Recovery.
  let pillar: WeakLinkPillar;
  if (nutRaw <= Math.min(traRaw, recRaw)) {
    pillar = 'Nutrition';
  } else if (traRaw <= recRaw) {
    pillar = 'Training';
  } else {
    pillar = 'Recovery';
  }

  const rawScore = pillar === 'Nutrition' ? nutRaw : pillar === 'Training' ? traRaw : recRaw;

  // Must read counts before displayScore — triangle rounds to integer when count === 1
  const mealCount    = result.breakdown.nutrition.mealsCount;
  const sessionCount = result.breakdown.training.sessionsCount;

  // Match triangle display exactly:
  //   1 meal/session  → Math.round  (triangle showDecimal=false)
  //   2+ or Recovery  → toFixed(1)  (triangle showDecimal=true)
  const displayScore =
    (pillar === 'Nutrition' && mealCount    === 1) ? Math.round(rawScore) :
    (pillar === 'Training'  && sessionCount === 1) ? Math.round(rawScore) :
    parseFloat(rawScore.toFixed(1));

  const zoneColor = displayScore >= 7 ? colors.success : displayScore >= 5 ? colors.warning : colors.danger;

  // Generate reason (and optional secondReason for extreme cases)
  const timing = result.timingSignals;
  const dayCtx = result.nutritionDayContext;
  const whoop  = result.whoopData;
  let reason = '';
  let secondReason: string | undefined;

  if (pillar === 'Nutrition') {
    // ── Issue candidates with severity ──────────────────────────────────────
    interface Issue { text: string; severity: number }
    const candidates: Issue[] = [];

    if (dayCtx) {
      // Severe: only meal and it's junk food
      if (dayCtx.mealsLogged === 1 && dayCtx.onlyMealIsPureJunk && dayCtx.lateMealFlag) {
        candidates.push({ text: 'Only meal was junk food eaten late at night', severity: 4 });
      } else if (dayCtx.mealsLogged === 1 && dayCtx.onlyMealIsPureJunk) {
        candidates.push({ text: 'Only meal logged was low-quality junk food', severity: 3 });
      } else if (dayCtx.mealsLogged === 1) {
        candidates.push({ text: 'Only 1 meal logged today', severity: 3 });
      }
      // Gap issues
      if (dayCtx.longestGapHours !== null) {
        if (dayCtx.longestGapHours >= 7) {
          candidates.push({ text: `${Math.round(dayCtx.longestGapHours)}h gap between meals`, severity: 2 });
        } else if (dayCtx.longestGapHours >= 5) {
          candidates.push({ text: `${Math.round(dayCtx.longestGapHours)}h gap between meals`, severity: 1 });
        }
      }
      // Late meal
      if (dayCtx.lateMealFlag && dayCtx.lastMealTime && dayCtx.mealsLogged > 1) {
        candidates.push({ text: `Late meal at ${dayCtx.lastMealTime} may affect sleep`, severity: 1 });
      }
    } else {
      // Fallback to timing signals when dayCtx not available
      if (timing?.timing_flag_long_gap) {
        candidates.push({ text: timing.long_gap_window ? `Long meal gap: ${timing.long_gap_window}` : 'Long gap between meals', severity: 2 });
      }
      if (timing?.timing_flag_late_meal) {
        candidates.push({ text: 'Late meal may affect overnight recovery', severity: 1 });
      }
      if (result.breakdown.nutrition.mealsCount < 2) {
        candidates.push({ text: `Only ${result.breakdown.nutrition.mealsCount} meal logged today`, severity: 3 });
      }
    }

    // Quality fallback if no structural issues found
    if (candidates.length === 0) {
      const qualityIssue = getWorstMealFactor(mealList);
      candidates.push({ text: qualityIssue ?? 'Fuel quality can be tighter', severity: 1 });
    }

    candidates.sort((a, b) => b.severity - a.severity);
    reason = candidates[0].text;

    // Show second reason only in extreme cases: top severity ≥3 AND second severity ≥2
    const second = candidates[1];
    if (second && candidates[0].severity >= 3 && second.severity >= 2) {
      secondReason = second.text;
    }
  } else if (pillar === 'Training') {
    if (result.breakdown.training.sessionsCount === 0) {
      reason = 'No training session logged today';
    } else if (traRaw < 5) {
      reason = 'Session load could better match your readiness';
    } else {
      reason = 'Session quality has room to improve';
    }
  } else {
    if (whoop.sleepHours !== undefined && whoop.sleepHours < 6) {
      reason = `Short sleep — ${whoop.sleepHours.toFixed(1)}h logged`;
    } else if (whoop.recoveryScore !== undefined && whoop.recoveryScore < 40) {
      reason = `Recovery dipped to ${Math.round(whoop.recoveryScore)}%`;
    } else if (whoop.hrv && whoop.hrvBaseline && whoop.hrv < whoop.hrvBaseline - 3) {
      reason = 'HRV trending below baseline';
    } else {
      reason = 'Recovery consistency needs attention';
    }
  }

  // Build CTA message — display values mirror the triangle exactly:
  //   single session/meal → integer (Math.round); multiple → 1 decimal; recovery always 1 decimal
  const nutDisp = mealCount    === 1 ? String(Math.round(nutRaw)) : nutRaw.toFixed(1);
  const traDisp = sessionCount === 1 ? String(Math.round(traRaw)) : traRaw.toFixed(1);
  const recDisp = recRaw.toFixed(1);
  const pillarDisp = pillar === 'Nutrition' ? nutDisp : pillar === 'Training' ? traDisp : recDisp;
  const msgParts: string[] = [
    `Today's weak link is ${pillar} (${pillarDisp}/10). ${reason}.`,
    `Day snapshot — FitScore: ${result.fitScore.toFixed(1)}/10, Recovery: ${recDisp}/10, Training: ${traDisp}/10, Nutrition: ${nutDisp}/10.`,
  ];
  if (whoop.sleepHours) msgParts.push(`Sleep: ${whoop.sleepHours.toFixed(1)}h.`);
  if (whoop.recoveryScore) msgParts.push(`WHOOP recovery: ${Math.round(whoop.recoveryScore)}%.`);

  // Rich pillar context so FitCoach can give specific, session/meal-aware advice
  if (pillar === 'Training' && sessions.length > 0) {
    const sessionDetails = sessions
      .filter(s => !s.skipped)
      .map(s => {
        const parts: string[] = [`${s.type} (${s.duration}min`];
        if (s.intensity) parts[0] += `, ${s.intensity} intensity`;
        parts[0] += ')';
        if (s.goal) parts.push(`goal: ${s.goal}`);
        if (s.comment) parts.push(`notes: "${s.comment}"`);
        if (s.score !== undefined) parts.push(`score ${Math.round(s.score)}/10`);
        return parts.join(' — ');
      })
      .join('; ');
    if (sessionDetails) msgParts.push(`Training logged: ${sessionDetails}.`);
  } else if (pillar === 'Nutrition') {
    if (mealList.length > 0) {
      const mealDetails = mealList.map(m => {
        const score = m.nutritionScore !== undefined ? ` (${m.nutritionScoreDisplay ?? Math.round(m.nutritionScore)}/10)` : '';
        return `${m.mealType}${score}`;
      }).join(', ');
      msgParts.push(`Meals today: ${mealDetails}.`);
      // Weakest meal analysis excerpt
      const worstMeal = mealList
        .filter(m => m.nutritionScore !== undefined)
        .sort((a, b) => (a.nutritionScore ?? 10) - (b.nutritionScore ?? 10))[0];
      if (worstMeal?.analysis) {
        const excerpt = worstMeal.analysis.slice(0, 200).replace(/\n/g, ' ');
        msgParts.push(`Weakest meal (${worstMeal.mealType}) AI notes: ${excerpt}.`);
      }
    }
    // Compact nutrition day context so FitCoach knows the full picture
    if (dayCtx) {
      const ctxParts = [
        `Meals logged: ${dayCtx.mealsLogged}`,
        dayCtx.firstMealTime ? `First: ${dayCtx.firstMealTime}` : null,
        dayCtx.lastMealTime  ? `Last: ${dayCtx.lastMealTime}`  : null,
        dayCtx.longestGapHours !== null ? `Longest gap: ${dayCtx.longestGapHours}h` : null,
        `Late meal: ${dayCtx.lateMealFlag ? 'yes' : 'no'}`,
        `Only meal junk: ${dayCtx.onlyMealIsPureJunk ? 'yes' : 'no'}`,
      ].filter(Boolean).join(', ');
      msgParts.push(`Nutrition day context: ${ctxParts}.`);
    }
  }

  if (waterBand === '<1L') {
    msgParts.push('Hydration: Less than 1L of water today — flagged as very low.');
  }

  msgParts.push('Give me 2-3 practical fixes for tomorrow that fit my goal and current context.');

  return { pillar, displayScore, reason, secondReason, ctaMessage: msgParts.join(' '), zoneColor };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function FitScoreScreen() {
  const navigation = useNavigation();
  const [weakLink, setWeakLink] = useState<WeakLinkResult | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [meals, setMeals] = useState<MealData[]>([]);
  const [trainingSessions, setTrainingSessions] = useState<TrainingDataEntry[]>([]);
  const [trainingEditing, setTrainingEditing] = useState(false);
  const [editingTrainingId, setEditingTrainingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Meal modal state
  const [showMealModal, setShowMealModal] = useState(false);
  const [pendingMealImage, setPendingMealImage] = useState<string | null>(null);
  const [pendingMealAssetId, setPendingMealAssetId] = useState<string | null>(null); // for image cache pre-fill
  const [selectedMealType, setSelectedMealType] = useState('');
  const [mealNotes, setMealNotes] = useState('');
  const [editingMealId, setEditingMealId] = useState<number | null>(null);
  const [mealTime, setMealTime] = useState<Date>(new Date());
  const [showMealTimePicker, setShowMealTimePicker] = useState(false);

  // Meal analysis modal state
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealData | null>(null);

  // Edit meals mode
  const [isEditingMeals, setIsEditingMeals] = useState(false);

  // Analyzing meal state
  const [analyzingMeal, setAnalyzingMeal] = useState(false);

  // Training IDs currently being re-analyzed after an edit (card-level overlay, not full-screen)
  const [analyzingTrainingIds, setAnalyzingTrainingIds] = useState<Set<number>>(new Set());

  // Training analysis state (for individual training view)
  const [selectedTraining, setSelectedTraining] = useState<TrainingDataEntry | null>(null);
  const [showTrainingAnalysisModal, setShowTrainingAnalysisModal] = useState(false);

  // Edit trainings mode (similar to edit meals)
  const [isEditingTrainings, setIsEditingTrainings] = useState(false);

  // Training form state
  const [trainingType, setTrainingType] = useState('');
  const [trainingDurationHours, setTrainingDurationHours] = useState(0);
  const [trainingDurationMinutes, setTrainingDurationMinutes] = useState(40);

  // Training analysis modal state
  const [showTrainingBreakdown, setShowTrainingBreakdown] = useState(false);

  // Training autocomplete
  type TrainingHistoryEntry = {
    type: string; goal?: string; intensity?: string; comment?: string;
    durationHours: number; durationMinutes: number;
  };
  const [trainingTypeHistory, setTrainingTypeHistory] = useState<TrainingHistoryEntry[]>([]);
  const [trainingSuggestions, setTrainingSuggestions] = useState<TrainingHistoryEntry[]>([]);
  const [showTrainingDurationPicker, setShowTrainingDurationPicker] = useState(false);
  const [trainingGoal, setTrainingGoal] = useState('');
  const [trainingIntensity, setTrainingIntensity] = useState('');
  const [trainingComment, setTrainingComment] = useState('');
  const [trainingSkipped, setTrainingSkipped] = useState(false);

  // Hydration picker — stored per date in AsyncStorage
  const [waterIntakeBand, setWaterIntakeBand] = useState<WaterIntakeBand | null>(null);

  // Daily habits check-in — loaded from goals, persisted per-date locally
  type DailyHabit = { text: string; goalTitle: string; done: boolean };
  const [dailyHabits, setDailyHabits] = useState<DailyHabit[]>([]);
  const habitsLoadedRef = useRef(false);

  // FitScore calculation state
  const [fitScoreResult, setFitScoreResult] = useState<FitScoreResponse | null>(null);
  const [calculatingFitScore, setCalculatingFitScore] = useState(false);
  const [showFitScoreResult, setShowFitScoreResult] = useState(false);

  // Stored FitScore for past dates (read-only)
  const [storedScore, setStoredScore] = useState<StoredFitScore | null>(null);

  // Coach summary state
  const [coachSummary, setCoachSummary] = useState<CoachSummaryResponse | null>(null);
  const [loadingCoachSummary, setLoadingCoachSummary] = useState(false);
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [showRecoveryAnalysis, setShowRecoveryAnalysis] = useState(false);
  const [triangleAnimating, setTriangleAnimating] = useState(false);
  const triangleHasAnimated = useRef(false);
  const triangleViewRef = useRef<any>(null);
  const fitScoreScrollRef = useRef<any>(null);
  const mealScrollRef = useRef<ScrollView>(null);
  const visibilityPollRef = useRef<ReturnType<typeof setInterval>>();
  const [showFormulaTooltip, setShowFormulaTooltip] = useState(false);
  const fitScoreFadeAnim = useRef(new Animated.Value(0)).current;
  // Cache FitScore results by date string so navigating away and back doesn't lose the result
  const fitScoreCacheRef = useRef<Map<string, FitScoreResponse>>(new Map());

  // FitScore ready reveal overlay
  const [showReadyReveal, setShowReadyReveal] = useState(false);
  const revealOpacity = useRef(new Animated.Value(0)).current;
  const revealScale = useRef(new Animated.Value(0.92)).current;
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // All-green banner — only shown after triangle animation fully completes
  const [showAllGreenBanner, setShowAllGreenBanner] = useState(false);
  const allGreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerReadyReveal = () => {
    revealOpacity.setValue(0);
    revealScale.setValue(0.92);
    setShowReadyReveal(true);
    Animated.parallel([
      Animated.timing(revealOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(revealScale, { toValue: 1, damping: 22, stiffness: 210, useNativeDriver: true }),
    ]).start();
    revealTimerRef.current = setTimeout(() => dismissReadyReveal(), 3000);
  };

  const dismissReadyReveal = () => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    Animated.timing(revealOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setShowReadyReveal(false);
      setTimeout(() => {
        fitScoreScrollRef.current?.scrollTo({ y: 650, animated: true });
      }, 80);
    });
  };

  // Load persisted FitScore cache + training history from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter(k => k.startsWith('fitScoreCache_'));
        if (cacheKeys.length > 0) {
          const pairs = await AsyncStorage.multiGet(cacheKeys);
          pairs.forEach(([key, value]) => {
            if (value) {
              try {
                const dateStr = key.replace('fitScoreCache_', '');
                fitScoreCacheRef.current.set(dateStr, JSON.parse(value) as FitScoreResponse);
              } catch {}
            }
          });
          console.log(`[FITSCORE] Loaded ${cacheKeys.length} cached FitScore(s) from AsyncStorage`);
        }
      } catch (err) {
        console.warn('[FITSCORE] Failed to load AsyncStorage cache:', err);
      }
      // Load training autocomplete history
      try {
        const raw = await AsyncStorage.getItem('trainingFormHistory');
        if (raw) setTrainingTypeHistory(JSON.parse(raw));
      } catch { /* graceful */ }
    })();
  }, []);

  // Load habit definitions from goals storage on mount, then restore today's checkins
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@fitsmart_goals');
        if (!raw) return;
        const goals = JSON.parse(raw);
        const allHabits: DailyHabit[] = [];
        for (const g of goals) {
          for (const h of (g.microhabits || [])) {
            if (!h.isSubgoal) {
              allHabits.push({ text: h.text, goalTitle: g.title, done: false });
            }
          }
        }
        // Restore checkins for today
        const todayStr = formatDate(new Date());
        const checkinRaw = await AsyncStorage.getItem(`habitCheckins_${todayStr}`);
        const checkins = checkinRaw ? JSON.parse(checkinRaw) as boolean[] : [];
        setDailyHabits(allHabits.map((h, i) => ({ ...h, done: checkins[i] ?? false })));
        habitsLoadedRef.current = true;
      } catch { /* graceful */ }
    })();
  }, []);

  // When date changes, restore habit checkins for that date
  useEffect(() => {
    if (!habitsLoadedRef.current) return;
    (async () => {
      try {
        const dateStr = formatDate(selectedDate);
        const raw = await AsyncStorage.getItem(`habitCheckins_${dateStr}`);
        const checkins = raw ? JSON.parse(raw) as boolean[] : [];
        setDailyHabits(prev => prev.map((h, i) => ({ ...h, done: checkins[i] ?? false })));
      } catch { /* graceful */ }
    })();
  }, [selectedDate]);

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = selectedDate.toDateString() === yesterday.toDateString();
  const isPastDate = !isToday && !isYesterday;
  // Comparison is always selectedDate - 1 day; show the actual date for clarity
  const comparisonDate = new Date(selectedDate);
  comparisonDate.setDate(comparisonDate.getDate() - 1);
  const comparisonLabel = isToday
    ? 'vs yesterday'
    : `vs ${comparisonDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
  const hasMeals = meals.length > 0;
  const hasTraining = trainingSessions.length > 0;
  const canCalculate = hasMeals; // Training is optional — minimum is one meal

  // ── Triangle visibility detection ─────────────────────────────────────────────
  // Uses measureInWindow (real screen coords) instead of layout.y (parent-relative)
  const checkTriangleVisible = () => {
    if (triangleHasAnimated.current || !triangleViewRef.current) return;
    triangleViewRef.current.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      const screenH = Dimensions.get('window').height;
      if (h > 0 && y < screenH - 40 && y + h > 0) {
        triangleHasAnimated.current = true;
        clearInterval(visibilityPollRef.current);
        setTriangleAnimating(true);
      }
    });
  };

  // When a new FitScore result arrives, reset and start polling until triangle is visible
  useEffect(() => {
    setShowAllGreenBanner(false);
    if (allGreenTimerRef.current) { clearTimeout(allGreenTimerRef.current); allGreenTimerRef.current = null; }
    if (!fitScoreResult) return;
    setTriangleAnimating(false);
    triangleHasAnimated.current = false;
    clearInterval(visibilityPollRef.current);
    // Poll every 200ms for up to 15s — stops as soon as triangle enters viewport
    visibilityPollRef.current = setInterval(checkTriangleVisible, 200);
    const stopPoll = setTimeout(() => clearInterval(visibilityPollRef.current), 15000);
    return () => {
      clearInterval(visibilityPollRef.current);
      clearTimeout(stopPoll);
    };
  }, [fitScoreResult]);

  // Once triangle animation starts, schedule all-green banner reveal
  // Total animation: 1100+1100+1100+1800+600 ≈ 5700ms; add 400ms buffer = 6100ms
  useEffect(() => {
    if (!triangleAnimating || !fitScoreResult?.allGreen) return;
    if (allGreenTimerRef.current) clearTimeout(allGreenTimerRef.current);
    allGreenTimerRef.current = setTimeout(() => setShowAllGreenBanner(true), 6100);
    return () => {
      if (allGreenTimerRef.current) { clearTimeout(allGreenTimerRef.current); allGreenTimerRef.current = null; }
    };
  }, [triangleAnimating]);

  // Compute weak link whenever FitScore result, meals, training sessions, or water intake change
  useEffect(() => {
    if (fitScoreResult) {
      setWeakLink(computeWeakLink(fitScoreResult, meals, trainingSessions, waterIntakeBand));
    } else {
      setWeakLink(null);
    }
  }, [fitScoreResult, meals, trainingSessions, waterIntakeBand]);

  // Load meals and training data when date changes
  useEffect(() => {
    loadDataForDate();
  }, [selectedDate]);

  const loadDataForDate = async () => {
    // Clear stale state FIRST — prevents previous date's data from flashing
    setFitScoreResult(null);
    setShowFitScoreResult(false);
    setStoredScore(null);
    setCoachSummary(null);
    setMeals([]);
    setTrainingSessions([]);
    setWaterIntakeBand(null);
    setLoading(true);

    const dateStr = formatDate(selectedDate);

    // Restore persisted water intake for this date
    try {
      const stored = await AsyncStorage.getItem(`waterIntake_${dateStr}`);
      if (stored) setWaterIntakeBand(stored as WaterIntakeBand);
    } catch { /* graceful */ }
    const today = new Date();
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const isDateToday = selectedDate.toDateString() === today.toDateString();
    const isDateYesterday = selectedDate.toDateString() === yest.toDateString();
    const isDatePast = !isDateToday && !isDateYesterday;

    try {
      if (isDatePast) {
        // Past dates: read-only — try to restore full FitScoreResponse from AsyncStorage first
        try {
          const raw = await AsyncStorage.getItem(`fitScoreCache_${dateStr}`);
          if (raw) {
            const cached = JSON.parse(raw) as FitScoreResponse;
            fitScoreCacheRef.current.set(dateStr, cached);
            setFitScoreResult(cached);
            setShowFitScoreResult(true);
            fitScoreFadeAnim.setValue(1); // cached restore — show immediately without fade
            // Restore or fetch coach summary for this past date
            try {
              const rawCoach = await AsyncStorage.getItem(`coachSummary_${dateStr}`);
              if (rawCoach) {
                setCoachSummary(JSON.parse(rawCoach));
              } else {
                fetchCoachSummary(cached, dateStr); // fetch once and cache
              }
            } catch { fetchCoachSummary(cached, dateStr); }
            setLoading(false);
            return; // full view available — skip server call
          }
        } catch { /* graceful */ }

        // Fallback: fetch minimal stored score from server
        try {
          const stored = await getStoredFitScore(dateStr);
          setStoredScore(stored); // null → shows NoScore state
        } catch {
          // Silently ignore — storedScore stays null → NoScore state shown
        }
      } else {
        // Today / yesterday — check in-memory cache first, then AsyncStorage (handles mount race)
        let cached = fitScoreCacheRef.current.get(dateStr);
        if (!cached) {
          try {
            const raw = await AsyncStorage.getItem(`fitScoreCache_${dateStr}`);
            if (raw) {
              cached = JSON.parse(raw) as FitScoreResponse;
              fitScoreCacheRef.current.set(dateStr, cached);
            }
          } catch { /* graceful */ }
        }
        if (cached) {
          setFitScoreResult(cached);
          setShowFitScoreResult(true);
          fitScoreFadeAnim.setValue(1); // cached restore — show immediately without fade
          // Restore or fetch coach summary
          try {
            const rawCoach = await AsyncStorage.getItem(`coachSummary_${dateStr}`);
            if (rawCoach) {
              setCoachSummary(JSON.parse(rawCoach));
            } else {
              fetchCoachSummary(cached, dateStr);
            }
          } catch { fetchCoachSummary(cached, dateStr); }
        }

        const [mealsData, trainingData] = await Promise.all([
          getMealsByDate(dateStr),
          getTrainingDataByDate(dateStr),
        ]);
        setMeals(mealsData);
        setTrainingSessions(trainingData);
        console.log(`Loaded ${mealsData.length} meals and ${trainingData.length} training sessions for ${dateStr}`);
        if (trainingData.length > 0) {
          console.log('[TRAINING DATA] First session breakdown:', trainingData[0].breakdown);
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      if (!isDatePast) {
        Alert.alert('Error', 'Failed to load data for this date');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDateDisplay = (date: Date) => {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'TODAY';
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    if (date.toDateString() === yest.toDateString()) return 'YESTERDAY';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDateLabel = (): string => {
    if (isToday) return 'today';
    if (isYesterday) return 'yesterday';
    return selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const handlePreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(selectedDate);
    const today = new Date();
    if (newDate.toDateString() !== today.toDateString()) {
      newDate.setDate(newDate.getDate() + 1);
      setSelectedDate(newDate);
    }
  };

  const handleCalculateFitScore = async () => {
    if (!canCalculate) {
      Alert.alert(
        'Missing Data',
        'Please log at least one meal before calculating your FitScore.'
      );
      return;
    }

    setCalculatingFitScore(true);
    setCoachSummary(null);

    try {
      const dateStr = formatDate(selectedDate);
      console.log(`[FITSCORE] Calculating FitScore for ${dateStr}`);

      const result = await calculateFitScore(dateStr, waterIntakeBand);

      console.log(`[FITSCORE] Result received: ${result.fitScore}/10`);
      setFitScoreResult(result);
      setShowFitScoreResult(true);
      // Cache by date so navigating away and back restores the result (in-memory + persisted)
      fitScoreCacheRef.current.set(dateStr, result);
      AsyncStorage.setItem(`fitScoreCache_${dateStr}`, JSON.stringify(result)).catch(() => {});

      // Trigger fade-in animation
      fitScoreFadeAnim.setValue(0);
      setTriangleAnimating(false);
      Animated.timing(fitScoreFadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();

      // Premium reveal moment
      triggerReadyReveal();

      // Fetch coach summary in the background and cache it
      const habitsCtx = dailyHabits.length > 0 ? {
        total: dailyHabits.length,
        completed: dailyHabits.filter(h => h.done).length,
        completedList: dailyHabits.filter(h => h.done).map(h => h.text),
        missingList: dailyHabits.filter(h => !h.done).map(h => h.text),
      } : undefined;
      fetchCoachSummary(result, formatDate(selectedDate), habitsCtx);

    } catch (error) {
      console.error('[FITSCORE] Calculation failed:', error);
      Alert.alert(
        'Calculation Failed',
        'Failed to calculate your FitScore. Please try again.'
      );
    } finally {
      setCalculatingFitScore(false);
    }
  };

  const fetchCoachSummary = async (
    fitScoreData: FitScoreResponse,
    dateStr?: string,
    habitsContext?: { total: number; completed: number; completedList: string[]; missingList: string[] },
  ) => {
    setLoadingCoachSummary(true);
    try {
      const summary = await getCoachSummary({
        fitScore: fitScoreData.fitScore,
        recoveryZone: fitScoreData.breakdown.recovery.zone,
        trainingZone: fitScoreData.breakdown.training.zone,
        nutritionZone: fitScoreData.breakdown.nutrition.zone,
        fitScoreZone: fitScoreData.fitScoreZone,
        hadTraining: fitScoreData.breakdown.training.sessionsCount > 0,
        hadMeals: fitScoreData.breakdown.nutrition.mealsCount > 0,
        mealsCount: fitScoreData.breakdown.nutrition.mealsCount,
        sessionsCount: fitScoreData.breakdown.training.sessionsCount,
        recoveryScore: fitScoreData.whoopData.recoveryScore,
        sleepScore: fitScoreData.whoopData.sleepScore,
        sleepHours: fitScoreData.whoopData.sleepHours,
        hrv: fitScoreData.whoopData.hrv,
        hrvBaseline: fitScoreData.whoopData.hrvBaseline,
        strainScore: fitScoreData.whoopData.strainScore,
        recoveryBreakdownScore: fitScoreData.breakdown.recovery.score,
        trainingBreakdownScore: fitScoreData.breakdown.training.score,
        nutritionBreakdownScore: fitScoreData.breakdown.nutrition.score,
        dateLabel: getDateLabel(),
        timingSignals: fitScoreData.timingSignals,
        waterIntakeBand: fitScoreData.waterIntakeBand ?? waterIntakeBand ?? null,
        dailyHabits: habitsContext,
      });
      setCoachSummary(summary);
      if (dateStr) {
        AsyncStorage.setItem(`coachSummary_${dateStr}`, JSON.stringify(summary)).catch(() => {});
      }
      console.log('[COACH SUMMARY] Summary received');
    } catch (error) {
      console.error('[COACH SUMMARY] Failed to fetch:', error);
      // Don't show an error - coach summary is optional
    } finally {
      setLoadingCoachSummary(false);
    }
  };

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload meal photos.');
      return false;
    }
    return true;
  };

  const handleHabitToggle = async (index: number) => {
    const updated = dailyHabits.map((h, i) => i === index ? { ...h, done: !h.done } : h);
    setDailyHabits(updated);
    const dateStr = formatDate(selectedDate);
    try {
      await AsyncStorage.setItem(`habitCheckins_${dateStr}`, JSON.stringify(updated.map(h => h.done)));

      // Streak logic: for each goal, if ALL its habits are now done → increment streak (once per day)
      const goalTitles = [...new Set(updated.map(h => h.goalTitle))];
      for (const goalTitle of goalTitles) {
        const goalHabits = updated.filter(h => h.goalTitle === goalTitle);
        if (!goalHabits.every(h => h.done)) continue;

        const streakKey = `habitStreakDate_${goalTitle}`;
        const lastStreakDate = await AsyncStorage.getItem(streakKey);
        if (lastStreakDate === dateStr) continue; // already counted today

        const goalsRaw = await AsyncStorage.getItem('@fitsmart_goals');
        if (!goalsRaw) continue;
        const goals = JSON.parse(goalsRaw);
        const updatedGoals = goals.map((g: any) =>
          g.title === goalTitle ? { ...g, streak: (g.streak || 0) + 1 } : g
        );
        await AsyncStorage.setItem('@fitsmart_goals', JSON.stringify(updatedGoals));
        await AsyncStorage.setItem(streakKey, dateStr);

        // Sync to server
        const goal = updatedGoals.find((g: any) => g.title === goalTitle);
        if (goal?.id) {
          apiRequest(`/api/goals/${goal.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ streak: goal.streak }),
          }).catch(() => {});
        }
      }
    } catch { /* graceful */ }
  };

  const handleWaterPick = async (band: WaterIntakeBand) => {
    const newBand = waterIntakeBand === band ? null : band; // tap again to deselect
    setWaterIntakeBand(newBand);
    const dateStr = formatDate(selectedDate);
    try {
      if (newBand) {
        await AsyncStorage.setItem(`waterIntake_${dateStr}`, newBand);
      } else {
        await AsyncStorage.removeItem(`waterIntake_${dateStr}`);
      }
    } catch { /* graceful */ }
  };

  const handleAddMealPress = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    Alert.alert(
      'Add Meal Photo',
      'Choose a source',
      [
        {
          text: 'Camera',
          onPress: () => pickImageFromCamera(),
        },
        {
          text: 'Gallery',
          onPress: () => pickImageFromGallery(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const pickImageFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access to take meal photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPendingMealImage(result.assets[0].uri);
      setPendingMealAssetId(null); // Camera photos are unique each time — no cache lookup
      setSelectedMealType('');
      setMealNotes('');
      setShowMealModal(true);
    }
  };

  const pickImageFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingMealImage(asset.uri);
      const assetId = asset.assetId ?? null;
      setPendingMealAssetId(assetId);

      // Pre-fill form from cache if this gallery photo was logged before
      let prefilled = false;
      if (assetId) {
        try {
          const raw = await AsyncStorage.getItem('mealImageCache');
          const cache = raw ? JSON.parse(raw) : {};
          const hit = cache[assetId];
          if (hit) {
            setSelectedMealType(hit.mealType || '');
            setMealNotes(hit.mealNotes || '');
            prefilled = true;
          }
        } catch { /* graceful */ }
      }
      if (!prefilled) {
        setSelectedMealType('');
        setMealNotes('');
      }
      setShowMealModal(true);
    }
  };

  const getScoreColor = (score?: number): string => {
    if (!score) return colors.textSecondary;
    // Use rounded score for color to match displayed value
    const roundedScore = Math.round(score);
    if (roundedScore >= 7) return colors.success; // Green: 7-10
    if (roundedScore >= 5) return colors.warning; // Amber: 5-6
    return colors.danger; // Red: 1-4
  };

  const handleMealPress = (meal: MealData) => {
    if (isEditingMeals) {
      // In edit mode, show options to edit or delete
      Alert.alert(
        'Edit Meal',
        `What would you like to do with this ${meal.mealType}?`,
        [
          {
            text: 'Edit',
            onPress: () => handleEditMeal(meal),
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => handleDeleteMeal(meal.id),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } else {
      // Normal mode: show analysis if available
      if (meal.analysis) {
        setSelectedMeal(meal);
        setShowAnalysisModal(true);
      }
    }
  };

  const handleEditMeal = (meal: MealData) => {
    setEditingMealId(meal.id);
    setPendingMealImage(meal.imageUri);
    setSelectedMealType(meal.mealType);
    setMealNotes(meal.mealNotes || '');
    setShowMealModal(true);
    setIsEditingMeals(false); // Exit edit mode
  };

  const handleLogMeal = async () => {
    if (!selectedMealType) {
      Alert.alert('Missing Information', 'Please select a meal type.');
      return;
    }

    if (!pendingMealImage) {
      Alert.alert('Missing Information', 'No meal image selected.');
      return;
    }

    // Snapshot form state into local variables BEFORE any state changes.
    // This prevents a concurrent upload's finally-block from clearing a second
    // meal's image that the user has already picked while the first is uploading.
    const imageUri = pendingMealImage;
    const mealType = selectedMealType;
    const notes = mealNotes;
    const capturedTime = mealTime;
    const assetId = pendingMealAssetId;

    // Clear form state immediately so the next modal open starts fresh
    setPendingMealImage(null);
    setPendingMealAssetId(null);
    setSelectedMealType('');
    setMealNotes('');
    setEditingMealId(null);
    setShowMealModal(false);
    setAnalyzingMeal(true);

    // Unique negative temp ID so concurrent pending meals don't collide
    const tempId = -Date.now();

    // Create temporary placeholder meal using the snapshotted values
    const tempMeal: MealData = {
      id: tempId,
      mealType: mealType,
      mealNotes: notes || undefined,
      imageUri: imageUri,
      date: formatDate(selectedDate),
      uploadedAt: new Date().toISOString(),
    };

    // Add placeholder to meals array using functional update (safe with concurrent adds)
    setMeals(currentMeals => [...currentMeals, tempMeal]);

    try {
      const newMeal = await uploadMeal({
        imageUri: imageUri,
        mealType: mealType,
        mealNotes: notes || undefined,
        date: formatDate(selectedDate),
        mealTime: capturedTime.toTimeString().slice(0, 5), // HH:MM format
      });

      // Replace placeholder with actual meal (matches only this upload's tempId)
      setMeals(currentMeals =>
        currentMeals.map(m => m.id === tempId ? newMeal : m)
      );

      // Save to image cache so this gallery photo pre-fills next time
      if (assetId) {
        try {
          const raw = await AsyncStorage.getItem('mealImageCache');
          const cache = raw ? JSON.parse(raw) : {};
          cache[assetId] = { mealType, mealNotes: notes || '' };
          const cacheKeys = Object.keys(cache);
          if (cacheKeys.length > 50) delete cache[cacheKeys[0]]; // prune oldest
          await AsyncStorage.setItem('mealImageCache', JSON.stringify(cache));
        } catch { /* graceful */ }
      }

      console.log('Meal uploaded successfully:', newMeal);
    } catch (error) {
      console.error('Failed to upload meal:', error);
      // Remove only this upload's placeholder on error
      setMeals(currentMeals => currentMeals.filter(m => m.id !== tempId));
      Alert.alert('Upload Failed', 'Failed to upload meal. Please try again.');
    } finally {
      setAnalyzingMeal(false);
    }
  };

  const handleDeleteMeal = (mealId: number) => {
    Alert.alert(
      'Delete Meal',
      'Are you sure you want to delete this meal?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMealAPI(mealId);
              setMeals(prev => prev.filter(m => m.id !== mealId));
            } catch (err) {
              console.error('[MEAL DELETE] Failed:', err);
              Alert.alert('Error', 'Could not delete meal. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleSaveTraining = async () => {
    if (!trainingType.trim()) {
      Alert.alert('Missing Information', 'Please enter a training type.');
      return;
    }

    const totalDurationMinutes = (trainingDurationHours * 60) + trainingDurationMinutes;
    const params = {
      type: trainingType,
      duration: totalDurationMinutes,
      goal: trainingGoal || undefined,
      intensity: trainingIntensity || undefined,
      comment: trainingComment || undefined,
      skipped: trainingSkipped,
    };

    // Close form immediately and reset
    const savedType = trainingType;
    const savedDuration = totalDurationMinutes;
    const savedGoal = trainingGoal;
    const savedIntensity = trainingIntensity;
    const savedComment = trainingComment;
    const savedSkipped = trainingSkipped;
    const wasEditing = !!editingTrainingId;
    const editId = editingTrainingId;

    setTrainingType('');
    setTrainingDurationHours(0);
    setTrainingDurationMinutes(45);
    setTrainingGoal('');
    setTrainingIntensity('');
    setTrainingComment('');
    setTrainingSkipped(false);
    setTrainingEditing(false);
    setEditingTrainingId(null);

    try {
      let savedTraining: TrainingDataEntry;

      if (wasEditing && editId) {
        // Show card-level "Updating training..." overlay (same animation as new session)
        setAnalyzingTrainingIds(prev => new Set([...prev, editId]));
        try {
          savedTraining = await updateTrainingData(editId, params);
          // Full re-analysis so AI sees all updated fields
          const reanalysis = await analyzeTraining(formatDate(selectedDate));
          const analyzed = reanalysis.sessions.find(s => s.sessionId === editId);
          setTrainingSessions(currentSessions =>
            currentSessions.map(t =>
              t.id === editId
                ? analyzed
                  ? { ...savedTraining, score: analyzed.score, breakdown: analyzed.breakdown, analysis: analyzed.analysis, recoveryZone: analyzed.recoveryZone }
                  : savedTraining
                : t
            )
          );
        } finally {
          setAnalyzingTrainingIds(prev => {
            const next = new Set(prev);
            next.delete(editId);
            return next;
          });
        }
      } else {
        // Add new - create placeholder first with analyzing state
        const tempTraining: TrainingDataEntry = {
          id: -1, // Temporary ID triggers "Analyzing..." overlay
          userId: 'temp',
          type: savedType,
          duration: savedDuration,
          goal: savedGoal || undefined,
          intensity: savedIntensity || undefined,
          comment: savedComment || undefined,
          skipped: savedSkipped,
          date: formatDate(selectedDate),
          createdAt: new Date().toISOString(),
        };

        // Add placeholder to sessions array immediately
        setTrainingSessions(currentSessions => [...currentSessions, tempTraining]);

        // Save to server (this triggers analysis)
        savedTraining = await saveTrainingData({
          ...params,
          date: formatDate(selectedDate),
        });

        // Replace placeholder with real data including analysis
        setTrainingSessions(currentSessions =>
          currentSessions.map(t => t.id === -1 ? savedTraining : t)
        );
      }

      // Save to training autocomplete history (only for new sessions, not edits)
      if (!wasEditing) {
        try {
          const raw = await AsyncStorage.getItem('trainingFormHistory');
          const history = raw ? JSON.parse(raw) : [];
          // Move to front, replacing any existing entry with same type
          const deduped = history.filter((h: any) => h.type.toLowerCase() !== savedType.toLowerCase());
          deduped.unshift({
            type: savedType,
            goal: savedGoal || undefined,
            intensity: savedIntensity || undefined,
            comment: savedComment || undefined,
            durationHours: Math.floor(savedDuration / 60),
            durationMinutes: savedDuration % 60,
          });
          const trimmed = deduped.slice(0, 20);
          await AsyncStorage.setItem('trainingFormHistory', JSON.stringify(trimmed));
          setTrainingTypeHistory(trimmed);
        } catch { /* graceful */ }
      }

      console.log('Training saved successfully:', savedTraining);
    } catch (error) {
      console.error('Failed to save training:', error);
      // Remove placeholder on error
      setTrainingSessions(currentSessions => currentSessions.filter(t => t.id !== -1));
      Alert.alert('Save Failed', 'Failed to save training data. Please try again.');
    }
  };

  const handleTrainingPress = (training: TrainingDataEntry) => {
    if (isEditingTrainings) {
      // In edit mode, show options to edit or delete
      Alert.alert(
        'Edit Training',
        `What would you like to do with this ${training.type}?`,
        [
          {
            text: 'Edit',
            onPress: () => handleEditTraining(training),
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => handleDeleteTraining(training.id),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } else if (training.analysis) {
      // In normal mode, show analysis modal
      console.log('[TRAINING MODAL] Opening modal for training:', {
        id: training.id,
        type: training.type,
        hasAnalysis: !!training.analysis,
        hasBreakdown: !!training.breakdown,
        breakdown: training.breakdown,
      });
      setSelectedTraining(training);
      setShowTrainingBreakdown(false);
      setShowTrainingAnalysisModal(true);
    }
  };

  const handleEditTraining = (training: TrainingDataEntry) => {
    setIsEditingTrainings(false); // Exit edit mode
    setTrainingType(training.type);
    // Convert duration minutes to hours and minutes
    const hours = Math.floor(training.duration / 60);
    const minutes = training.duration % 60;
    setTrainingDurationHours(hours);
    setTrainingDurationMinutes(minutes);
    setTrainingGoal(training.goal || '');
    setTrainingIntensity(training.intensity || '');
    setTrainingComment(training.comment || '');
    setTrainingSkipped(training.skipped);
    setEditingTrainingId(training.id);
    setTrainingEditing(true);
  };

  const handleDeleteTraining = (trainingId: number) => {
    Alert.alert(
      'Delete Training',
      'Are you sure you want to delete this training session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await deleteTrainingDataAPI(trainingId);
              setTrainingSessions(trainingSessions.filter(t => t.id !== trainingId));
              console.log('Training deleted successfully');
            } catch (error) {
              console.error('Failed to delete training:', error);
              Alert.alert('Delete Failed', 'Failed to delete training. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleAutofillFromCalendar = () => {
    // TODO: Implement calendar API integration
    Alert.alert('Coming Soon', 'Calendar integration will be available soon!');
  };

  return (
    <ScrollView
      ref={fitScoreScrollRef}
      style={styles.container}
      scrollEventThrottle={100}
      onScroll={checkTriangleVisible}
    >
      {/* Loading Indicator */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Analyzing meal...</Text>
          </View>
        </View>
      )}

      {/* Date Selector */}
      <View style={styles.dateSelector}>
        <TouchableOpacity onPress={handlePreviousDay} style={styles.dateArrow}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.dateText}>{formatDateDisplay(selectedDate)}</Text>

        <TouchableOpacity
          onPress={handleNextDay}
          style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
          disabled={isToday}
        >
          <Ionicons
            name="chevron-forward"
            size={24}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
      </View>

      {/* Yesterday shortcut — shown on today's view */}
      {isToday && (
        <TouchableOpacity style={styles.yesterdayShortcut} onPress={handlePreviousDay} activeOpacity={0.7}>
          <Ionicons name="arrow-back-outline" size={13} color={colors.textMuted} />
          <Text style={styles.yesterdayShortcutText}>Forgot yesterday's score? Add it now</Text>
        </TouchableOpacity>
      )}

      {/* Retroactive context banner — only for yesterday */}
      {isYesterday && (
        <View style={styles.retroBanner}>
          <Ionicons name="time-outline" size={14} color={colors.accent} />
          <Text style={styles.retroBannerText}>
            Adding FitScore for <Text style={styles.retroBannerDate}>YESTERDAY</Text>
            {' — WHOOP data from that day will be used automatically.'}
          </Text>
        </View>
      )}

      {/* Past date comparison notice — shown when a stored FitScore is being displayed */}
      {isPastDate && showFitScoreResult && fitScoreResult && (
        <View style={styles.retroBanner}>
          <Ionicons name="time-outline" size={14} color={colors.accent} />
          <Text style={styles.retroBannerText}>
            {'Keep in mind — comparisons in this score were made against data from '}
            <Text style={styles.retroBannerDate}>
              {(() => {
                const prev = new Date(selectedDate);
                prev.setDate(prev.getDate() - 1);
                return prev.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              })()}
            </Text>
            .
          </Text>
        </View>
      )}

      {/* Past Date View — only shown when full cached FitScore is NOT available */}
      {isPastDate && !loading && !showFitScoreResult && (
        storedScore ? (
          <View style={styles.pastScoreSection}>
            <View style={[styles.pastScoreCircle, {
              borderColor: storedScore.score >= 7 ? colors.success : storedScore.score >= 5 ? colors.warning : colors.danger
            }]}>
              <Text style={[styles.pastScoreNumber, {
                color: storedScore.score >= 7 ? colors.success : storedScore.score >= 5 ? colors.warning : colors.danger
              }]}>
                {storedScore.score.toFixed(1)}
              </Text>
              <Text style={styles.pastScoreFitLabel}>FitScore</Text>
            </View>
            <Text style={styles.pastScoreDate}>Logged {formatDateDisplay(selectedDate)}</Text>
          </View>
        ) : (
          <View style={styles.pastEmptySection}>
            <Ionicons name="calendar-clear-outline" size={64} color={colors.surfaceMute} />
            <Text style={styles.pastEmptyTitle}>FitScore? More like NoScore.</Text>
            <Text style={styles.pastEmptyText}>
              Looks like nothing was logged this day, but let's not make it a habit.
            </Text>
          </View>
        )
      )}

      {/* Meals section — hidden for past dates (>1 day ago) */}
      {!isPastDate && (<View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Meals</Text>
          {hasMeals && (isToday || isYesterday) && (
            <TouchableOpacity
              onPress={() => setIsEditingMeals(!isEditingMeals)}
              style={styles.editButton}
            >
              <Ionicons
                name={isEditingMeals ? "checkmark-circle" : "create-outline"}
                size={22}
                color={isEditingMeals ? colors.accent : colors.textMuted}
              />
              <Text style={[styles.editButtonText, isEditingMeals && styles.editButtonTextActive]}>
                {isEditingMeals ? 'Done' : 'Edit Meals'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!hasMeals ? (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={48} color={colors.surfaceMute} />
            <Text style={styles.emptyStateText}>No meals logged yet</Text>
            {(isToday || isYesterday) && (
              <Button
                onPress={handleAddMealPress}
                style={styles.addButton}
              >
                {isYesterday ? "Add Yesterday's Meals" : "Add Today's Meals"}
              </Button>
            )}
          </View>
        ) : (
          <View style={styles.mealsGrid}>
            {meals.map((meal) => (
              <TouchableOpacity
                key={meal.id}
                style={[styles.mealCard, isEditingMeals && styles.mealCardEditing]}
                onPress={() => meal.id > 0 && handleMealPress(meal)}
                disabled={meal.id < 0}
              >
                <Image source={{ uri: meal.imageUri }} style={styles.mealImage} />
                {meal.id < 0 && (
                  <View style={styles.analyzingOverlay}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.analyzingText}>Analyzing...</Text>
                  </View>
                )}
                {meal.id > 0 && isEditingMeals && (
                  <View style={styles.editOverlay}>
                    <Ionicons name="create" size={32} color={colors.textPrimary} />
                  </View>
                )}
                {meal.id > 0 && !isEditingMeals && meal.nutritionScore && (
                  <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(meal.nutritionScore) }]}>
                    <Text style={styles.scoreText}>{Math.round(meal.nutritionScore)}</Text>
                  </View>
                )}
                <View style={styles.mealOverlay}>
                  <Text style={styles.mealType}>{meal.mealType}</Text>
                  {meal.id > 0 && !isEditingMeals && meal.analysis && (
                    <Text style={styles.tapHint}>✨ Tap to view</Text>
                  )}
                  {meal.id > 0 && isEditingMeals && (
                    <Text style={styles.tapHint}>Tap to edit</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
            {(isToday || isYesterday) && (
              <TouchableOpacity
                style={styles.addMealCard}
                onPress={handleAddMealPress}
              >
                <Ionicons name="add-circle-outline" size={32} color={colors.accent} />
                <Text style={styles.addMealText}>Add meal</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>)}

      {/* Hydration picker — optional, below Meals, today/yesterday only */}
      {!isPastDate && (
        <View style={styles.waterSection}>
          <View style={styles.waterHeader}>
            <Ionicons name="water-outline" size={15} color={colors.textMuted} />
            <Text style={styles.waterLabel}>Water intake today?</Text>
            {waterIntakeBand && (
              <Text style={styles.waterSelected}>{waterIntakeBand}</Text>
            )}
          </View>
          <View style={styles.waterChips}>
            {(['<1L', '1–2L', '2–3L', '3L+'] as WaterIntakeBand[]).map((band) => (
              <TouchableOpacity
                key={band}
                style={[styles.waterChip, waterIntakeBand === band && styles.waterChipActive]}
                onPress={() => handleWaterPick(band)}
                activeOpacity={0.7}
              >
                <Text style={[styles.waterChipText, waterIntakeBand === band && styles.waterChipTextActive]}>
                  {band}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Daily Habits Check-in — today/yesterday only */}
      {!isPastDate && (
        <View style={styles.habitsSection}>
          <View style={styles.habitsSectionHeader}>
            <Ionicons name="checkmark-circle-outline" size={15} color={colors.textMuted} />
            <Text style={styles.habitsLabel}>Daily Habits</Text>
            {dailyHabits.length > 0 && (
              <Text style={styles.habitsProgress}>
                {dailyHabits.filter(h => h.done).length}/{dailyHabits.length} done
              </Text>
            )}
          </View>

          {dailyHabits.length === 0 ? (
            <Text style={styles.habitsEmptyText}>No daily habits set yet. Add them in Goals.</Text>
          ) : (
            <View style={styles.habitsChecklist}>
              {dailyHabits.map((habit, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.habitRow}
                  onPress={() => handleHabitToggle(index)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.habitCheckbox, habit.done && styles.habitCheckboxDone]}>
                    {habit.done && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                  </View>
                  <Text style={[styles.habitText, habit.done && styles.habitTextDone]}>
                    {habit.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Training Section - Only shows after at least 1 meal */}
      {hasMeals && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Training</Text>
            {hasTraining && (isToday || isYesterday) && (
              <TouchableOpacity
                onPress={() => setIsEditingTrainings(!isEditingTrainings)}
                style={styles.editButton}
              >
                <Ionicons
                  name={isEditingTrainings ? "checkmark-circle" : "create-outline"}
                  size={22}
                  color={isEditingTrainings ? colors.accent : colors.textMuted}
                />
                <Text style={[styles.editButtonText, isEditingTrainings && styles.editButtonTextActive]}>
                  {isEditingTrainings ? 'Done' : 'Edit Trainings'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Show existing training sessions as cards */}
          {trainingSessions.length > 0 && !trainingEditing && (
            <View style={styles.trainingsGrid}>
              {trainingSessions.map((training) => {
                const getIntensityEmoji = (intensity?: string) => {
                  if (intensity === 'Low') return '💙';
                  if (intensity === 'Moderate') return '🟡';
                  if (intensity === 'High') return '🔥';
                  return '⚪';
                };

                return (
                  <TouchableOpacity
                    key={training.id}
                    style={[
                      styles.trainingCardCompact,
                      isEditingTrainings && styles.trainingCardEditing
                    ]}
                    onPress={() => training.id !== -1 && !analyzingTrainingIds.has(training.id) && handleTrainingPress(training)}
                    disabled={training.id === -1 || analyzingTrainingIds.has(training.id)}
                  >
                    {(training.id === -1 || analyzingTrainingIds.has(training.id)) && (
                      <View style={styles.trainingAnalyzingOverlay}>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={styles.trainingAnalyzingText}>
                          {analyzingTrainingIds.has(training.id) ? 'Updating training...' : 'Analyzing...'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.trainingCardHeaderRow}>
                      <Text style={styles.trainingCardType} numberOfLines={1}>{training.type}</Text>
                      {training.id !== -1 && !analyzingTrainingIds.has(training.id) && training.score && !isEditingTrainings && (
                        <View style={[
                          styles.trainingScoreBadge,
                          { backgroundColor: getScoreColor(training.score) }
                        ]}>
                          <Text style={styles.trainingScoreText}>{Math.round(training.score)}</Text>
                        </View>
                      )}
                      {isEditingTrainings && (
                        <View style={styles.trainingEditIcon}>
                          <Ionicons name="create" size={18} color={colors.accent} />
                        </View>
                      )}
                    </View>
                    <View style={styles.trainingCardDetails}>
                      <Text style={styles.trainingCardDetailText}>⏱️ {training.duration}min</Text>
                    </View>
                    {training.intensity && (
                      <View style={styles.trainingCardDetails}>
                        <Text style={styles.trainingCardDetailText}>
                          {getIntensityEmoji(training.intensity)} Intensity: {training.intensity}
                        </Text>
                      </View>
                    )}
                    {training.id !== -1 && training.analysis && !isEditingTrainings && (
                      <Text style={styles.trainingTapHint}>✨ Tap to view</Text>
                    )}
                    {isEditingTrainings && (
                      <Text style={styles.trainingTapHint}>Tap to edit</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
              {(isToday || isYesterday) && !trainingEditing && (
                <TouchableOpacity
                  style={styles.addTrainingCard}
                  onPress={() => setTrainingEditing(true)}
                >
                  <Ionicons name="add-circle" size={32} color={colors.accent} />
                  <Text style={styles.addTrainingText}>Add Training</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!hasTraining && !trainingEditing ? (
            <View style={styles.emptyState}>
              <Ionicons name="barbell-outline" size={48} color={colors.surfaceMute} />
              <Text style={styles.emptyStateText}>Add training context</Text>
              {(isToday || isYesterday) && (
                <TouchableOpacity
                  style={styles.addTrainingEmptyCard}
                  onPress={() => setTrainingEditing(true)}
                >
                  <Ionicons name="add-circle-outline" size={28} color={colors.accent} />
                  <Text style={[styles.addTrainingText, { marginTop: 0 }]}>Add Training Details</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : trainingEditing ? (
            <View style={styles.trainingForm}>
              <Text style={styles.formLabel}>Training Type <Text style={styles.mandatoryAsterisk}>*</Text></Text>
              <TextInput
                style={styles.textInput}
                value={trainingType}
                onChangeText={(text) => {
                  setTrainingType(text);
                  if (text.trim().length > 0) {
                    const filtered = trainingTypeHistory
                      .filter(h => h.type.toLowerCase().startsWith(text.toLowerCase()))
                      .slice(0, 3);
                    setTrainingSuggestions(filtered);
                  } else {
                    setTrainingSuggestions([]);
                  }
                }}
                placeholder="e.g., Morning Run, Strength Training"
                placeholderTextColor={colors.textMuted}
              />
              {trainingSuggestions.length > 0 && (
                <View style={styles.suggestionDropdown}>
                  {trainingSuggestions.map((s, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.suggestionItem, i < trainingSuggestions.length - 1 && styles.suggestionItemBorder]}
                      onPress={() => {
                        setTrainingType(s.type);
                        setTrainingGoal(s.goal || '');
                        setTrainingIntensity(s.intensity || '');
                        setTrainingComment(s.comment || '');
                        setTrainingDurationHours(s.durationHours);
                        setTrainingDurationMinutes(s.durationMinutes);
                        setTrainingSuggestions([]);
                      }}
                    >
                      <Text style={styles.suggestionText}>{s.type}</Text>
                      {(s.intensity || s.goal) ? (
                        <Text style={styles.suggestionMeta}>
                          {[s.intensity, s.goal].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={[styles.formLabel, styles.formLabelSpaced]}>Duration <Text style={styles.mandatoryAsterisk}>*</Text></Text>
              {Platform.OS === 'ios' ? (
                <View style={styles.iosTimePickerContainer}>
                  <DateTimePicker
                    value={(() => {
                      const date = new Date();
                      date.setHours(trainingDurationHours);
                      date.setMinutes(trainingDurationMinutes);
                      return date;
                    })()}
                    mode="countdown"
                    display="spinner"
                    minuteInterval={10}
                    onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                      if (selectedDate) {
                        setTrainingDurationHours(selectedDate.getHours());
                        setTrainingDurationMinutes(selectedDate.getMinutes());
                      }
                    }}
                    textColor={colors.textPrimary}
                    style={styles.iosTimePicker}
                  />
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.timePickerButton}
                    onPress={() => setShowTrainingDurationPicker(!showTrainingDurationPicker)}
                  >
                    <Ionicons name="time-outline" size={20} color={colors.accent} />
                    <Text style={styles.timePickerButtonText}>
                      {trainingDurationHours > 0 ? `${trainingDurationHours}h ` : ''}{trainingDurationMinutes}min
                    </Text>
                    <Ionicons name={showTrainingDurationPicker ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                  {showTrainingDurationPicker && (
                    <View style={styles.durationPickerContainer}>
                      <View style={styles.durationPickerWrapper}>
                        <View style={styles.durationColumn}>
                          <Text style={styles.durationColumnLabel}>Hours</Text>
                          <ScrollView style={styles.durationScrollView} showsVerticalScrollIndicator={false}>
                            {[0, 1, 2, 3, 4, 5].map((hour) => (
                              <TouchableOpacity
                                key={hour}
                                style={[
                                  styles.durationOption,
                                  trainingDurationHours === hour && styles.durationOptionActive,
                                ]}
                                onPress={() => setTrainingDurationHours(hour)}
                              >
                                <Text style={[
                                  styles.durationOptionText,
                                  trainingDurationHours === hour && styles.durationOptionTextActive,
                                ]}>
                                  {hour}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                        <View style={styles.durationColumn}>
                          <Text style={styles.durationColumnLabel}>Minutes</Text>
                          <ScrollView style={styles.durationScrollView} showsVerticalScrollIndicator={false}>
                            {[0, 10, 20, 30, 40, 50].map((min) => (
                              <TouchableOpacity
                                key={min}
                                style={[
                                  styles.durationOption,
                                  trainingDurationMinutes === min && styles.durationOptionActive,
                                ]}
                                onPress={() => setTrainingDurationMinutes(min)}
                              >
                                <Text style={[
                                  styles.durationOptionText,
                                  trainingDurationMinutes === min && styles.durationOptionTextActive,
                                ]}>
                                  {min}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.durationSaveButton}
                        onPress={() => setShowTrainingDurationPicker(false)}
                      >
                        <Text style={styles.durationSaveButtonText}>Save Duration</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}

              <Text style={[styles.formLabel, styles.formLabelSpaced]}>Goal</Text>
              <TextInput
                style={styles.textInput}
                value={trainingGoal}
                onChangeText={setTrainingGoal}
                placeholder="e.g., Endurance, Strength"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.formLabel, styles.formLabelSpaced]}>Intensity</Text>
              <View style={styles.intensityButtons}>
                {['Low', 'Moderate', 'High'].map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.intensityButton,
                      trainingIntensity === level && styles.intensityButtonActive,
                    ]}
                    onPress={() => setTrainingIntensity(level)}
                  >
                    <Text
                      style={[
                        styles.intensityButtonText,
                        trainingIntensity === level && styles.intensityButtonTextActive,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.formLabel, styles.formLabelSpaced]}>Notes</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMultiline]}
                value={trainingComment}
                onChangeText={setTrainingComment}
                placeholder="How did it feel? Any injuries or goals?"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
              />

              {/* Save Button - enabled only when mandatory fields are filled */}
              {(() => {
                const isFormValid = trainingType.trim().length > 0 && (trainingDurationHours > 0 || trainingDurationMinutes > 0);
                return (
                  <Button
                    onPress={handleSaveTraining}
                    variant={isFormValid ? 'primary' : 'secondary'}
                    style={styles.saveButton}
                    disabled={!isFormValid}
                  >
                    {editingTrainingId ? 'Update Training' : 'Save Training Data'}
                  </Button>
                );
              })()}

              {/* Cancel Button - always visible */}
              <Button
                onPress={() => {
                  setTrainingEditing(false);
                  setEditingTrainingId(null);
                  setTrainingType('');
                  setTrainingDurationHours(0);
                  setTrainingDurationMinutes(45);
                  setTrainingGoal('');
                  setTrainingIntensity('');
                  setTrainingComment('');
                  setTrainingSuggestions([]);
                }}
                variant="ghost"
                style={styles.cancelButton}
              >
                Cancel
              </Button>
            </View>
          ) : null}

        </View>
      )}

      {/* Calculate FitScore Button */}
      {canCalculate && (isToday || isYesterday) && !showFitScoreResult && (
        <View style={styles.calculateSection}>
          <Button
            onPress={handleCalculateFitScore}
            style={styles.calculateButton}
            disabled={calculatingFitScore}
          >
            {calculatingFitScore ? 'Calculating...' : 'Calculate My FitScore'}
          </Button>
        </View>
      )}

      {/* FitScore Result - Recovery Analysis FIRST, then Triangle */}
      {showFitScoreResult && fitScoreResult && (
        <Animated.View style={[styles.fitScoreResultSection, { opacity: fitScoreFadeAnim }]}>
          {/* 1. Recovery Analysis Card - FIRST */}
          <View style={styles.recoveryAnalysisCard}>
            <Text style={styles.recoveryAnalysisTitle}>Recovery Analysis</Text>

            {/* Recovery Metrics Grid - 2x2 Layout */}
            {/* Row 1: Recovery % and Sleep Hours */}
            <View style={styles.recoveryMetricsRow}>
              <View style={styles.recoveryMetricItem}>
                <View style={[styles.recoveryMetricIcon, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons name="heart" size={20} color={colors.accent} />
                </View>
                <Text style={styles.recoveryMetricLabel}>Recovery</Text>
                <Text style={[styles.recoveryMetricValue, { color: colors.accent }]}>
                  {fitScoreResult.whoopData.recoveryScore ?? 'N/A'}%
                </Text>
                {fitScoreResult.yesterdayData?.recoveryScore != null && fitScoreResult.whoopData.recoveryScore != null && (
                  <Text style={[
                    styles.recoveryMetricDelta,
                    { color: fitScoreResult.whoopData.recoveryScore >= fitScoreResult.yesterdayData.recoveryScore ? colors.success : colors.danger }
                  ]}>
                    {fitScoreResult.whoopData.recoveryScore >= fitScoreResult.yesterdayData.recoveryScore ? '↑' : '↓'}
                    {Math.abs(fitScoreResult.whoopData.recoveryScore - fitScoreResult.yesterdayData.recoveryScore).toFixed(0)}% {comparisonLabel}
                  </Text>
                )}
              </View>

              <View style={styles.recoveryMetricItem}>
                <View style={[styles.recoveryMetricIcon, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons name="bed" size={20} color={colors.accent} />
                </View>
                <Text style={styles.recoveryMetricLabel}>Sleep Hours</Text>
                <Text style={[styles.recoveryMetricValue, { color: colors.accent }]}>
                  {fitScoreResult.whoopData.sleepHours ? `${fitScoreResult.whoopData.sleepHours.toFixed(1)}h` : 'N/A'}
                </Text>
                {fitScoreResult.yesterdayData?.sleepHours != null && fitScoreResult.whoopData.sleepHours != null && (
                  <Text style={[
                    styles.recoveryMetricDelta,
                    { color: fitScoreResult.whoopData.sleepHours >= fitScoreResult.yesterdayData.sleepHours ? colors.success : colors.danger }
                  ]}>
                    {fitScoreResult.whoopData.sleepHours >= fitScoreResult.yesterdayData.sleepHours ? '↑' : '↓'}
                    {Math.abs(fitScoreResult.whoopData.sleepHours - fitScoreResult.yesterdayData.sleepHours).toFixed(1)}h {comparisonLabel}
                  </Text>
                )}
              </View>
            </View>

            {/* Row 2: Sleep Quality and HRV */}
            <View style={styles.recoveryMetricsRow}>
              <View style={styles.recoveryMetricItem}>
                <View style={[styles.recoveryMetricIcon, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons name="moon" size={20} color={colors.accent} />
                </View>
                <Text style={styles.recoveryMetricLabel}>Sleep Quality</Text>
                <Text style={[styles.recoveryMetricValue, { color: colors.accent }]}>
                  {fitScoreResult.whoopData.sleepScore ?? 'N/A'}%
                </Text>
                {fitScoreResult.yesterdayData?.sleepScore != null && fitScoreResult.whoopData.sleepScore != null && (
                  <Text style={[
                    styles.recoveryMetricDelta,
                    { color: fitScoreResult.whoopData.sleepScore >= fitScoreResult.yesterdayData.sleepScore ? colors.success : colors.danger }
                  ]}>
                    {fitScoreResult.whoopData.sleepScore >= fitScoreResult.yesterdayData.sleepScore ? '↑' : '↓'}
                    {Math.abs(fitScoreResult.whoopData.sleepScore - fitScoreResult.yesterdayData.sleepScore).toFixed(0)}% {comparisonLabel}
                  </Text>
                )}
              </View>

              <View style={styles.recoveryMetricItem}>
                <View style={[styles.recoveryMetricIcon, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons name="pulse" size={20} color={colors.accent} />
                </View>
                <Text style={styles.recoveryMetricLabel}>HRV</Text>
                <Text style={[styles.recoveryMetricValue, { color: colors.accent }]}>
                  {fitScoreResult.whoopData.hrv ? Math.round(fitScoreResult.whoopData.hrv) : 'N/A'} ms
                </Text>
                {fitScoreResult.yesterdayData?.hrv != null && fitScoreResult.whoopData.hrv != null && (
                  <Text style={[
                    styles.recoveryMetricDelta,
                    { color: fitScoreResult.whoopData.hrv >= fitScoreResult.yesterdayData.hrv ? colors.success : colors.danger }
                  ]}>
                    {fitScoreResult.whoopData.hrv >= fitScoreResult.yesterdayData.hrv ? '↑' : '↓'}
                    {Math.abs(fitScoreResult.whoopData.hrv - fitScoreResult.yesterdayData.hrv).toFixed(0)} ms {comparisonLabel}
                  </Text>
                )}
              </View>
            </View>

            {/* Analysis - Tap to View */}
            {fitScoreResult.breakdown.recovery.analysis && !showRecoveryAnalysis && (
              <TouchableOpacity
                onPress={() => setShowRecoveryAnalysis(true)}
                style={styles.recoveryTapToView}
              >
                <Ionicons name="sparkles" size={14} color={colors.accent} />
                <Text style={styles.recoveryTapToViewText}>Tap to view AI analysis</Text>
              </TouchableOpacity>
            )}
            {showRecoveryAnalysis && fitScoreResult.breakdown.recovery.analysis && (
              <TouchableOpacity
                onPress={() => setShowRecoveryAnalysis(false)}
                activeOpacity={0.8}
              >
                <View style={styles.recoveryAnalysisTextBox}>
                  <Ionicons name="sparkles" size={16} color={colors.accent} />
                  <Text style={styles.recoveryAnalysisText}>{fitScoreResult.breakdown.recovery.analysis}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* 2. FitScore Breakdown Title */}
          <Text style={styles.sectionTitleLarge}>FitScore Breakdown</Text>

          {/* 3. FitScore Triangle Visual - SVG Equilateral Triangle */}
          <View
            ref={triangleViewRef}
            style={styles.triangleWrapper}
          >
            <FitScoreTriangle
              recoveryScore={fitScoreResult.breakdown.recovery.score}
              nutritionScore={fitScoreResult.breakdown.nutrition.score}
              trainingScore={fitScoreResult.breakdown.training.score}
              fitScore={fitScoreResult.fitScore}
              size={280}
              animate={triangleAnimating}
              nutritionCount={meals.length}
              trainingCount={trainingSessions.length}
            />
          </View>

          {/* Formula Info — collapsible tooltip */}
          <TouchableOpacity
            style={styles.formulaToggle}
            onPress={() => setShowFormulaTooltip(v => !v)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
            <Text style={styles.formulaToggleText}>How is this calculated?</Text>
            <Ionicons
              name={showFormulaTooltip ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={colors.textMuted}
            />
          </TouchableOpacity>
          {showFormulaTooltip && (
            <View style={styles.formulaTooltip}>
              <Text style={styles.formulaTooltipText}>
                Recovery · Nutrition · Training — each scored 1–10, weighted by today's data quality. The triangle visualises balance across all three pillars.
              </Text>
            </View>
          )}

          {/* All Green — shown only after animation completes */}
          {showAllGreenBanner && fitScoreResult.allGreen && (
            <View style={styles.allGreenBanner}>
              <Text style={styles.allGreenText}>Strong day — all metrics in the green.</Text>
            </View>
          )}

          {/* FitCoach Preview */}
          <TouchableOpacity
            style={styles.coachPreviewCard}
            onPress={() => !isPastDate && coachSummary?.slides && setShowCoachModal(true)}
            activeOpacity={!isPastDate && coachSummary?.slides ? 0.7 : 1}
          >
            <View style={styles.coachSummaryHeader}>
              <View style={styles.coachIconContainer}>
                <Ionicons name="chatbubbles" size={18} color={colors.accent} />
              </View>
              <Text style={styles.coachSummaryTitle}>FitCoach</Text>
            </View>
            {loadingCoachSummary ? (
              <View style={styles.coachSummaryLoading}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.coachSummaryLoadingText}>Analyzing your day...</Text>
              </View>
            ) : coachSummary ? (
              <>
                <Text style={styles.coachPreviewText}>{coachSummary.preview}</Text>
                {!isPastDate && (
                  <Text style={styles.coachPreviewCTA}>Tap to see detailed overview</Text>
                )}
              </>
            ) : (
              <Text style={styles.coachSummaryPlaceholder}>Coach analysis loading...</Text>
            )}
          </TouchableOpacity>

          {/* Today's Biggest Lever */}
          {weakLink ? (
            <View style={[styles.weakLinkCard, { borderLeftColor: weakLink.zoneColor }]}>
              <View style={styles.weakLinkHeader}>
                <View style={[styles.weakLinkIconContainer, { backgroundColor: weakLink.zoneColor + '20' }]}>
                  <Ionicons name="trending-up" size={15} color={weakLink.zoneColor} />
                </View>
                <Text style={styles.weakLinkTitle}>Today's Biggest Lever</Text>
              </View>
              <Text style={[styles.weakLinkPillar, { color: weakLink.zoneColor }]}>
                {weakLink.pillar} · {weakLink.displayScore}/10
              </Text>
              <Text style={styles.weakLinkReason}>
                {weakLink.secondReason ? `• ${weakLink.reason}` : weakLink.reason}
              </Text>
              {weakLink.secondReason ? (
                <Text style={styles.weakLinkReason}>• {weakLink.secondReason}</Text>
              ) : null}
              <TouchableOpacity
                style={styles.weakLinkCTA}
                onPress={() =>
                  (navigation as any).navigate('FitCoach', {
                    prefilledMessage: weakLink.ctaMessage,
                    autoSubmit: false,
                  })
                }
                activeOpacity={0.75}
              >
                <Text style={styles.weakLinkCTAText}>Fix this with FitCoach</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.bgPrimary} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Recalculate Button */}
          <TouchableOpacity
            style={styles.recalculateButton}
            onPress={() => {
              setShowFitScoreResult(false);
              setFitScoreResult(null);
              setShowRecoveryAnalysis(false);
              setTriangleAnimating(false);
              triangleHasAnimated.current = false;
            }}
          >
            <Text style={styles.recalculateButtonText}>Update Data & Recalculate</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Info text when conditions not met */}
      {!canCalculate && (isToday || isYesterday) && (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
          <Text style={styles.infoText}>
            {'Add at least one meal to calculate your FitScore'}
          </Text>
        </View>
      )}

      {/* FitCoach Slide Modal */}
      <CoachModal
        visible={showCoachModal}
        onClose={() => { setShowCoachModal(false); setActiveSlideIndex(0); }}
        coachSummary={coachSummary}
        activeSlideIndex={activeSlideIndex}
        setActiveSlideIndex={setActiveSlideIndex}
      />

      {/* Enhanced Meal Modal */}
      <Modal
        visible={showMealModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMealModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.mealModalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowMealModal(false);
                  setPendingMealImage(null);
                  setSelectedMealType('');
                  setMealNotes('');
                  setEditingMealId(null);
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>
                {editingMealId ? 'Edit Meal Details' : 'Add Meal Details'}
              </Text>
              <View style={{ width: 28 }} />
            </View>

            <ScrollView ref={mealScrollRef} style={styles.modalScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Image Preview */}
              {pendingMealImage && (
                <Image source={{ uri: pendingMealImage }} style={styles.mealPreviewImage} />
              )}

              {/* Meal Type Selection */}
              <Text style={styles.modalSectionTitle}>Meal Type</Text>
              <View style={styles.mealTypeGrid}>
                {[
                  { type: 'Breakfast', emoji: '🌅' },
                  { type: 'Brunch', emoji: '🥐' },
                  { type: 'Lunch', emoji: '🍱' },
                  { type: 'Dinner', emoji: '🍽️' },
                  { type: 'Snack #1', emoji: '🍎' },
                  { type: 'Snack #2', emoji: '🥨' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.type}
                    style={[
                      styles.mealTypeButton,
                      selectedMealType === item.type && styles.mealTypeButtonActive,
                    ]}
                    onPress={() => setSelectedMealType(item.type)}
                  >
                    <Text style={styles.mealTypeEmoji}>{item.emoji}</Text>
                    <Text
                      style={[
                        styles.mealTypeButtonText,
                        selectedMealType === item.type && styles.mealTypeButtonTextActive,
                      ]}
                    >
                      {item.type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Meal Time Picker */}
              <Text style={styles.modalSectionTitle}>Meal Time</Text>
              {Platform.OS === 'ios' ? (
                <View style={styles.iosTimePickerContainer}>
                  <DateTimePicker
                    value={mealTime}
                    mode="time"
                    display="spinner"
                    minuteInterval={10}
                    onChange={(event: DateTimePickerEvent, selectedTime?: Date) => {
                      if (selectedTime) {
                        setMealTime(selectedTime);
                      }
                    }}
                    textColor={colors.textPrimary}
                    style={styles.iosTimePicker}
                  />
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.timePickerButton}
                    onPress={() => setShowMealTimePicker(!showMealTimePicker)}
                  >
                    <Ionicons name="time-outline" size={20} color={colors.accent} />
                    <Text style={styles.timePickerButtonText}>
                      {mealTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Ionicons name={showMealTimePicker ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                  {showMealTimePicker && (
                    <DateTimePicker
                      value={mealTime}
                      mode="time"
                      display="spinner"
                      minuteInterval={10}
                      onChange={(event: DateTimePickerEvent, selectedTime?: Date) => {
                        setShowMealTimePicker(false);
                        if (selectedTime) {
                          setMealTime(selectedTime);
                        }
                      }}
                    />
                  )}
                </>
              )}

              {/* Meal Notes */}
              <Text style={styles.modalSectionTitle}>Meal Notes (Optional)</Text>
              <Text style={styles.modalSectionSubtitle}>
                Add any details not visible in the photo (e.g., "The carbs are polenta, not mashed potatoes")
              </Text>
              <TextInput
                style={styles.mealNotesInput}
                value={mealNotes}
                onChangeText={setMealNotes}
                placeholder="E.g., ingredients, cooking method, portion size..."
                placeholderTextColor={colors.textMuted}
                multiline
                onFocus={() => {
                  setTimeout(() => mealScrollRef.current?.scrollToEnd({ animated: true }), 300);
                }}
              />

              {/* Log/Update Meal Button — inside scroll so it never floats above keyboard */}
              <View style={styles.modalFooter}>
                <Button onPress={handleLogMeal} style={styles.logMealButton}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.bgPrimary} style={{ marginRight: 8 }} />
                  {editingMealId ? 'Update Meal' : 'Log Meal'}
                </Button>
              </View>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Meal Analysis Modal */}
      <Modal
        visible={showAnalysisModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAnalysisModal(false)}
      >
        <View style={styles.analysisModalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowAnalysisModal(false)}
          />
          <View style={styles.modalContentContainer}>
            <ScrollView
              contentContainerStyle={styles.mealAnalysisScrollContent}
              showsVerticalScrollIndicator={true}
              bounces={true}
            >
              {selectedMeal && (
                <View style={styles.mealAnalysisContent}>
                  <View style={styles.mealAnalysisHeader}>
                    <Text style={styles.mealAnalysisTitle}>{selectedMeal.mealType}</Text>
                  </View>

                  {selectedMeal.nutritionScore && (
                    <View style={styles.mealAnalysisScoreSection}>
                      <View style={[styles.mealAnalysisScoreBadge, { backgroundColor: getScoreColor(selectedMeal.nutritionScore) }]}>
                        <Text style={styles.mealAnalysisScoreValue}>
                          {selectedMeal.nutritionScoreDisplay ?? Math.round(selectedMeal.nutritionScore)}
                        </Text>
                        <Text style={styles.mealAnalysisScoreMax}>/10</Text>
                      </View>
                    </View>
                  )}

                  {selectedMeal.analysis && (() => {
                    // Parse ✅/⚠️/🔧 structured format if present
                    const strengthMatch = selectedMeal.analysis.match(/✅ Strength:\s*(.+?)(?=\n⚠️|$)/s);
                    const gapMatch      = selectedMeal.analysis.match(/⚠️ Gap:\s*(.+?)(?=\n🔧|$)/s);
                    const upgradeMatch  = selectedMeal.analysis.match(/🔧 Upgrade:\s*(.+?)$/s);

                    if (strengthMatch && upgradeMatch) {
                      // Hide Gap when meal score is high (≥ 8) — no meaningful negative signal at that level
                      const showGap = gapMatch && (!selectedMeal.nutritionScore || selectedMeal.nutritionScore < 8);
                      const rows: { icon: string; label: string; text: string }[] = [
                        { icon: '✅', label: 'Strength', text: strengthMatch[1].trim() },
                        ...(showGap ? [{ icon: '⚠️', label: 'Gap', text: gapMatch![1].trim() }] : []),
                        { icon: '🔧', label: 'Upgrade', text: upgradeMatch[1].trim() },
                      ];
                      return (
                        <View style={styles.mealAnalysisTextSection}>
                          {rows.map((row, i) => (
                            <View
                              key={i}
                              style={[styles.mealAnalysisRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}
                            >
                              <Text style={styles.mealAnalysisRowIcon}>{row.icon}</Text>
                              <View style={styles.mealAnalysisRowBody}>
                                <Text style={styles.mealAnalysisRowLabel}>{row.label}</Text>
                                <Text style={styles.mealAnalysisRowText}>{row.text}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      );
                    }
                    // Fallback: plain text for legacy meals
                    return (
                      <View style={styles.mealAnalysisTextSection}>
                        <Text style={styles.mealAnalysisText}>{selectedMeal.analysis}</Text>
                      </View>
                    );
                  })()}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Training Analysis Modal */}
      <Modal
        visible={showTrainingAnalysisModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTrainingAnalysisModal(false)}
      >
        <View style={styles.analysisModalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowTrainingAnalysisModal(false)}
          />
          <View style={styles.modalContentContainer}>
            <ScrollView
              contentContainerStyle={styles.trainingAnalysisScrollContent}
              showsVerticalScrollIndicator={true}
              bounces={true}
            >
              {selectedTraining && (
                <View style={styles.trainingAnalysisContent}>
                  {/* Title — mirrors meal analysis header */}
                  <View style={styles.mealAnalysisHeader}>
                    <Text style={styles.mealAnalysisTitle}>{selectedTraining.type}</Text>
                  </View>

                  {/* Score Badge + Zone */}
                  {selectedTraining.score && (
                    <View style={styles.trainingAnalysisScoreSection}>
                      <View
                        style={[
                          styles.trainingAnalysisScoreBadge,
                          { backgroundColor: getScoreColor(selectedTraining.score) },
                        ]}
                      >
                        <Text style={styles.trainingAnalysisScoreValue}>
                          {Math.round(selectedTraining.score)}
                        </Text>
                        <Text style={styles.trainingAnalysisScoreMax}>/10</Text>
                      </View>
                      {selectedTraining.recoveryZone && (
                        <Text style={[
                          styles.trainingAnalysisZoneBadge,
                          {
                            color: selectedTraining.recoveryZone === 'green'
                              ? colors.success
                              : selectedTraining.recoveryZone === 'yellow'
                              ? colors.warning
                              : colors.danger
                          }
                        ]}>
                          {selectedTraining.recoveryZone.toUpperCase()} ZONE
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Compact metadata row */}
                  <View style={styles.trainingAnalysisDetailsSection}>
                    <View style={styles.trainingAnalysisDetailItem}>
                      <Text style={styles.trainingAnalysisDetail}>⏱️ Duration: {selectedTraining.duration} min</Text>
                    </View>
                    {selectedTraining.intensity && (
                      <View style={styles.trainingAnalysisDetailItem}>
                        <Text style={styles.trainingAnalysisDetail}>
                          {selectedTraining.intensity === 'Low' ? '💙' : selectedTraining.intensity === 'Moderate' ? '🟡' : '🔥'} Intensity: {selectedTraining.intensity}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* AI Analysis — structured (mirrors meal analysis parser) */}
                  {selectedTraining.analysis && (() => {
                    const text = selectedTraining.analysis;
                    const strengthMatch = text.match(/✅ Strength:\s*(.+?)(?=\n⚠️|\n🔧|$)/s);
                    const gapMatch      = text.match(/⚠️ Gap:\s*(.+?)(?=\n🔧|$)/s);
                    const upgradeMatch  = text.match(/🔧 Upgrade:\s*(.+?)$/s);

                    if (strengthMatch && upgradeMatch) {
                      // Structured format — build rows dynamically (Gap is optional)
                      const rows: { icon: string; label: string; text: string }[] = [
                        { icon: '✅', label: 'Strength', text: strengthMatch[1].trim() },
                        ...(gapMatch ? [{ icon: '⚠️', label: 'Gap', text: gapMatch[1].trim() }] : []),
                        { icon: '🔧', label: 'Upgrade', text: upgradeMatch[1].trim() },
                      ];
                      return (
                        <View style={styles.mealAnalysisTextSection}>
                          {rows.map((row, i) => (
                            <View
                              key={i}
                              style={[styles.mealAnalysisRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}
                            >
                              <Text style={styles.mealAnalysisRowIcon}>{row.icon}</Text>
                              <View style={styles.mealAnalysisRowBody}>
                                <Text style={styles.mealAnalysisRowLabel}>{row.label}</Text>
                                <Text style={styles.mealAnalysisRowText}>{row.text}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      );
                    }
                    // Fallback: plain text for legacy training entries
                    return (
                      <View style={styles.trainingAnalysisTextSection}>
                        <Text style={styles.trainingAnalysisText}>{text}</Text>
                      </View>
                    );
                  })()}

                  {/* Score Breakdown — collapsed by default */}
                  {selectedTraining.breakdown && (
                    <>
                      <TouchableOpacity
                        style={styles.breakdownToggle}
                        onPress={() => setShowTrainingBreakdown(v => !v)}
                      >
                        <Text style={styles.breakdownToggleText}>
                          {showTrainingBreakdown ? 'Hide scoring ↑' : 'View detailed scoring ›'}
                        </Text>
                      </TouchableOpacity>
                      {showTrainingBreakdown && (
                        <View style={styles.trainingMetricsTable}>
                          <View style={styles.trainingMetricRow}>
                            <Text style={styles.trainingMetricLabel}>Strain Appropriateness</Text>
                            <Text style={styles.trainingMetricValue}>
                              {selectedTraining.breakdown.strainAppropriatenessScore.toFixed(1)}/4.0
                            </Text>
                          </View>
                          <View style={styles.trainingMetricRow}>
                            <Text style={styles.trainingMetricLabel}>Session Quality</Text>
                            <Text style={styles.trainingMetricValue}>
                              {selectedTraining.breakdown.sessionQualityScore.toFixed(1)}/3.0
                            </Text>
                          </View>
                          <View style={styles.trainingMetricRow}>
                            <Text style={styles.trainingMetricLabel}>Goal Alignment</Text>
                            <Text style={styles.trainingMetricValue}>
                              {selectedTraining.breakdown.goalAlignmentScore.toFixed(1)}/2.0
                            </Text>
                          </View>
                          <View style={[styles.trainingMetricRow, { borderBottomWidth: 0 }]}>
                            <Text style={styles.trainingMetricLabel}>Injury Safety</Text>
                            <Text style={styles.trainingMetricValue}>
                              {selectedTraining.breakdown.injurySafetyModifier.toFixed(1)}/1.0
                            </Text>
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* FitScore Ready Reveal */}
      <Modal
        transparent
        visible={showReadyReveal}
        animationType="none"
        statusBarTranslucent
        onRequestClose={dismissReadyReveal}
      >
        <TouchableOpacity
          style={styles.revealBackdrop}
          activeOpacity={1}
          onPress={dismissReadyReveal}
        >
          <Animated.View
            style={[
              styles.revealCard,
              { opacity: revealOpacity, transform: [{ scale: revealScale }] },
            ]}
          >
            <View style={styles.revealAccentBar} />
            <Text style={styles.revealTitle}>Your FitScore is Ready.</Text>
            <Text style={styles.revealSubtext}>
              Tap and scroll down to see how well you lived according to your goals.
            </Text>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: 0,
  },
  dateArrow: {
    padding: spacing.md,
    marginHorizontal: spacing.sm,
  },
  dateArrowDisabled: {
    opacity: 0.2,
  },
  dateText: {
    ...typography.h2,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.5,
    minWidth: 120,
    textAlign: 'center',
  },
  yesterdayShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.sm,
    marginTop: 2,
  },
  yesterdayShortcutText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  retroBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.accent + '15',
    borderRadius: 8,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  retroBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  retroBannerDate: {
    color: colors.accent,
    fontWeight: '600',
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  editButtonText: {
    ...typography.small,
    color: colors.textMuted,
    marginLeft: spacing.xs / 2,
    fontWeight: '600',
  },
  editButtonTextActive: {
    color: colors.accent,
  },
  emptyState: {
    padding: spacing.xl,
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  emptyStateText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  addButton: {
    marginTop: spacing.sm,
  },
  addTrainingEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.accent + '40',
    borderStyle: 'dashed',
  },
  mealsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  mealCard: {
    width: 100,
    height: 100,
    borderRadius: radii.md,
    overflow: 'hidden',
    position: 'relative',
  },
  mealCardEditing: {
    borderWidth: 2,
    borderColor: colors.accent,
    opacity: 0.95,
  },
  mealImage: {
    width: '100%',
    height: '100%',
  },
  editOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(39, 233, 181, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 24, 36, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  analyzingText: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '600',
    marginTop: spacing.xs / 2,
  },
  mealOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: spacing.xs,
  },
  mealType: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  addMealCard: {
    width: 100,
    height: 100,
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.accent + '40',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMealText: {
    ...typography.small,
    color: colors.accent,
    marginTop: spacing.xs,
  },
  trainingForm: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
  },
  formLabel: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  formLabelSpaced: {
    marginTop: spacing.md,
  },
  formPlaceholder: {
    ...typography.small,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  textInput: {
    ...typography.body,
    backgroundColor: colors.surfaceMute + '30',
    borderRadius: radii.sm,
    padding: spacing.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '50',
  },
  textInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  intensityButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  intensityButton: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceMute + '30',
    borderRadius: radii.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceMute + '50',
  },
  intensityButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  intensityButtonText: {
    ...typography.body,
    color: colors.textMuted,
  },
  intensityButtonTextActive: {
    color: colors.bgPrimary,
    fontWeight: '600',
  },
  saveButton: {
    marginTop: spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.5,
    backgroundColor: colors.surfaceMute,
  },
  mandatoryAsterisk: {
    color: colors.danger,
    fontWeight: '700',
  },
  trainingCard: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
  },
  trainingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  trainingType: {
    ...typography.title,
    marginLeft: spacing.sm,
  },
  suggestionDropdown: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    marginTop: 2,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  suggestionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute,
  },
  suggestionText: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 14,
  },
  suggestionMeta: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  trainingDetails: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  trainingDetailText: {
    ...typography.body,
    color: colors.textMuted,
  },
  editLink: {
    ...typography.body,
    color: colors.accent,
    marginLeft: spacing.xs,
  },
  trainingActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteLink: {
    ...typography.body,
    color: colors.danger,
    marginLeft: spacing.xs,
  },
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceMute + '30',
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  calendarButtonText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '600',
  },
  addAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
    marginTop: spacing.md,
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: colors.accent + '40',
    borderStyle: 'dashed',
  },
  addAnotherText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: spacing.sm,
  },
  calculateSection: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  calculateButton: {
    backgroundColor: colors.accent,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: radii.sm,
  },
  infoText: {
    ...typography.body,
    color: colors.textMuted,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  mealModalContent: {
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '90%',
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute + '30',
  },
  closeButton: {
    padding: spacing.xs,
  },
  modalHeaderTitle: {
    ...typography.h3,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalScroll: {
    padding: spacing.lg,
  },
  mealPreviewImage: {
    width: '100%',
    height: 200,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  modalSectionTitle: {
    ...typography.title,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  modalSectionSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  mealTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  mealTypeButton: {
    width: '31%',
    backgroundColor: colors.surfaceMute + '30',
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mealTypeButtonActive: {
    backgroundColor: colors.accent + '20',
    borderColor: colors.accent,
  },
  mealTypeEmoji: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  mealTypeButtonText: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '500',
  },
  mealTypeButtonTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  mealNotesInput: {
    ...typography.body,
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '50',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  logMealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  loadingContent: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.xl,
    borderRadius: radii.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.md,
    fontWeight: '600',
  },
  scoreBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    paddingVertical: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  scoreText: {
    ...typography.small,
    color: colors.bgPrimary,
    fontWeight: '700',
  },
  tapHint: {
    ...typography.small,
    color: colors.accent,
    marginTop: spacing.xs / 2,
    fontSize: 11,
  },
  analysisModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContentContainer: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '85%',
  },
  analysisModalContent: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  analysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  analysisTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  analysisScoreSection: {
    backgroundColor: colors.bgPrimary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  analysisScoreLabel: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  analysisScoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
  },
  analysisScoreValue: {
    ...typography.h1,
    color: colors.bgPrimary,
    fontWeight: '700',
    fontSize: 42,
  },
  analysisScoreMax: {
    ...typography.h3,
    color: colors.bgPrimary,
    fontWeight: '500',
    marginLeft: spacing.xs / 2,
  },
  analysisTextSection: {
    marginBottom: spacing.md,
  },
  analysisLabel: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  analysisText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  analysisNotesSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute + '30',
  },
  analysisNotes: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  calculateButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '600',
  },
  analysisModalContent: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    width: '90%',
    maxHeight: '85%',
  },
  averageScoreCard: {
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  averageScoreLabel: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  averageScoreValue: {
    ...typography.h1,
    fontWeight: '700',
    fontSize: 56,
  },
  averageScoreMax: {
    ...typography.h2,
    color: colors.textMuted,
    fontWeight: '500',
  },
  recoveryZoneBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    marginTop: spacing.md,
  },
  recoveryZoneText: {
    ...typography.small,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  whoopDataCard: {
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  whoopDataTitle: {
    ...typography.title,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  whoopMetrics: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  whoopMetric: {
    flex: 1,
    alignItems: 'center',
  },
  whoopMetricLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  whoopMetricValue: {
    ...typography.h3,
    fontWeight: '600',
    color: colors.accent,
  },
  sessionAnalysisCard: {
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sessionAnalysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sessionType: {
    ...typography.title,
    fontWeight: '600',
  },
  sessionScoreBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  sessionScoreBadgeText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '700',
  },
  sessionDetails: {
    marginBottom: spacing.md,
  },
  sessionDetailText: {
    ...typography.body,
    color: colors.textMuted,
  },
  sessionAnalysis: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  breakdownSection: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute + '40',
  },
  breakdownTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  breakdownLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  breakdownValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.accent,
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent + '15',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  goalText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  modalActions: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute + '30',
  },
  closeModalButton: {
    width: '100%',
  },
  trainingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  trainingCardCompact: {
    width: '47%',
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 110,
  },
  trainingCardEditing: {
    borderWidth: 2,
    borderColor: colors.accent,
    opacity: 0.95,
  },
  trainingAnalyzingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 24, 36, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    zIndex: 10,
  },
  trainingAnalyzingText: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '600',
    marginTop: spacing.xs / 2,
  },
  trainingCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  trainingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  trainingScoreBadge: {
    paddingVertical: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    minWidth: 32,
    alignItems: 'center',
  },
  trainingScoreText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  trainingEditIcon: {
    padding: spacing.xs / 2,
  },
  trainingCardType: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.sm,
  },
  trainingCardDetails: {
    marginTop: spacing.xs,
  },
  trainingCardDetailText: {
    ...typography.small,
    color: colors.textMuted,
  },
  trainingTapHint: {
    ...typography.small,
    color: colors.accent,
    marginTop: spacing.xs,
    fontStyle: 'italic',
    fontSize: 11,
  },
  addTrainingCard: {
    width: '47%',
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.accent + '40',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
    padding: spacing.md,
  },
  addTrainingText: {
    ...typography.small,
    color: colors.accent,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  analysisDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  analysisDetail: {
    ...typography.body,
    color: colors.textMuted,
  },
  tapHint: {
    ...typography.small,
    color: colors.accent,
    fontStyle: 'italic',
    fontSize: 11,
    marginTop: 2,
  },
  // Meal Analysis Modal Styles
  mealAnalysisScrollContent: {
    flexGrow: 1,
    paddingVertical: spacing.xl,
  },
  mealAnalysisContent: {
    width: '100%',
  },
  mealAnalysisHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  mealAnalysisTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  mealAnalysisScoreSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  mealAnalysisScoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
  },
  mealAnalysisScoreValue: {
    ...typography.h1,
    color: colors.bgPrimary,
    fontWeight: '700',
    fontSize: 48,
  },
  mealAnalysisScoreMax: {
    ...typography.h3,
    color: colors.bgPrimary,
    fontWeight: '500',
    marginLeft: spacing.xs,
  },
  mealAnalysisTextSection: {
    paddingHorizontal: spacing.md,
    gap: 0,
  },
  mealAnalysisText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  mealAnalysisRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute + '40',
    gap: 10,
  },
  mealAnalysisRowIcon: {
    fontSize: 20,
    lineHeight: 24,
    width: 26,
    textAlign: 'center',
  },
  mealAnalysisRowBody: {
    flex: 1,
    gap: 2,
  },
  mealAnalysisRowLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  mealAnalysisRowText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  // Training Analysis Modal Styles
  trainingAnalysisScrollContent: {
    flexGrow: 1,
    paddingVertical: spacing.xl,
  },
  trainingAnalysisContent: {
    width: '100%',
  },
  trainingAnalysisScoreSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  trainingAnalysisScoreLabel: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  trainingAnalysisScoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    marginBottom: spacing.xs,
  },
  trainingAnalysisScoreValue: {
    ...typography.h1,
    color: colors.bgPrimary,
    fontWeight: '700',
    fontSize: 48,
  },
  trainingAnalysisScoreMax: {
    ...typography.h3,
    color: colors.bgPrimary,
    fontWeight: '500',
    marginLeft: spacing.xs,
  },
  trainingAnalysisZoneBadge: {
    ...typography.small,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  trainingAnalysisDetailsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  trainingAnalysisDetailItem: {
    alignItems: 'center',
  },
  trainingAnalysisDetail: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
  trainingAnalysisTextSection: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  trainingAnalysisText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  breakdownToggle: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  breakdownToggleText: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '500',
  },
  trainingMetricsTable: {
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: radii.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
  },
  trainingMetricsTitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  trainingMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute + '30',
  },
  trainingMetricLabel: {
    ...typography.small,
    color: colors.textMuted,
    flex: 1,
    marginRight: spacing.sm,
  },
  trainingMetricValue: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '700',
    flexShrink: 0,
  },
  // FitScore Result Styles
  fitScoreResultSection: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitleLarge: {
    ...typography.h2,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  triangleWrapper: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.lg,
    padding: spacing.lg,
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  formulaText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: spacing.lg,
  },
  formulaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: spacing.sm,
    alignSelf: 'center',
  },
  formulaToggleText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
  formulaTooltip: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '40',
  },
  formulaTooltipText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    fontSize: 12,
  },
  allGreenBanner: {
    borderTopWidth: 1,
    borderTopColor: colors.accent + '40',
    paddingTop: spacing.md,
    marginBottom: spacing.lg,
  },
  allGreenText: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  recoveryAnalysisCard: {
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  recoveryAnalysisTitle: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  recoveryMetricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  recoveryMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  recoveryMetricItem: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: spacing.sm,
  },
  recoveryMetricIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  recoveryMetricLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.xs / 2,
    textAlign: 'center',
  },
  recoveryMetricValue: {
    ...typography.title,
    fontSize: 20,
    fontWeight: '700',
  },
  recoveryMetricDelta: {
    ...typography.small,
    marginTop: spacing.xs / 2,
    textAlign: 'center',
  },
  recoveryTapToView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  recoveryTapToViewText: {
    ...typography.small,
    color: colors.accent,
    fontStyle: 'italic',
    fontSize: 12,
  },
  recoveryAnalysisTextBox: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  recoveryAnalysisText: {
    ...typography.body,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 20,
  },
  fitScoreSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surfaceMute + '15',
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  fitScoreSummaryItem: {
    alignItems: 'center',
  },
  fitScoreSummaryValue: {
    ...typography.h2,
    color: colors.accent,
    fontWeight: '700',
  },
  fitScoreSummaryLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  recalculateButton: {
    backgroundColor: colors.surfaceMute + '30',
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  recalculateButtonText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '600',
  },
  // Weak Link Card Styles
  weakLinkCard: {
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  weakLinkHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  weakLinkIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent + '20',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  weakLinkTitle: {
    ...typography.body,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  weakLinkPillar: {
    ...typography.body,
    fontWeight: '600' as const,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  weakLinkReason: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  weakLinkCTA: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  weakLinkCTAText: {
    ...typography.small,
    fontWeight: '600' as const,
    color: colors.bgPrimary,
  },
  // Coach Summary Styles
  coachPreviewCard: {
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  coachSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  coachIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachSummaryTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  coachPreviewText: {
    ...typography.body,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  coachPreviewCTA: {
    ...typography.small,
    color: colors.accent,
    fontStyle: 'italic',
    marginTop: spacing.md,
    fontWeight: '500',
  },
  coachSummaryLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  coachSummaryLoadingText: {
    ...typography.small,
    color: colors.textMuted,
  },
  coachSummaryPlaceholder: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  // Coach Modal Styles
  coachModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  coachModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  coachModalSheet: {
    height: MODAL_HEIGHT,
    backgroundColor: '#0B1120',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  coachModalTopBar: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  coachDragHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#555',
  },
  coachModalHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  coachModalHeaderTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  coachSlideScroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  coachSlideTapZones: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 80,
    flexDirection: 'row',
    zIndex: 10,
  },
  coachSlideTapLeft: {
    flex: 1,
  },
  coachSlideTapRight: {
    flex: 2,
  },
  coachSlideNumber: {
    color: '#666',
    marginBottom: spacing.md,
    letterSpacing: 3,
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: '500',
  },
  coachContextStripWrap: {
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
  },
  coachContextStrip: {
    color: colors.accent,
    backgroundColor: colors.accent + '12',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
    fontSize: 12,
    fontWeight: '500',
    overflow: 'hidden',
  },
  coachSlideTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 28,
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
  },
  coachSlideDivider: {
    width: 32,
    height: 3,
    backgroundColor: colors.accent,
    borderRadius: 2,
    marginBottom: spacing.lg,
  },
  coachChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  coachChip: {
    backgroundColor: colors.accent + '12',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.accent + '25',
  },
  coachChipText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  coachSlideContent: {
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 26,
    fontSize: 16,
    letterSpacing: 0.1,
  },
  coachCallContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.xl,
    backgroundColor: colors.accent + '08',
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  coachCallAccent: {
    width: 3,
    backgroundColor: colors.accent,
    borderRadius: 2,
    alignSelf: 'stretch',
  },
  coachCallText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },
  coachDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    paddingTop: spacing.md,
    gap: 8,
  },
  coachDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  coachDotActive: {
    backgroundColor: colors.accent,
    width: 24,
  },
  // Time Picker Styles
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMute + '30',
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  timePickerButtonText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    fontWeight: '600',
  },
  iosTimePickerContainer: {
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: radii.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  iosTimePicker: {
    height: 150,
    backgroundColor: 'transparent',
  },
  durationPickerContainer: {
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  mealTimePickerContainer: {
    backgroundColor: colors.surfaceMute + '20',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  durationPickerWrapper: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  durationColumn: {
    alignItems: 'center',
    width: 80,
  },
  durationColumnLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  durationScrollView: {
    height: 150,
  },
  mealTimeScrollView: {
    height: 180,
  },
  durationOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    marginVertical: 2,
    minWidth: 60,
    alignItems: 'center',
  },
  durationOptionActive: {
    backgroundColor: colors.accent + '30',
  },
  durationOptionText: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 18,
  },
  durationOptionTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  durationSaveButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  durationSaveButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '600',
  },

  // Past date read-only views
  pastScoreSection: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  pastScoreCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSecondary,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  pastScoreNumber: {
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -1,
  },
  pastScoreFitLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: -4,
  },
  pastScoreDate: {
    ...typography.body,
    color: colors.textMuted,
  },
  pastEmptySection: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  pastEmptyTitle: {
    ...typography.title,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  pastEmptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Hydration picker
  waterSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  waterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  waterLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
  waterSelected: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '600',
    fontSize: 12,
    marginLeft: 'auto',
  },
  waterChips: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  waterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    backgroundColor: colors.bgSecondary,
  },
  waterChipActive: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}18`,
  },
  waterChipText: {
    ...typography.small,
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  waterChipTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },

  // Daily Habits Check-in block
  habitsSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  habitsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  habitsLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
  habitsProgress: {
    ...typography.small,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  habitsEmptyText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  habitsChecklist: {
    gap: 2,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  habitCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.textMuted + '80',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  habitCheckboxDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  habitText: {
    ...typography.small,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  habitTextDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },

  // FitScore Ready Reveal
  revealBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  revealCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: 0,
    paddingBottom: spacing.xl,
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  revealAccentBar: {
    height: 3,
    backgroundColor: colors.accent,
    marginBottom: spacing.lg,
  },
  revealTitle: {
    ...typography.h1,
    fontSize: 22,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  revealSubtext: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 23,
  },
});
