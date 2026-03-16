import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../../theme';
import { API_BASE_URL } from '../../api/client';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);

  const sendResetEmail = async (trimmed: string) => {
    try {
      setIsLoading(true);
      await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ email: trimmed }),
      });
      // Always show confirmation — don't leak whether the email exists
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => sendResetEmail(email.trim().toLowerCase());

  const handleResend = async () => {
    setResendCooldown(true);
    await sendResetEmail(email.trim().toLowerCase());
    // Keep cooldown for 30s to prevent spam
    setTimeout(() => setResendCooldown(false), 30000);
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
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.textMuted} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Ionicons
              name={sent ? 'checkmark-circle-outline' : 'key-outline'}
              size={40}
              color={colors.accent}
              style={{ marginBottom: spacing.md }}
            />
            <Text style={styles.title}>
              {sent ? 'Check your email' : 'Forgot password?'}
            </Text>
            <Text style={styles.subtitle}>
              {sent
                ? `We sent a reset link to ${email.trim()}. Tap it to set a new password.`
                : "Enter your email and we'll send you a reset link."}
            </Text>
          </View>

          {!sent && (
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

              <TouchableOpacity
                style={[styles.submitBtn, (!email.trim() || isLoading) && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!email.trim() || isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.bgPrimary} />
                ) : (
                  <Text style={styles.submitBtnText}>Send reset link</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {sent && (
            <View style={styles.sentActions}>
              <TouchableOpacity
                style={[styles.resendBtn, resendCooldown && styles.resendBtnDisabled]}
                onPress={handleResend}
                disabled={resendCooldown || isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.bgPrimary} size="small" />
                ) : (
                  <Text style={styles.resendBtnText}>
                    {resendCooldown ? 'Email sent' : 'Send again'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backToSignIn}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.backToSignInText}>Back to sign in</Text>
              </TouchableOpacity>
            </View>
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
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    ...typography.title,
    color: colors.bgPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  sentActions: {
    gap: spacing.sm,
  },
  resendBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  resendBtnDisabled: {
    opacity: 0.5,
  },
  resendBtnText: {
    ...typography.title,
    color: colors.bgPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  backToSignIn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  backToSignInText: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 14,
  },
});
