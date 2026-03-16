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
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../../theme';
import { API_BASE_URL } from '../../api/client';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type ResetPasswordRouteProp = RouteProp<OnboardingStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen() {
  const navigation = useNavigation();
  const route = useRoute<ResetPasswordRouteProp>();
  const { token } = route.params;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (password.length < 8) {
      Alert.alert('Too short', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ token, newPassword: password }),
      });

      let data: any = {};
      try { data = await response.json(); } catch {}

      if (!response.ok) {
        Alert.alert('Error', data.error || 'Reset failed. The link may have expired.');
        return;
      }

      setDone(true);
    } catch (error) {
      Alert.alert('Connection error', 'Could not reach the server.');
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
          <View style={styles.header}>
            <Ionicons
              name={done ? 'checkmark-circle-outline' : 'lock-open-outline'}
              size={40}
              color={colors.accent}
              style={{ marginBottom: spacing.md }}
            />
            <Text style={styles.title}>
              {done ? 'Password updated' : 'New password'}
            </Text>
            <Text style={styles.subtitle}>
              {done
                ? 'Your password has been changed. You can now sign in.'
                : 'Choose a new password for your account.'}
            </Text>
          </View>

          {!done && (
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>New password</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={[styles.input, { paddingRight: 48 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
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

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm password</Text>
                <TextInput
                  style={styles.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Repeat your password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
                onPress={handleReset}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.bgPrimary} />
                ) : (
                  <Text style={styles.submitBtnText}>Update password</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {done && (
            <TouchableOpacity
              style={styles.signInBtn}
              onPress={() => navigation.navigate('OnboardingEmailAuth' as never)}
            >
              <Text style={styles.signInBtnText}>Sign in</Text>
            </TouchableOpacity>
          )}
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
    paddingTop: spacing.xxl,
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
    paddingHorizontal: spacing.md,
  },
  form: {
    gap: spacing.lg,
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
    paddingVertical: spacing.md,
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
  signInBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  signInBtnText: {
    ...typography.title,
    color: colors.bgPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
});
