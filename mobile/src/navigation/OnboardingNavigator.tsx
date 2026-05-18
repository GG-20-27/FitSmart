import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingWelcome from '../screens/onboarding/OnboardingWelcome';
import OnboardingEmailAuth from '../screens/onboarding/OnboardingEmailAuth';
import OnboardingQuestion from '../screens/onboarding/OnboardingQuestion';
import PhaseTransition from '../screens/onboarding/PhaseTransition';
import ForgotPasswordScreen from '../screens/onboarding/ForgotPasswordScreen';
import JoinTeamOnboarding from '../screens/onboarding/JoinTeamOnboarding';
import TeamSignupScreen from '../screens/onboarding/TeamSignupScreen';

export type OnboardingStackParamList = {
  OnboardingWelcome: undefined;
  OnboardingEmailAuth: { mode?: 'signin' | 'register'; joinTeam?: boolean } | undefined;
  OnboardingQuestion: undefined;
  PhaseTransition: { phase: string };
  ForgotPassword: undefined;
  JoinTeamOnboarding: undefined;
  TeamSignup: undefined;
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
      <Stack.Screen name="JoinTeamOnboarding" component={JoinTeamOnboarding} />
      <Stack.Screen name="TeamSignup" component={TeamSignupScreen} />
    </Stack.Navigator>
  );
}
