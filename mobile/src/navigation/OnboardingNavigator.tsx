import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingWelcome from '../screens/onboarding/OnboardingWelcome';
import OnboardingEmailAuth from '../screens/onboarding/OnboardingEmailAuth';
import OnboardingQuestion from '../screens/onboarding/OnboardingQuestion';
import PhaseTransition from '../screens/onboarding/PhaseTransition';
import ForgotPasswordScreen from '../screens/onboarding/ForgotPasswordScreen';

export type OnboardingStackParamList = {
  OnboardingWelcome: undefined;
  OnboardingEmailAuth: { mode?: 'signin' | 'register' } | undefined;
  OnboardingQuestion: undefined;
  PhaseTransition: { phase: string };
  ForgotPassword: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="OnboardingWelcome">
      <Stack.Screen name="OnboardingWelcome" component={OnboardingWelcome} />
      <Stack.Screen name="OnboardingEmailAuth" component={OnboardingEmailAuth} />
      <Stack.Screen name="OnboardingQuestion" component={OnboardingQuestion} />
      <Stack.Screen name="PhaseTransition" component={PhaseTransition} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}
