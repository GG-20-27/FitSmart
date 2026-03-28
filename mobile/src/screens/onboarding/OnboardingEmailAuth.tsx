import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../../theme';
import { API_BASE_URL, setAuthToken } from '../../api/client';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList>;
type RoutePropType = RouteProp<OnboardingStackParamList, 'OnboardingEmailAuth'>;

export default function OnboardingEmailAuth() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const [mode, setMode] = useState<'signin' | 'register'>(route.params?.mode ?? 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    if (mode === 'register' && trimmedPassword.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }

    try {
      setIsLoading(true);
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
      });

      // Parse response safely — server may return HTML if route doesn't exist yet
      let data: any = {};
      try {
        data = await response.json();
      } catch {
        console.error('[EMAIL AUTH] Non-JSON response — is the server running with latest code?');
        Alert.alert('Server error', 'The server returned an unexpected response. Make sure the server is up to date and running.');
        return;
      }

      if (!response.ok) {
        Alert.alert('Error', data.error || 'Something went wrong. Please try again.');
        return;
      }

      await setAuthToken(data.token);
      console.log(`[EMAIL AUTH] ${mode === 'register' ? 'Registered' : 'Signed in'}: ${data.userId}`);

      if (global.refreshOnboardingStatus) {
        global.refreshOnboardingStatus();
      }
    } catch (error) {
      console.error('[EMAIL AUTH] Error:', error);
      Alert.alert('Connection error', 'Could not reach the server. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.textMuted} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="mail-outline" size={40} color={colors.accent} style={{ marginBottom: spacing.md }} />
            <Text style={styles.title}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'signin'
                ? 'Welcome back. Enter your details below.'
                : 'No wearable needed. Just you and your data.'}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[styles.input, { paddingRight: 48 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  textContentType={mode === 'register' ? 'newPassword' : 'password'}
                />
                <TouchableOpacity
                  style={styles.showPasswordBtn}
                  onPress={() => setShowPassword(v => !v)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.bgPrimary} />
              ) : (
                <Text style={styles.submitBtnText}>
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Forgot password — only in signin mode */}
          {mode === 'signin' && (
            <TouchableOpacity
              style={styles.forgotRow}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {/* Toggle mode */}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleText}>
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            </Text>
            <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'register' : 'signin')}>
              <Text style={styles.toggleLink}>
                {mode === 'signin' ? 'Create one' : 'Sign in'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingTop: spacing.lg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  backText: {
    ...typography.body,
    color: colors.textMuted,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  title: {
    ...typography.h1,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    fontSize: 14,
  },
  input: {
    backgroundColor: colors.surfaceMute + '40',
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
    marginBottom: 0,
  },
  passwordWrapper: {
    position: 'relative',
  },
  showPasswordBtn: {
    position: 'absolute',
    right: spacing.sm,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    ...typography.title,
    color: colors.bgPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  forgotRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  forgotText: {
    ...typography.body,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 14,
  },
  toggleLink: {
    ...typography.body,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});
