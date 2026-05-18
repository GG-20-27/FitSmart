import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getMyTeam } from '../../api/teams';
import { colors, spacing, radii, typography } from '../../theme';

export default function TeamLandingScreen() {
  const navigation = useNavigation<any>();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getMyTeam().then(({ team, member }) => {
      if (team && member) {
        navigation.replace('TeamMain', { teamId: team.id });
      }
    }).catch(() => {}).finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Team Competition</Text>
        <Text style={styles.subtitle}>
          Join your team to compete on weekly FitScore and give your coach visibility into your training.
        </Text>

        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('CreateTeam')}>
          <Text style={styles.primaryButtonText}>Create Team</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('JoinTeam')}>
          <Text style={styles.secondaryButtonText}>Join Team</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.bodyMuted,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    color: colors.bgPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: colors.bgSecondary,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
