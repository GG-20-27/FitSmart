import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Modal, Alert, ActivityIndicator, Platform, Dimensions, FlatList, Animated, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, spacing, typography, radii } from '../theme';
import { Button } from '../ui/components';
import FitScoreTriangle from '../components/FitScoreTriangle';
import {
  uploadMeal,
  getMealsByDate,
  saveTrainingData,
  getTrainingDataByDate,
  updateTrainingData,
  deleteTrainingData as deleteTrainingDataAPI,
  analyzeTraining,
  calculateFitScore,
  getCoachSummary,
  formatDate,
  type MealData,
  type TrainingDataEntry,
  type TrainingAnalysisResponse,
  type FitScoreResponse,
  type CoachSummaryResponse,
  type CoachSlide,
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

export default function FitScoreScreen() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [meals, setMeals] = useState<MealData[]>([]);
  const [trainingSessions, setTrainingSessions] = useState<TrainingDataEntry[]>([]);
  const [trainingEditing, setTrainingEditing] = useState(false);
  const [editingTrainingId, setEditingTrainingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Meal modal state
  const [showMealModal, setShowMealModal] = useState(false);
  const [pendingMealImage, setPendingMealImage] = useState<string | null>(null);
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

  // Training analysis state (for individual training view)
  const [selectedTraining, setSelectedTraining] = useState<TrainingDataEntry | null>(null);
  const [showTrainingAnalysisModal, setShowTrainingAnalysisModal] = useState(false);

  // Edit trainings mode (similar to edit meals)
  const [isEditingTrainings, setIsEditingTrainings] = useState(false);

  // Training form state
  const [trainingType, setTrainingType] = useState('');
  const [trainingDurationHours, setTrainingDurationHours] = useState(0);
  const [trainingDurationMinutes, setTrainingDurationMinutes] = useState(40);
  const [showTrainingDurationPicker, setShowTrainingDurationPicker] = useState(false);
  const [trainingGoal, setTrainingGoal] = useState('');
  const [trainingIntensity, setTrainingIntensity] = useState('');
  const [trainingComment, setTrainingComment] = useState('');
  const [trainingSkipped, setTrainingSkipped] = useState(false);

  // FitScore calculation state
  const [fitScoreResult, setFitScoreResult] = useState<FitScoreResponse | null>(null);
  const [calculatingFitScore, setCalculatingFitScore] = useState(false);
  const [showFitScoreResult, setShowFitScoreResult] = useState(false);

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
  const visibilityPollRef = useRef<ReturnType<typeof setInterval>>();
  const [showFormulaTooltip, setShowFormulaTooltip] = useState(false);
  const fitScoreFadeAnim = useRef(new Animated.Value(0)).current;

  const isToday = selectedDate.toDateString() === new Date().toDateString();
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

  // Load meals and training data when date changes
  useEffect(() => {
    loadDataForDate();
  }, [selectedDate]);

  const loadDataForDate = async () => {
    setLoading(true);
    try {
      const dateStr = formatDate(selectedDate);

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
    } catch (error) {
      console.error('Failed to load data:', error);
      Alert.alert('Error', 'Failed to load data for this date');
    } finally {
      setLoading(false);
    }
  };

  const formatDateDisplay = (date: Date) => {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return 'TODAY';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

      const result = await calculateFitScore(dateStr);

      console.log(`[FITSCORE] Result received: ${result.fitScore}/10`);
      setFitScoreResult(result);
      setShowFitScoreResult(true);

      // Trigger fade-in animation
      fitScoreFadeAnim.setValue(0);
      setTriangleAnimating(false);
      Animated.timing(fitScoreFadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();

      // Fetch coach summary in the background
      fetchCoachSummary(result);

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

  const fetchCoachSummary = async (fitScoreData: FitScoreResponse) => {
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
      });
      setCoachSummary(summary);
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
      setPendingMealImage(result.assets[0].uri);
      setSelectedMealType('');
      setMealNotes('');
      setShowMealModal(true);
    }
  };

  const getScoreColor = (score?: number): string => {
    if (!score) return colors.textSecondary;
    // Use rounded score for color to match displayed value
    const roundedScore = Math.round(score);
    if (roundedScore >= 7) return colors.success; // Green: 7-10
    if (roundedScore >= 4) return colors.warning; // Amber: 4-6.9
    return colors.danger; // Red: 1-3.9
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

    // Close modal immediately
    setShowMealModal(false);
    setAnalyzingMeal(true);

    // Create temporary placeholder meal
    const tempMeal: MealData = {
      id: -1, // Temporary ID
      mealType: selectedMealType,
      mealNotes: mealNotes || undefined,
      imageUri: pendingMealImage,
      date: formatDate(selectedDate),
      uploadedAt: new Date().toISOString(),
    };

    // Add placeholder to meals array
    setMeals([...meals, tempMeal]);

    try {
      const newMeal = await uploadMeal({
        imageUri: pendingMealImage,
        mealType: selectedMealType,
        mealNotes: mealNotes || undefined,
        date: formatDate(selectedDate),
        mealTime: mealTime.toTimeString().slice(0, 5), // HH:MM format
      });

      // Replace temporary meal with actual meal
      setMeals(currentMeals =>
        currentMeals.map(m => m.id === -1 ? newMeal : m)
      );

      setPendingMealImage(null);
      setSelectedMealType('');
      setMealNotes('');
      setEditingMealId(null);

      console.log('Meal uploaded successfully:', newMeal);
    } catch (error) {
      console.error('Failed to upload meal:', error);
      // Remove the temporary meal on error
      setMeals(currentMeals => currentMeals.filter(m => m.id !== -1));
      Alert.alert('Upload Failed', 'Failed to upload meal. Please try again.');
    } finally {
      setAnalyzingMeal(false);
    }
  };

  const handleDeleteMeal = (mealId: string) => {
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
          onPress: () => setMeals(meals.filter(m => m.id !== mealId)),
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
        // Update existing
        setLoading(true);
        savedTraining = await updateTrainingData(editId, params);
        setTrainingSessions(currentSessions =>
          currentSessions.map(t => t.id === editId ? savedTraining : t)
        );
        setLoading(false);
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

      {/* Meals Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Meals</Text>
          {hasMeals && isToday && (
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
            {isToday && (
              <Button
                onPress={handleAddMealPress}
                style={styles.addButton}
              >
                Add Today's Meals
              </Button>
            )}
          </View>
        ) : (
          <View style={styles.mealsGrid}>
            {meals.map((meal) => (
              <TouchableOpacity
                key={meal.id}
                style={[styles.mealCard, isEditingMeals && styles.mealCardEditing]}
                onPress={() => meal.id !== -1 && handleMealPress(meal)}
                disabled={meal.id === -1}
              >
                <Image source={{ uri: meal.imageUri }} style={styles.mealImage} />
                {meal.id === -1 && (
                  <View style={styles.analyzingOverlay}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.analyzingText}>Analyzing...</Text>
                  </View>
                )}
                {meal.id !== -1 && isEditingMeals && (
                  <View style={styles.editOverlay}>
                    <Ionicons name="create" size={32} color={colors.textPrimary} />
                  </View>
                )}
                {meal.id !== -1 && !isEditingMeals && meal.nutritionScore && (
                  <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(meal.nutritionScore) }]}>
                    <Text style={styles.scoreText}>{Math.round(meal.nutritionScore)}</Text>
                  </View>
                )}
                <View style={styles.mealOverlay}>
                  <Text style={styles.mealType}>{meal.mealType}</Text>
                  {meal.id !== -1 && !isEditingMeals && meal.analysis && (
                    <Text style={styles.tapHint}>✨ Tap to view</Text>
                  )}
                  {meal.id !== -1 && isEditingMeals && (
                    <Text style={styles.tapHint}>Tap to edit</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
            {isToday && (
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
      </View>

      {/* Training Section - Only shows after at least 1 meal */}
      {hasMeals && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Training</Text>
            {hasTraining && isToday && (
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
                    onPress={() => training.id !== -1 && handleTrainingPress(training)}
                    disabled={training.id === -1}
                  >
                    {training.id === -1 && (
                      <View style={styles.trainingAnalyzingOverlay}>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={styles.trainingAnalyzingText}>Analyzing...</Text>
                      </View>
                    )}
                    <View style={styles.trainingCardHeaderRow}>
                      <Text style={styles.trainingCardType} numberOfLines={1}>{training.type}</Text>
                      {training.id !== -1 && training.score && !isEditingTrainings && (
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
              {isToday && !trainingEditing && (
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
              {isToday && (
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
                onChangeText={setTrainingType}
                placeholder="e.g., Morning Run, Strength Training"
                placeholderTextColor={colors.textMuted}
              />

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
      {canCalculate && isToday && !showFitScoreResult && (
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
                    {Math.abs(fitScoreResult.whoopData.recoveryScore - fitScoreResult.yesterdayData.recoveryScore).toFixed(0)}% vs yesterday
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
                    {Math.abs(fitScoreResult.whoopData.sleepHours - fitScoreResult.yesterdayData.sleepHours).toFixed(1)}h vs yesterday
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
                    {Math.abs(fitScoreResult.whoopData.sleepScore - fitScoreResult.yesterdayData.sleepScore).toFixed(0)}% vs yesterday
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
                    {Math.abs(fitScoreResult.whoopData.hrv - fitScoreResult.yesterdayData.hrv).toFixed(0)} ms vs yesterday
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

          {/* All Green Celebration */}
          {fitScoreResult.allGreen && (
            <View style={styles.allGreenBanner}>
              <Text style={styles.allGreenText}>Perfect Day! All metrics in the green zone!</Text>
            </View>
          )}

          {/* FitCoach Preview */}
          <TouchableOpacity
            style={styles.coachPreviewCard}
            onPress={() => coachSummary?.slides && setShowCoachModal(true)}
            activeOpacity={coachSummary?.slides ? 0.7 : 1}
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
                <Text style={styles.coachPreviewCTA}>Tap to see detailed overview</Text>
              </>
            ) : (
              <Text style={styles.coachSummaryPlaceholder}>Coach analysis loading...</Text>
            )}
          </TouchableOpacity>

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
      {!canCalculate && isToday && (
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

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
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
                numberOfLines={4}
              />
            </ScrollView>

            {/* Log/Update Meal Button */}
            <View style={styles.modalFooter}>
              <Button onPress={handleLogMeal} style={styles.logMealButton}>
                <Ionicons name="checkmark-circle" size={20} color={colors.bgPrimary} style={{ marginRight: 8 }} />
                {editingMealId ? 'Update Meal' : 'Log Meal'}
              </Button>
            </View>
          </View>
        </View>
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
                        <Text style={styles.mealAnalysisScoreValue}>{Math.round(selectedMeal.nutritionScore)}</Text>
                        <Text style={styles.mealAnalysisScoreMax}>/10</Text>
                      </View>
                    </View>
                  )}

                  {selectedMeal.analysis && (
                    <View style={styles.mealAnalysisTextSection}>
                      <Text style={styles.mealAnalysisText}>{selectedMeal.analysis}</Text>
                    </View>
                  )}
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
                  {/* Score Badge */}
                  {selectedTraining.score && (
                    <View style={styles.trainingAnalysisScoreSection}>
                      <View
                        style={[
                          styles.trainingAnalysisScoreBadge,
                          { backgroundColor: getScoreColor(selectedTraining.score) },
                        ]}
                      >
                        <Text style={styles.trainingAnalysisScoreValue}>{Math.round(selectedTraining.score)}</Text>
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

                  {/* Training Details */}
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

                  {/* AI Analysis */}
                  {selectedTraining.analysis && (
                    <View style={styles.trainingAnalysisTextSection}>
                      <Text style={styles.trainingAnalysisText}>{selectedTraining.analysis}</Text>
                    </View>
                  )}

                  {/* Metrics Table */}
                  {selectedTraining.breakdown && (
                    <View style={styles.trainingMetricsTable}>
                      <Text style={styles.trainingMetricsTitle}>Score Breakdown</Text>
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
                      <View style={styles.trainingMetricRow}>
                        <Text style={styles.trainingMetricLabel}>Injury Safety</Text>
                        <Text style={styles.trainingMetricValue}>
                          {selectedTraining.breakdown.injurySafetyModifier.toFixed(1)}/1.0
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
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
  },
  mealAnalysisText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
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
    backgroundColor: colors.success + '20',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.success,
  },
  allGreenText: {
    ...typography.body,
    color: colors.success,
    fontWeight: '600',
    textAlign: 'center',
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
});
