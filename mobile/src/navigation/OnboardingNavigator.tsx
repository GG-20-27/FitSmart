import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingWelcome from '../screens/onboarding/OnboardingWelcome';
import OnboardingEmailAuth from '../screens/onboarding/OnboardingEmailAuth';
import OnboardingQuestion from '../screens/onboarding/OnboardingQuestion';
import PhaseTransition from '../screens/onboarding/PhaseTransition';
import ForgotPasswordScreen from '../screens/onboarding/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/onboarding/ResetPasswordScreen';

export type OnboardingStackParamList = {
  OnboardingWelcome: undefined;
  OnboardingEmailAuth: undefined;
  OnboardingQuestion: undefined;
  PhaseTransition: { phase: string };
  ForgotPassword: undefined;
  ResetPassword: { token: string };
};

interface Props {
  resetToken?: string | null;
  onResetTokenConsumed?: () => void;
}

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingNavigator({ resetToken, onResetTokenConsumed }: Props) {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={resetToken ? 'ResetPassword' : 'OnboardingWelcome'}
    >
      <Stack.Screen name="OnboardingWelcome" component={OnboardingWelcome} />
      <Stack.Screen name="OnboardingEmailAuth" component={OnboardingEmailAuth} />
      <Stack.Screen name="OnboardingQuestion" component={OnboardingQuestion} />
      <Stack.Screen name="PhaseTransition" component={PhaseTransition} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        initialParams={resetToken ? { token: resetToken } : undefined}
      />
    </Stack.Navigator>
  );
}
