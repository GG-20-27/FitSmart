import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type OnboardingStackParamList = {
  OnboardingWelcome: undefined;
  OnboardingQuestion: undefined;
  PhaseTransition: { phase: string };
};

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'PhaseTransition'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'PhaseTransition'>;

export default function PhaseTransition() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { phase } = route.params;

  const getPhaseInfo = () => {
    switch (phase) {
      case 'phase_1_complete':
        return {
          emoji: '🎉',
          title: 'Phase 1 Complete!',
          message: 'Great job completing your baseline profile. We\'ll use this to personalize your experience.',
          nextAction: 'Continue to Dashboard'
        };
      case 'phase_2_complete':
        return {
          emoji: '🚀',
          title: 'Phase 2 Complete!',
          message: 'Your recovery and nutrition profile is set up. You\'re one step closer to optimizing your fitness.',
          nextAction: 'Continue to Dashboard'
        };
      case 'phase_3_complete':
      case 'complete':
        return {
          emoji: '✨',
          title: 'All Set!',
          message: 'Your FitScore AI is fully personalized. Let\'s start optimizing your performance!',
          nextAction: 'Go to Dashboard'
        };
      default:
        return {
          emoji: '✅',
          title: 'Progress Saved',
          message: 'Your answers have been saved. You can continue anytime.',
          nextAction: 'Continue'
        };
    }
  };

  const handleContinue = () => {
    if (phase === 'complete' || phase.includes('complete')) {
      // Phase complete - trigger app to refresh onboarding status
      console.log('[ONBOARDING] Phase complete - refreshing app state');
      if (global.refreshOnboardingStatus) {
        global.refreshOnboardingStatus();
      }
    } else {
      navigation.navigate('OnboardingQuestion');
    }
  };

  const info = getPhaseInfo();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.centerContent}>
          <Text style={styles.emoji}>{info.emoji}</Text>
          <Text style={styles.title}>{info.title}</Text>
          <Text style={styles.message}>{info.message}</Text>

          {phase === 'phase_1_complete' && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 Phase 2 will unlock in 7 days to fine-tune your recovery and nutrition settings.
              </Text>
            </View>
          )}

          {phase === 'phase_2_complete' && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 Phase 3 will unlock in 7 days to set up advanced optimization features.
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleContinue}>
          <Text style={styles.buttonText}>{info.nextAction}</Text>
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
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 100,
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 18,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  infoBox: {
    backgroundColor: '#f0f7ff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    marginTop: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#0066cc',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
});
