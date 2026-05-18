import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../../theme';
import { API_BASE_URL, setAuthToken, apiRequest } from '../../api/client';
import { joinTeam } from '../../api/teams';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList>;

export default function TeamSignupScreen() {
  const navigation = useNavigation<NavigationProp>();

  // shared fields
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');

  // manual-only fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [whoopAuthed, setWhoopAuthed] = useState(false);
  const [whoopLoading, setWhoopLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmitManual = joinCode.trim().length === 6 && displayName.trim().length > 0
    && email.trim().length > 0 && password.length >= 8;
  const canSubmitWhoop = whoopAuthed && joinCode.trim().length === 6 && displayName.trim().length > 0;
  const canSubmit = whoopAuthed ? canSubmitWhoop : canSubmitManual;

  // ── WHOOP OAuth ────────────────────────────────────────────────────────────

  const handleConnectWhoop = async () => {
    setWhoopLoading(true);
    try {
      const authUrl = `${API_BASE_URL.replace(/\/$/, '')}/api/whoop/login`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, 'fitsmart://auth');
      if (result.type === 'success' && result.url?.includes('token=')) {
        const token = result.url.match(/token=([^&]+)/)?.[1];
        if (token) {
          await setAuthToken(token);
          setWhoopAuthed(true);
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to connect with WHOOP');
    } finally {
      setWhoopLoading(false);
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleJoin = async () => {
    const trimmedCode = joinCode.trim().toUpperCase();
    const trimmedName = displayName.trim();

    setLoading(true);
    try {
      if (!whoopAuthed) {
        // Create manual account
        const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            displayName: trimmedName,
          }),
        });
        let data: any = {};
        try { data = await res.json(); } catch {}
        if (!res.ok) {
          Alert.alert('Sign-up failed', data.error || 'Could not create account.');
          return;
        }
        await setAuthToken(data.token);
      } else {
        // WHOOP user — update display name (non-fatal if it fails)
        await apiRequest('/api/auth/me', {
          method: 'PATCH',
          body: JSON.stringify({ displayName: trimmedName }),
        }).catch(() => {});
      }

      // Join the team
      try {
        await joinTeam(trimmedCode);
      } catch (err: any) {
        const msg = err.message || '';
        if (msg.includes('404') || msg.includes('not found')) {
          Alert.alert('Code not found', 'Account created but the team code was not recognised. You can join from the Teams tab later.');
        } else {
          Alert.alert('Could not join team', 'Account created. You can join from the Teams tab later.');
        }
      }

      if (global.refreshOnboardingStatus) {
        global.refreshOnboardingStatus();
      }
    } catch {
      Alert.alert('Connection error', 'Could not reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.textMuted} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Ionicons name="people-outline" size={40} color={colors.accent} style={{ marginBottom: spacing.md }} />
            <Text style={styles.title}>Join Your Team</Text>
            <Text style={styles.subtitle}>
              {whoopAuthed
                ? 'WHOOP connected. Enter your team code and name.'
                : 'Enter your team code and create an account to start logging.'}
            </Text>
          </View>

          {/* WHOOP option — only before auth */}
          {!whoopAuthed && (
            <>
              <TouchableOpacity
                style={[styles.whoopBtn, whoopLoading && styles.btnDisabled]}
                onPress={handleConnectWhoop}
                disabled={whoopLoading}
              >
                {whoopLoading
                  ? <ActivityIndicator color={colors.bgPrimary} />
                  : <Ionicons name="heart-outline" size={20} color={colors.bgPrimary} />}
                <Text style={styles.whoopBtnText}>
                  {whoopLoading ? 'Connecting…' : 'Join with WHOOP'}
                </Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or join with email</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}

          {/* Team code — first and prominent */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Team Code</Text>
            <TextInput
              style={styles.codeInput}
              value={joinCode}
              onChangeText={t => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="ABC123"
              placeholderTextColor={colors.surfaceMute}
              maxLength={6}
              autoCapitalize="characters"
              autoFocus={whoopAuthed}
              keyboardType="default"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Shown on the team leaderboard"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          {/* Email + password — only for manual path */}
          {!whoopAuthed && (
            <>
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionNote}>Create an account so you can log back in</Text>

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
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                  />
                  <TouchableOpacity style={styles.showPasswordBtn} onPress={() => setShowPassword(v => !v)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, (!canSubmit || loading) && styles.btnDisabled]}
            onPress={handleJoin}
            disabled={!canSubmit || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={colors.bgPrimary} />
              : <Text style={styles.submitBtnText}>Join Team</Text>}
          </TouchableOpacity>

          <View style={styles.signinRow}>
            <Text style={styles.signinText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('OnboardingEmailAuth', { mode: 'signin', joinTeam: true })}>
              <Text style={styles.signinLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: 60 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xl },
  backText: { ...typography.body, color: colors.textMuted },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  title: { ...typography.h1, fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  whoopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  whoopBtnText: { ...typography.title, color: colors.bgPrimary, fontSize: 17 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.surfaceMute },
  dividerText: { ...typography.small, color: colors.textMuted },
  inputGroup: { marginBottom: spacing.lg },
  label: { ...typography.body, fontWeight: '600', fontSize: 14, marginBottom: spacing.xs },
  codeInput: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    color: colors.accent,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceMute,
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
  passwordWrapper: { position: 'relative' },
  showPasswordBtn: {
    position: 'absolute',
    right: spacing.sm,
    top: 0, bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  sectionDivider: { height: 1, backgroundColor: colors.surfaceMute, marginVertical: spacing.lg },
  sectionNote: { ...typography.small, color: colors.textMuted, marginBottom: spacing.md },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  btnDisabled: { opacity: 0.4 },
  submitBtnText: { ...typography.title, color: colors.bgPrimary, fontSize: 17, fontWeight: '600' },
  signinRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signinText: { ...typography.body, color: colors.textMuted, fontSize: 14 },
  signinLink: { ...typography.body, color: colors.accent, fontSize: 14, fontWeight: '600' },
});
