import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest, clearAuthToken } from '../api/client';
import { colors, spacing, radii, typography, shadows, state } from '../theme';

type WhoopStatus = {
  authenticated: boolean;
  message: string;
  auth_url?: string;
  expires_at?: string;
};

type Calendar = {
  id: number;
  calendar_url: string;
  name: string;
  is_active: boolean;
};

export default function ProfileScreen() {
  const [whoopConnected, setWhoopConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [icsUrl, setIcsUrl] = useState('');
  const [icsUrlError, setIcsUrlError] = useState('');
  const [fitRoastEnabled, setFitRoastEnabled] = useState(true);
  const [roastIntensity, setRoastIntensity] = useState<'Light' | 'Spicy' | 'Savage'>('Spicy');

  // Load FitRoast settings — default ON / Spicy if never set
  useFocusEffect(useCallback(() => {
    AsyncStorage.multiGet(['fitRoastEnabled', 'roastIntensity']).then(pairs => {
      const enabled = pairs[0][1];
      const intensity = pairs[1][1];
      // null means never set → default true
      setFitRoastEnabled(enabled === null ? true : enabled === 'true');
      if (intensity === 'Light' || intensity === 'Spicy' || intensity === 'Savage') {
        setRoastIntensity(intensity);
      }
    });
  }, []));

  const handleFitRoastToggle = async (value: boolean) => {
    setFitRoastEnabled(value);
    await AsyncStorage.setItem('fitRoastEnabled', String(value));
  };

  const handleIntensityChange = async (level: 'Light' | 'Spicy' | 'Savage') => {
    setRoastIntensity(level);
    await AsyncStorage.setItem('roastIntensity', level);
  };

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const whoopData = await apiRequest<WhoopStatus>('/api/whoop/status');
      setWhoopConnected(whoopData.authenticated);
      try {
        const calendarData = await apiRequest<Calendar[]>('/api/calendars');
        setCalendars(calendarData || []);
      } catch {
        setCalendars([]);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  const handleIcsUrlChange = (text: string) => {
    setIcsUrl(text);
    if (text.trim() && !/^https?:\/\/.+/.test(text.trim())) {
      setIcsUrlError('Please enter a valid URL (starting with http:// or https://)');
    } else {
      setIcsUrlError('');
    }
  };

  const handleSaveIcsUrl = async () => {
    if (!/^https?:\/\/.+/.test(icsUrl.trim())) {
      Alert.alert('Invalid URL', 'Please enter a valid ICS URL');
      return;
    }
    try {
      setLoading(true);
      await apiRequest('/api/calendars', {
        method: 'POST',
        body: JSON.stringify({ calendarUrl: icsUrl.trim(), calendarName: 'Training Calendar' }),
      });
      await loadProfile();
      setIcsUrl('');
      Alert.alert('Success', 'Calendar added successfully');
    } catch {
      Alert.alert('Error', 'Failed to save calendar URL. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCalendar = async (calendarId: number) => {
    Alert.alert('Remove Calendar', 'Are you sure you want to remove this calendar?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await apiRequest(`/api/calendars/${calendarId}`, { method: 'DELETE' });
            await loadProfile();
          } catch {
            Alert.alert('Error', 'Failed to remove calendar. Please try again.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearAuthToken();
            if (typeof (global as any).refreshOnboardingStatus === 'function') {
              (global as any).refreshOnboardingStatus();
            }
          } catch {
            Alert.alert('Error', 'Failed to logout. Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>Profile</Text>

        {/* WHOOP Connection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WHOOP Connection</Text>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.rowLabel}>Status</Text>
              <View style={styles.statusValue}>
                <View style={[styles.statusDot, { backgroundColor: whoopConnected ? state.ready : state.rest }]} />
                <Text style={[styles.rowValue, { color: whoopConnected ? state.ready : colors.textMuted }]}>
                  {whoopConnected ? 'Connected' : 'Not Connected'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Training Calendars */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training Calendars</Text>
          {calendars.length > 0 && (
            <View style={styles.calendarsList}>
              {calendars.map((calendar) => (
                <View key={calendar.id} style={styles.calendarItem}>
                  <View style={styles.calendarInfo}>
                    <Text style={styles.calendarName}>{calendar.name}</Text>
                    <Text style={styles.calendarUrl} numberOfLines={1}>{calendar.calendar_url}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleDeleteCalendar(calendar.id)}
                  >
                    <Ionicons name="close-circle-outline" size={22} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Add ICS Calendar Link</Text>
            <TextInput
              style={[styles.textInput, icsUrlError ? styles.textInputError : null]}
              value={icsUrl}
              onChangeText={handleIcsUrlChange}
              placeholder="https://calendar.google.com/calendar/ical/..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {icsUrlError ? <Text style={styles.errorText}>{icsUrlError}</Text> : null}
            <TouchableOpacity
              style={[styles.accentButton, loading && styles.accentButtonDisabled]}
              onPress={handleSaveIcsUrl}
              disabled={loading}
            >
              <Text style={styles.accentButtonText}>{loading ? 'Adding...' : 'Add Calendar'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* FitRoast */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FitRoast</Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Weekly FitRoast</Text>
                <Text style={styles.toggleDescription}>Get a weekly AI roast of your fitness performance</Text>
              </View>
              <Switch
                value={fitRoastEnabled}
                onValueChange={handleFitRoastToggle}
                trackColor={{ false: colors.surfaceMute, true: colors.accent }}
                thumbColor={colors.textPrimary}
              />
            </View>

            {fitRoastEnabled && (
              <View style={styles.intensitySection}>
                <Text style={styles.intensityLabel}>Roast Intensity</Text>
                <View style={styles.intensitySelector}>
                  {(['Light', 'Spicy', 'Savage'] as const).map((level) => (
                    <TouchableOpacity
                      key={level}
                      style={[styles.intensityOption, roastIntensity === level && styles.intensityOptionActive]}
                      onPress={() => handleIntensityChange(level)}
                    >
                      <Text style={[styles.intensityOptionText, roastIntensity === level && styles.intensityOptionTextActive]}>
                        {level}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  header: {
    ...typography.h1,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.small,
    fontSize: 11,
    letterSpacing: 1.1,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  rowValue: {
    ...typography.body,
    fontWeight: '600',
  },
  statusValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calendarsList: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  calendarItem: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.card,
  },
  calendarInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  calendarName: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  calendarUrl: {
    ...typography.small,
    color: colors.textMuted,
  },
  removeButton: {
    padding: spacing.xs,
  },
  inputLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
  textInput: {
    backgroundColor: colors.bgPrimary,
    borderRadius: radii.md,
    padding: spacing.md,
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    marginBottom: spacing.md,
    color: colors.textPrimary,
  },
  textInputError: {
    borderColor: colors.danger,
  },
  errorText: {
    ...typography.small,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  accentButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  accentButtonDisabled: {
    backgroundColor: colors.surfaceMute,
  },
  accentButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing.lg,
  },
  toggleLabel: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleDescription: {
    ...typography.small,
    color: colors.textMuted,
  },
  intensitySection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute + '40',
  },
  intensityLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  intensitySelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  intensityOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.surfaceMute + '80',
    alignItems: 'center',
  },
  intensityOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '18',
  },
  intensityOptionText: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '600',
  },
  intensityOptionTextActive: {
    color: colors.accent,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.danger + '60',
    ...shadows.card,
  },
  logoutButtonText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: '600',
  },
});
