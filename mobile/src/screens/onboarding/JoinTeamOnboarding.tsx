import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView, Alert,
} from 'react-native';
import { joinTeam } from '../../api/teams';
import { colors, spacing, radii, typography } from '../../theme';

export default function JoinTeamOnboarding() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const finish = () => {
    if (global.refreshOnboardingStatus) {
      global.refreshOnboardingStatus();
    }
  };

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      Alert.alert('Invalid code', 'Enter the 6-character code from your team owner.');
      return;
    }
    setLoading(true);
    try {
      await joinTeam(trimmed);
      finish();
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('404') || msg.includes('not found')) {
        Alert.alert('Code not found', 'Check the code and try again.');
      } else {
        Alert.alert('Error', msg || 'Failed to join team');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Join Your Team</Text>
        <Text style={styles.subtitle}>
          Enter the 6-character join code your coach shared with you.
        </Text>

        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="ABC123"
          placeholderTextColor={colors.surfaceMute}
          maxLength={6}
          autoCapitalize="characters"
          autoFocus
          keyboardType="default"
        />

        <TouchableOpacity
          style={[styles.primaryButton, code.trim().length !== 6 && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={loading || code.trim().length !== 6}
        >
          {loading
            ? <ActivityIndicator color={colors.bgPrimary} />
            : <Text style={styles.primaryButtonText}>Join Team</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={finish}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: 60 },
  title: { ...typography.h1, marginBottom: spacing.sm },
  subtitle: { ...typography.bodyMuted, marginBottom: spacing.xl, lineHeight: 22 },
  codeInput: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 18,
    color: colors.accent,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    marginBottom: spacing.xl,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  buttonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: colors.bgPrimary, fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.md },
  skipText: { color: colors.textMuted, fontSize: 14 },
});
