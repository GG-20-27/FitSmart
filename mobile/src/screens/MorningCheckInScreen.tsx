import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../theme';
import { apiRequest } from '../api/client';

interface Props {
  onComplete: () => void;
  isEdit?: boolean;
  initialValues?: {
    recovery: number;
    energy: number;
    sleepHours: number;
    sleepQuality: 'poor' | 'ok' | 'great';
  };
}

type SleepQuality = 'poor' | 'ok' | 'great';

export default function MorningCheckInScreen({ onComplete, isEdit = false, initialValues }: Props) {
  const [recovery, setRecovery] = useState(initialValues?.recovery ?? 5);
  const [energy, setEnergy] = useState(initialValues?.energy ?? 5);
  const [sleepHours, setSleepHours] = useState(initialValues?.sleepHours ?? 7);
  const [sleepQuality, setSleepQuality] = useState<SleepQuality>(initialValues?.sleepQuality ?? 'ok');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      await apiRequest('/api/checkin', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify({ recovery, energy, sleepHours, sleepQuality }),
      });
      setSuccess(true);
      setTimeout(() => onComplete(), 1500);
    } catch (e: any) {
      if (e?.message?.includes('409') || e?.message?.includes('already submitted')) {
        onComplete();
        return;
      }
      console.error('[CHECKIN] Submit error:', e);
      onComplete();
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={64} color={colors.accent} />
          <Text style={styles.successTitle}>{isEdit ? 'Recovery Updated' : 'Morning Check-In Complete'}</Text>
          <Text style={styles.successSubtitle}>{isEdit ? 'Your inputs have been saved.' : 'Have a great day!'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            {isEdit && (
              <TouchableOpacity onPress={onComplete} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            <Ionicons name={isEdit ? 'pencil-outline' : 'sunny-outline'} size={36} color={colors.accent} style={{ marginBottom: spacing.sm }} />
            <Text style={styles.title}>{isEdit ? 'Edit Check-In' : 'Morning Check-In'}</Text>
            <Text style={styles.subtitle}>{isEdit ? 'Update your recovery inputs for today.' : 'How are you feeling today?'}</Text>
          </View>

          {/* Recovery */}
          <View style={styles.section}>
            <Text style={styles.label}>Recovery</Text>
            <Text style={styles.labelHint}>How recovered do you feel today?</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setRecovery(v => Math.max(1, v - 1))}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.stepValue}>
                <Text style={styles.stepValueText}>{recovery}</Text>
                <Text style={styles.stepValueSub}>/ 10</Text>
              </View>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setRecovery(v => Math.min(10, v + 1))}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.scaleBar}>
              {Array.from({ length: 10 }, (_, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.scaleDot, recovery > i && styles.scaleDotActive]}
                  onPress={() => setRecovery(i + 1)}
                />
              ))}
            </View>
            <View style={styles.scaleLabels}>
              <Text style={styles.scaleLabelLeft}>Low</Text>
              <Text style={styles.scaleLabelRight}>High</Text>
            </View>
          </View>

          {/* Energy */}
          <View style={styles.section}>
            <Text style={styles.label}>Energy</Text>
            <Text style={styles.labelHint}>How much energy do you have today?</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setEnergy(v => Math.max(1, v - 1))}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.stepValue}>
                <Text style={styles.stepValueText}>{energy}</Text>
                <Text style={styles.stepValueSub}>/ 10</Text>
              </View>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setEnergy(v => Math.min(10, v + 1))}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.scaleBar}>
              {Array.from({ length: 10 }, (_, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.scaleDot, energy > i && styles.scaleDotActive]}
                  onPress={() => setEnergy(i + 1)}
                />
              ))}
            </View>
            <View style={styles.scaleLabels}>
              <Text style={styles.scaleLabelLeft}>Low</Text>
              <Text style={styles.scaleLabelRight}>High</Text>
            </View>
          </View>

          {/* Sleep Hours */}
          <View style={styles.section}>
            <Text style={styles.label}>Sleep</Text>
            <Text style={styles.labelHint}>How many hours did you sleep?</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setSleepHours(v => Math.max(0, parseFloat((v - 0.5).toFixed(1))))}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.stepValue}>
                <Text style={styles.stepValueText}>{sleepHours}</Text>
                <Text style={styles.stepValueSub}>hrs</Text>
              </View>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setSleepHours(v => Math.min(14, parseFloat((v + 0.5).toFixed(1))))}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sleep Quality */}
          <View style={styles.section}>
            <Text style={styles.label}>Sleep Quality</Text>
            <Text style={styles.labelHint}>How was the quality of your sleep?</Text>
            <View style={styles.qualityRow}>
              {(['poor', 'ok', 'great'] as SleepQuality[]).map(q => (
                <TouchableOpacity
                  key={q}
                  style={[styles.qualityBtn, sleepQuality === q && styles.qualityBtnActive]}
                  onPress={() => setSleepQuality(q)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.qualityBtnText, sleepQuality === q && styles.qualityBtnTextActive]}>
                    {q === 'poor' ? 'Poor' : q === 'ok' ? 'Decent' : 'Great'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.bgPrimary} />
            ) : (
              <Text style={styles.submitBtnText}>{isEdit ? 'Update' : 'Start my day'}</Text>
            )}
          </TouchableOpacity>
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
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
    paddingTop: spacing.md,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: 0,
    padding: spacing.xs,
  },
  title: {
    ...typography.h1,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: 16,
    marginBottom: 2,
  },
  labelHint: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    marginBottom: spacing.sm,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    minWidth: 60,
    justifyContent: 'center',
  },
  stepValueText: {
    ...typography.h1,
    fontSize: 36,
    fontWeight: '700',
    color: colors.accent,
  },
  stepValueSub: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 14,
  },
  scaleBar: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.xs,
  },
  scaleDot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMute,
  },
  scaleDotActive: {
    backgroundColor: colors.accent,
  },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scaleLabelLeft: {
    ...typography.body,
    fontSize: 11,
    color: colors.textMuted,
  },
  scaleLabelRight: {
    ...typography.body,
    fontSize: 11,
    color: colors.textMuted,
  },
  qualityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  qualityBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    alignItems: 'center',
  },
  qualityBtnActive: {
    backgroundColor: colors.accent + '20',
    borderColor: colors.accent,
  },
  qualityBtnText: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  qualityBtnTextActive: {
    color: colors.accent,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    ...typography.title,
    color: colors.bgPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  successTitle: {
    ...typography.h1,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
