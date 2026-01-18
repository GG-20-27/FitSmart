import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, typography, radii } from '../theme';
import { Button } from '../ui/components';
import {
  uploadMeal,
  getMealsByDate,
  saveTrainingData,
  getTrainingDataByDate,
  updateTrainingData,
  deleteTrainingData as deleteTrainingDataAPI,
  formatDate,
  type MealData,
  type TrainingDataEntry,
} from '../api/fitscore';

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

  // Training form state
  const [trainingType, setTrainingType] = useState('');
  const [trainingDuration, setTrainingDuration] = useState('');
  const [trainingGoal, setTrainingGoal] = useState('');
  const [trainingIntensity, setTrainingIntensity] = useState('');
  const [trainingComment, setTrainingComment] = useState('');
  const [trainingSkipped, setTrainingSkipped] = useState(false);

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const hasMeals = meals.length > 0;
  const hasTraining = trainingSessions.length > 0;
  const canCalculate = hasMeals && hasTraining;

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

  const handleCalculateFitScore = () => {
    // TODO: Implement FitScore calculation flow
    console.log('Calculate FitScore triggered');
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

  const handleLogMeal = async () => {
    if (!selectedMealType) {
      Alert.alert('Missing Information', 'Please select a meal type.');
      return;
    }

    if (!pendingMealImage) {
      Alert.alert('Missing Information', 'No meal image selected.');
      return;
    }

    setLoading(true);
    try {
      const newMeal = await uploadMeal({
        imageUri: pendingMealImage,
        mealType: selectedMealType,
        mealNotes: mealNotes || undefined,
        date: formatDate(selectedDate),
      });

      setMeals([...meals, newMeal]);
      setPendingMealImage(null);
      setSelectedMealType('');
      setMealNotes('');
      setShowMealModal(false);

      console.log('Meal uploaded successfully:', newMeal);
    } catch (error) {
      console.error('Failed to upload meal:', error);
      Alert.alert('Upload Failed', 'Failed to upload meal. Please try again.');
    } finally {
      setLoading(false);
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

    setLoading(true);
    try {
      const params = {
        type: trainingType,
        duration: parseInt(trainingDuration) || 0,
        goal: trainingGoal || undefined,
        intensity: trainingIntensity || undefined,
        comment: trainingComment || undefined,
        skipped: trainingSkipped,
      };

      let savedTraining: TrainingDataEntry;

      if (editingTrainingId) {
        // Update existing
        savedTraining = await updateTrainingData(editingTrainingId, params);
        setTrainingSessions(trainingSessions.map(t => t.id === editingTrainingId ? savedTraining : t));
      } else {
        // Add new
        savedTraining = await saveTrainingData({
          ...params,
          date: formatDate(selectedDate),
        });
        setTrainingSessions([...trainingSessions, savedTraining]);
      }

      // Reset form
      setTrainingType('');
      setTrainingDuration('');
      setTrainingGoal('');
      setTrainingIntensity('');
      setTrainingComment('');
      setTrainingSkipped(false);
      setTrainingEditing(false);
      setEditingTrainingId(null);

      console.log('Training saved successfully:', savedTraining);
    } catch (error) {
      console.error('Failed to save training:', error);
      Alert.alert('Save Failed', 'Failed to save training data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditTraining = (training: TrainingDataEntry) => {
    setTrainingType(training.type);
    setTrainingDuration(training.duration.toString());
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
    <ScrollView style={styles.container}>
      {/* Loading Indicator */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
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
        <Text style={styles.sectionTitle}>Meals</Text>

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
                style={styles.mealCard}
                onLongPress={() => isToday && handleDeleteMeal(meal.id)}
              >
                <Image source={{ uri: meal.imageUri }} style={styles.mealImage} />
                <View style={styles.mealOverlay}>
                  <Text style={styles.mealType}>{meal.type}</Text>
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
          <Text style={styles.sectionTitle}>Training</Text>

          {/* Autofill from Calendar Button */}
          {isToday && trainingSessions.length === 0 && !trainingEditing && (
            <TouchableOpacity
              style={styles.calendarButton}
              onPress={handleAutofillFromCalendar}
            >
              <Ionicons name="calendar" size={20} color={colors.accent} />
              <Text style={styles.calendarButtonText}>Autofill from Calendar</Text>
            </TouchableOpacity>
          )}

          {/* Show existing training sessions */}
          {trainingSessions.map((training) => {
            const getIntensityEmoji = (intensity: string) => {
              if (intensity === 'Low') return '💙';
              if (intensity === 'Moderate') return '🟡';
              return '🔥';
            };

            return (
              <View key={training.id} style={styles.trainingCard}>
                <View style={styles.trainingHeader}>
                  <Ionicons name="barbell" size={24} color={colors.accent} />
                  <Text style={styles.trainingType}>{training.type}</Text>
                </View>
                <View style={styles.trainingDetails}>
                  <Text style={styles.trainingDetailText}>⏱️ {training.duration} min</Text>
                  <Text style={styles.trainingDetailText}>{getIntensityEmoji(training.intensity)} {training.intensity} intensity</Text>
                </View>
                {isToday && (
                  <View style={styles.trainingActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleEditTraining(training)}
                    >
                      <Ionicons name="pencil" size={16} color={colors.accent} />
                      <Text style={styles.editLink}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDeleteTraining(training.id)}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      <Text style={styles.deleteLink}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {!hasTraining && !trainingEditing ? (
            <View style={styles.emptyState}>
              <Ionicons name="barbell-outline" size={48} color={colors.surfaceMute} />
              <Text style={styles.emptyStateText}>Add training context</Text>
              {isToday && (
                <Button
                  onPress={() => setTrainingEditing(true)}
                  style={styles.addButton}
                >
                  Add Training Details
                </Button>
              )}
            </View>
          ) : trainingEditing ? (
            <View style={styles.trainingForm}>
              <Text style={styles.formLabel}>Training Type</Text>
              <TextInput
                style={styles.textInput}
                value={trainingType}
                onChangeText={setTrainingType}
                placeholder="e.g., Morning Run, Strength Training"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.formLabel, styles.formLabelSpaced]}>Duration (minutes)</Text>
              <TextInput
                style={styles.textInput}
                value={trainingDuration}
                onChangeText={setTrainingDuration}
                placeholder="e.g., 45"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />

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

              <Button
                onPress={handleSaveTraining}
                variant="secondary"
                style={styles.saveButton}
              >
                {editingTrainingId ? 'Update Training' : 'Save Training Data'}
              </Button>
              {editingTrainingId && (
                <Button
                  onPress={() => {
                    setTrainingEditing(false);
                    setEditingTrainingId(null);
                    setTrainingType('');
                    setTrainingDuration('');
                    setTrainingGoal('');
                    setTrainingIntensity('');
                    setTrainingComment('');
                  }}
                  variant="ghost"
                  style={styles.cancelButton}
                >
                  Cancel
                </Button>
              )}
            </View>
          ) : null}

          {/* Add Another Training Button */}
          {isToday && hasTraining && !trainingEditing && (
            <TouchableOpacity
              style={styles.addAnotherButton}
              onPress={() => setTrainingEditing(true)}
            >
              <Ionicons name="add-circle-outline" size={24} color={colors.accent} />
              <Text style={styles.addAnotherText}>Add Another Training</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Calculate FitScore Button */}
      {canCalculate && isToday && (
        <View style={styles.calculateSection}>
          <Button
            onPress={handleCalculateFitScore}
            style={styles.calculateButton}
          >
            Calculate My FitScore
          </Button>
        </View>
      )}

      {/* Info text when conditions not met */}
      {!canCalculate && isToday && (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
          <Text style={styles.infoText}>
            {!hasMeals
              ? 'Add at least one meal to continue'
              : 'Add training details to calculate your FitScore'}
          </Text>
        </View>
      )}

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
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Add Meal Details</Text>
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

            {/* Log Meal Button */}
            <View style={styles.modalFooter}>
              <Button onPress={handleLogMeal} style={styles.logMealButton}>
                <Ionicons name="checkmark-circle" size={20} color={colors.bgPrimary} style={{ marginRight: 8 }} />
                Log Meal
              </Button>
            </View>
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
  sectionTitle: {
    ...typography.title,
    marginBottom: spacing.md,
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
  mealImage: {
    width: '100%',
    height: '100%',
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
