import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingWelcome from '../screens/onboarding/OnboardingWelcome';
import OnboardingQuestion from '../screens/onboarding/OnboardingQuestion';
import PhaseTransition from '../screens/onboarding/PhaseTransition';

export type OnboardingStackParamList = {
  OnboardingWelcome: undefined;
  OnboardingQuestion: undefined;
  PhaseTransition: { phase: string };
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="OnboardingWelcome" component={OnboardingWelcome} />
      <Stack.Screen name="OnboardingQuestion" component={OnboardingQuestion} />
      <Stack.Screen name="PhaseTransition" component={PhaseTransition} />
    </Stack.Navigator>
  );
}
