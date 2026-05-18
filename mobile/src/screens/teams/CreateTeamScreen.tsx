import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView, ScrollView, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createTeam } from '../../api/teams';
import { colors, spacing, radii, typography } from '../../theme';
import { API_BASE_URL } from '../../api/client';

const SPORTS = ['Floorball', 'Football', 'Basketball', 'Hockey', 'Other'];

export default function CreateTeamScreen() {
  const navigation = useNavigation<any>();
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ joinCode: string; coachToken: string; teamId: number } | null>(null);

  const coachUrl = created
    ? `${API_BASE_URL.replace('/api', '')}/coach?token=${created.coachToken}`
    : '';

  const handleCreate = async () => {
    if (!name.trim() || !sport) {
      Alert.alert('Missing fields', 'Please enter a team name and select a sport.');
      return;
    }
    setLoading(true);
    try {
      const { team, joinCode, coachToken } = await createTeam(name.trim(), sport);
      setCreated({ joinCode, coachToken, teamId: team.id });
      (global as any).refreshTeamStatus?.();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Team Created!</Text>

          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Player Join Code</Text>
            <Text style={styles.codeValue}>{created.joinCode}</Text>
            <Text style={styles.codeHint}>Share this with your teammates</Text>
          </View>

          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Coach Access URL</Text>
            <Text style={styles.coachUrl} selectable>{coachUrl}</Text>
            <Text style={styles.codeHint}>Share this link with your coach</Text>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.replace('TeamMain', { teamId: created.teamId })}
          >
            <Text style={styles.primaryButtonText}>Go to Team</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create Team</Text>

        <Text style={styles.label}>Team Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Zurich Floorball Academy"
          placeholderTextColor={colors.surfaceMute}
          autoFocus
        />

        <Text style={styles.label}>Sport</Text>
        <View style={styles.sportGrid}>
          {SPORTS.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.sportChip, sport === s && styles.sportChipActive]}
              onPress={() => setSport(s)}
            >
              <Text style={[styles.sportChipText, sport === s && styles.sportChipTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, (!name.trim() || !sport) && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={loading || !name.trim() || !sport}
        >
          {loading ? <ActivityIndicator color={colors.bgPrimary} /> : <Text style={styles.primaryButtonText}>Create Team</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 60 },
  backBtn: { marginBottom: spacing.lg },
  backText: { color: colors.accent, fontSize: 16 },
  title: { ...typography.h1, marginBottom: spacing.lg },
  label: { ...typography.bodyMuted, marginBottom: spacing.sm, marginTop: spacing.md },
  input: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  sportChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    backgroundColor: colors.bgSecondary,
  },
  sportChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sportChipText: { color: colors.textMuted, fontWeight: '500' },
  sportChipTextActive: { color: colors.bgPrimary, fontWeight: '700' },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonDisabled: { opacity: 0.4 },
  primaryButtonText: { color: colors.bgPrimary, fontSize: 16, fontWeight: '700' },
  codeCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  codeLabel: { ...typography.small, marginBottom: spacing.xs },
  codeValue: { fontSize: 32, fontWeight: '800', color: colors.accent, letterSpacing: 4, marginBottom: spacing.xs },
  coachUrl: { ...typography.small, color: colors.accent, marginBottom: spacing.xs },
  codeHint: { ...typography.small, color: colors.textMuted },
});
