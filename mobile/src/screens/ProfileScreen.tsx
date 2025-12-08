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
import { apiRequest, clearAuthToken, getAuthToken } from '../api/client';
import { colors, spacing, radii, typography, state } from '../theme';
import { Card, Button } from '../ui/components';

type ProfileData = {
  whoop_connected: boolean;
  whoop_last_sync?: string;
  calendar_ics_url?: string;
  meal_reminders_enabled: boolean;
};

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
  const [profile, setProfile] = useState<ProfileData>({
    whoop_connected: false,
    meal_reminders_enabled: false,
  });
  const [loading, setLoading] = useState(false);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [icsUrl, setIcsUrl] = useState('');
  const [icsUrlError, setIcsUrlError] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load WHOOP status using the correct endpoint
      const whoopData = await apiRequest<WhoopStatus>('/api/whoop/status');
      setProfile(prev => ({
        ...prev,
        whoop_connected: whoopData.authenticated,
        whoop_last_sync: whoopData.expires_at
      }));
      
      // Load calendars
      try {
        const calendarData = await apiRequest<Calendar[]>('/api/calendars');
        setCalendars(calendarData || []);
      } catch (calendarError) {
        console.log('Failed to load calendars:', calendarError);
        setCalendars([]);
      }
      
    } catch (error) {
      console.error('Failed to load profile:', error);
      // Continue with default state if API fails
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const validateIcsUrl = (url: string): boolean => {
    if (!url.trim()) return true; // Empty is valid (optional field)
    
    // Simple URL validation regex
    const urlRegex = /^https?:\/\/.+/;
    return urlRegex.test(url.trim());
  };

  const handleIcsUrlChange = (text: string) => {
    setIcsUrl(text);
    if (text.trim() && !validateIcsUrl(text)) {
      setIcsUrlError('Please enter a valid URL (starting with http:// or https://)');
    } else {
      setIcsUrlError('');
    }
  };

  const handleSaveIcsUrl = async () => {
    if (!validateIcsUrl(icsUrl)) {
      Alert.alert('Invalid URL', 'Please enter a valid ICS URL');
      return;
    }

    if (!icsUrl.trim()) {
      Alert.alert('Error', 'Please enter a calendar URL');
      return;
    }

    try {
      setLoading(true);
      await apiRequest('/api/calendars', {
        method: 'POST',
        body: JSON.stringify({
          calendarUrl: icsUrl.trim(),
          calendarName: 'Training Calendar'
        }),
      });

      // Reload calendars
      await loadProfile();
      setIcsUrl('');
      Alert.alert('Success', 'Calendar added successfully');
    } catch (error) {
      console.error('Failed to save calendar URL:', error);
      Alert.alert('Error', 'Failed to save calendar URL. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCalendar = async (calendarId: number) => {
    Alert.alert(
      'Delete Calendar',
      'Are you sure you want to remove this calendar?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await apiRequest(`/api/calendars/${calendarId}`, {
                method: 'DELETE',
              });
              await loadProfile();
              Alert.alert('Success', 'Calendar removed successfully');
            } catch (error) {
              console.error('Failed to delete calendar:', error);
              Alert.alert('Error', 'Failed to remove calendar. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleMealRemindersToggle = async (value: boolean) => {
    try {
      setLoading(true);
      // Note: Meal reminders not yet implemented in backend
      // For now, just update local state
      setProfile(prev => ({ ...prev, meal_reminders_enabled: value }));
    } catch (error) {
      console.error('Failed to update meal reminders:', error);
      Alert.alert('Error', 'Failed to update meal reminder settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? This will clear your session.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAuthToken();
              // In a real app, you'd navigate to login screen here
              Alert.alert('Logged Out', 'You have been logged out successfully.');
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]
    );
  };

  const formatLastSync = (lastSync?: string): string => {
    if (!lastSync) return 'Never';
    
    try {
      const date = new Date(lastSync);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return 'Unknown';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.container}>
        <Text style={styles.header}>Profile Settings</Text>

      {/* WHOOP Connection Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WHOOP Connection</Text>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status</Text>
            <View style={styles.statusValue}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: profile.whoop_connected ? state.ready : state.rest },
                ]}
              />
              <Text style={styles.statusText}>
                {profile.whoop_connected ? 'Connected' : 'Not Connected'}
              </Text>
            </View>
          </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Token Expires</Text>
              <Text style={styles.statusText}>
                {formatLastSync(profile.whoop_last_sync)}
              </Text>
            </View>
        </View>
      </View>

      {/* Training Calendar */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Training Calendars</Text>

        {/* Existing Calendars List */}
        {calendars.length > 0 && (
          <View style={styles.calendarsList}>
            {calendars.map((calendar) => (
              <View key={calendar.id} style={styles.calendarItem}>
                <View style={styles.calendarInfo}>
                  <Text style={styles.calendarName}>{calendar.name}</Text>
                  <Text style={styles.calendarUrl} numberOfLines={1}>
                    {calendar.calendar_url}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteCalendar(calendar.id)}
                >
                  <Text style={styles.deleteButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Add New Calendar */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Add New Calendar (ICS Link)</Text>
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
            style={[styles.saveButton, loading ? styles.saveButtonDisabled : null]}
            onPress={handleSaveIcsUrl}
            disabled={loading}
          >
            <Text style={styles.saveButtonText}>
              {loading ? 'Adding...' : 'Add Calendar'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Meal Reminders */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Meal Reminders</Text>
        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Daily Meal Reminders</Text>
              <Text style={styles.toggleDescription}>
                Get daily reminders to log your meals
              </Text>
            </View>
            <Switch
              value={profile.meal_reminders_enabled}
              onValueChange={handleMealRemindersToggle}
              trackColor={{ false: colors.surfaceMute, true: colors.accent }}
              thumbColor={profile.meal_reminders_enabled ? colors.textPrimary : colors.textMuted}
              disabled={loading}
            />
          </View>
        </View>
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Pull to refresh</Text>
      </View>
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
    padding: spacing.lg,
  },
  header: {
    ...typography.h1,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  statusCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  statusValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  statusText: {
    ...typography.body,
    fontWeight: '500',
  },
  calendarsList: {
    marginBottom: spacing.lg,
  },
  calendarItem: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  calendarName: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: 4,
  },
  calendarUrl: {
    ...typography.bodyMuted,
  },
  deleteButton: {
    backgroundColor: colors.danger,
    borderRadius: radii.sm,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  inputCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  inputLabel: {
    ...typography.body,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  textInput: {
    backgroundColor: colors.bgPrimary,
    borderRadius: radii.sm,
    padding: spacing.md,
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
    marginBottom: spacing.md,
  },
  textInputError: {
    borderColor: colors.danger,
  },
  errorText: {
    ...typography.bodyMuted,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    padding: spacing.md,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: colors.surfaceMute,
  },
  saveButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '600',
  },
  toggleCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.lg,
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
    fontWeight: '500',
    marginBottom: 4,
  },
  toggleDescription: {
    ...typography.bodyMuted,
  },
  logoutButton: {
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  logoutButtonText: {
    ...typography.title,
    color: colors.textPrimary,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
  footerText: {
    ...typography.small,
  },
});
