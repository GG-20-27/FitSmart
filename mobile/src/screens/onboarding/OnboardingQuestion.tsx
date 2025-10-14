import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
  TouchableWithoutFeedback
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getOnboardingStatus, submitAnswer, type OnboardingQuestion } from '../../api/onboarding';

type OnboardingStackParamList = {
  OnboardingWelcome: undefined;
  OnboardingQuestion: undefined;
  PhaseTransition: { phase: string };
};

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'OnboardingQuestion'>;

export default function OnboardingQuestionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [question, setQuestion] = useState<OnboardingQuestion | null>(null);
  const [answer, setAnswer] = useState<any>('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [jsonAnswer, setJsonAnswer] = useState<Record<string, number>>({});

  useEffect(() => {
    loadQuestion();
  }, []);

  const loadQuestion = async () => {
    try {
      setLoading(true);
      const status = await getOnboardingStatus();

      if (!status.nextQuestion) {
        // Onboarding complete or phase complete
        if (status.isPhaseComplete) {
          navigation.replace('PhaseTransition', { phase: status.currentPhase });
        }
        return;
      }

      setQuestion(status.nextQuestion);
      setProgress({
        current: status.answeredCount + 1,
        total: status.totalQuestions
      });

      // Reset answer for new question
      setAnswer('');
      setSelectedOptions([]);
      setJsonAnswer({});
    } catch (error) {
      console.error('[ONBOARDING] Failed to load question:', error);
      Alert.alert('Error', 'Failed to load question. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!question) return;

    // Validate required fields
    if (question.required && !answer && selectedOptions.length === 0 && Object.keys(jsonAnswer).length === 0) {
      Alert.alert('Required', 'This question is required');
      return;
    }

    try {
      setSubmitting(true);

      // Prepare answer based on question type
      let finalAnswer = answer;
      if (question.type === 'multiselect') {
        finalAnswer = selectedOptions;
      } else if (question.type === 'number') {
        finalAnswer = parseFloat(answer);
      } else if (question.type === 'scale') {
        finalAnswer = parseInt(answer);
      } else if (question.type === 'json') {
        finalAnswer = jsonAnswer;
      }

      const response = await submitAnswer(question.id, finalAnswer);

      if (response.phaseComplete) {
        navigation.replace('PhaseTransition', { phase: response.currentPhase });
      } else if (response.nextQuestion) {
        setQuestion(response.nextQuestion);
        setAnswer('');
        setSelectedOptions([]);
        setJsonAnswer({});
        setProgress({
          current: progress.current + 1,
          total: progress.total
        });
      }
    } catch (error) {
      console.error('[ONBOARDING] Failed to submit answer:', error);
      Alert.alert('Error', 'Failed to save answer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (!question?.required) {
      handleSubmit();
    }
  };

  const toggleMultiselect = (option: string) => {
    setSelectedOptions(prev =>
      prev.includes(option)
        ? prev.filter(o => o !== option)
        : [...prev, option]
    );
  };

  const renderInput = () => {
    if (!question) return null;

    switch (question.type) {
      case 'select':
        return (
          <View style={styles.optionsContainer}>
            {question.options?.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  answer === option && styles.optionButtonSelected
                ]}
                onPress={() => setAnswer(option)}
              >
                <Text style={[
                  styles.optionText,
                  answer === option && styles.optionTextSelected
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'multiselect':
        return (
          <View style={styles.optionsContainer}>
            {question.options?.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  selectedOptions.includes(option) && styles.optionButtonSelected
                ]}
                onPress={() => toggleMultiselect(option)}
              >
                <Text style={[
                  styles.optionText,
                  selectedOptions.includes(option) && styles.optionTextSelected
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'number':
        return (
          <TextInput
            style={styles.textInput}
            value={answer}
            onChangeText={setAnswer}
            placeholder="Enter a number"
            keyboardType="numeric"
            placeholderTextColor="#999"
          />
        );

      case 'scale':
        return (
          <View style={styles.scaleContainer}>
            <View style={styles.scaleButtons}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <TouchableOpacity
                  key={num}
                  style={[
                    styles.scaleButton,
                    answer === num.toString() && styles.scaleButtonSelected
                  ]}
                  onPress={() => setAnswer(num.toString())}
                >
                  <Text style={[
                    styles.scaleButtonText,
                    answer === num.toString() && styles.scaleButtonTextSelected
                  ]}>
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.scaleLabels}>
              <Text style={styles.scaleLabelText}>Low</Text>
              <Text style={styles.scaleLabelText}>High</Text>
            </View>
          </View>
        );

      case 'json':
        // For life stressors question - show multiple categories with scales
        const stressorCategories = ['Work', 'Personal Life', 'Health', 'Sports', 'Personal Projects', 'Studies'];
        return (
          <View style={styles.jsonContainer}>
            {stressorCategories.map((category) => (
              <View key={category} style={styles.jsonItemContainer}>
                <Text style={styles.jsonCategoryLabel}>{category}</Text>
                <View style={styles.scaleButtons}>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <TouchableOpacity
                      key={num}
                      style={[
                        styles.scaleButtonSmall,
                        jsonAnswer[category.toLowerCase().replace(/ /g, '_')] === num && styles.scaleButtonSelected
                      ]}
                      onPress={() => setJsonAnswer({ ...jsonAnswer, [category.toLowerCase().replace(/ /g, '_')]: num })}
                    >
                      <Text style={[
                        styles.scaleButtonTextSmall,
                        jsonAnswer[category.toLowerCase().replace(/ /g, '_')] === num && styles.scaleButtonTextSelected
                      ]}>
                        {num}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
            <View style={styles.scaleLabels}>
              <Text style={styles.scaleLabelText}>Not at all</Text>
              <Text style={styles.scaleLabelText}>Very much</Text>
            </View>
          </View>
        );

      case 'text':
      default:
        return (
          <TextInput
            style={[styles.textInput, styles.textInputMultiline]}
            value={answer}
            onChangeText={setAnswer}
            placeholder="Type your answer..."
            multiline
            numberOfLines={4}
            placeholderTextColor="#999"
          />
        );
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading question...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!question) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>No question available</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasAnswer = answer || selectedOptions.length > 0 || Object.keys(jsonAnswer).length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View>
            {/* Progress Bar */}
            <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(progress.current / progress.total) * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {progress.current} of {progress.total}
          </Text>
        </View>

        {/* Question */}
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>{question.question}</Text>
          {question.required && <Text style={styles.requiredText}>* Required</Text>}
        </View>

            {/* Input */}
            <View style={styles.inputContainer}>
              {renderInput()}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        {!question.required && (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={submitting}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.nextButton,
            !hasAnswer && styles.nextButtonDisabled,
            !question.required && styles.nextButtonHalf
          ]}
          onPress={handleSubmit}
          disabled={!hasAnswer || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.nextButtonText}>Next</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666666',
  },
  errorText: {
    fontSize: 16,
    color: '#ff3b30',
  },
  progressContainer: {
    marginBottom: 32,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  progressText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'right',
  },
  questionContainer: {
    marginBottom: 32,
  },
  questionText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    lineHeight: 32,
    marginBottom: 8,
  },
  requiredText: {
    fontSize: 14,
    color: '#ff3b30',
  },
  inputContainer: {
    marginBottom: 24,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1a1a1a',
    backgroundColor: '#f9f9f9',
  },
  textInputMultiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  optionsContainer: {
    gap: 12,
  },
  optionButton: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  optionButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f7ff',
  },
  optionText: {
    fontSize: 16,
    color: '#333333',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#007AFF',
  },
  scaleContainer: {
    gap: 12,
  },
  scaleButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scaleButton: {
    width: 50,
    height: 50,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  scaleButtonSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  scaleButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333333',
  },
  scaleButtonTextSelected: {
    color: '#ffffff',
  },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleLabelText: {
    fontSize: 14,
    color: '#666666',
  },
  jsonContainer: {
    gap: 20,
  },
  jsonItemContainer: {
    gap: 8,
  },
  jsonCategoryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  scaleButtonSmall: {
    width: 36,
    height: 36,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  scaleButtonTextSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
  },
  footer: {
    flexDirection: 'row',
    padding: 24,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  skipButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  skipButtonText: {
    color: '#666666',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButtonHalf: {
    flex: 1,
  },
  nextButtonDisabled: {
    backgroundColor: '#cccccc',
  },
  nextButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
