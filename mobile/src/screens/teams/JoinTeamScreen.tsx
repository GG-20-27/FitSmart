import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { joinTeam } from '../../api/teams';
import { colors, spacing, radii, typography } from '../../theme';

export default function JoinTeamScreen() {
  const navigation = useNavigation<any>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      Alert.alert('Invalid code', 'Enter the 6-character code from your team owner.');
      return;
    }
    setLoading(true);
    try {
      const { team } = await joinTeam(trimmed);
      (global as any).refreshTeamStatus?.();
      navigation.replace('TeamMain', { teamId: team.id });
    } catch (err: any) {
      const msg = err.message || 'Failed to join team';
      if (msg.includes('409') || msg.includes('Already')) {
        Alert.alert('Already on a team', 'You are already a member of a team.');
      } else if (msg.includes('404') || msg.includes('not found')) {
        Alert.alert('Code not found', 'Check the code and try again.');
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Join Team</Text>
        <Text style={styles.subtitle}>Enter the 6-character code your team owner shared with you.</Text>

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
          {loading ? <ActivityIndicator color={colors.bgPrimary} /> : <Text style={styles.primaryButtonText}>Join Team</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  backBtn: { marginBottom: spacing.lg },
  backText: { color: colors.accent, fontSize: 16 },
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
  },
  buttonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: colors.bgPrimary, fontSize: 16, fontWeight: '700' },
});
