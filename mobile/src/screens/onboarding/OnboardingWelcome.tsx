import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../../theme';
import { API_BASE_URL, setAuthToken } from '../../api/client';

interface FeatureItem {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const features: FeatureItem[] = [
  {
    icon: 'moon-outline',
    title: 'Recovery Insights',
    description: 'Real-time recovery tracking powered by WHOOP',
  },
  {
    icon: 'flash-outline',
    title: 'Training Analysis',
    description: 'Personalized effort and strain recommendations',
  },
  {
    icon: 'restaurant-outline',
    title: 'Nutrition Feedback',
    description: 'AI-powered meal scoring and insights',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'AI Coach Conversations',
    description: 'Daily motivation and actionable advice',
  },
];

export default function OnboardingWelcome() {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnectWhoop = async () => {
    try {
      setIsLoading(true);

      // Open WHOOP OAuth flow with WebBrowser for proper redirect handling
      const authUrl = `${API_BASE_URL.replace(/\/$/, '')}/api/whoop/login`;
      console.log('[WELCOME] Opening WHOOP OAuth:', authUrl);

      // Use openAuthSessionAsync - it will return when redirect to fitsmart:// happens
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        'fitsmart://auth'  // This is the redirect URL scheme
      );

      console.log('[WELCOME] Auth session result:', result.type);

      if (result.type === 'success' && result.url) {
        // Extract token from the redirect URL
        const url = result.url;
        console.log('[WELCOME] Redirect URL:', url);

        if (url.includes('token=')) {
          const tokenMatch = url.match(/token=([^&]+)/);
          if (tokenMatch && tokenMatch[1]) {
            const token = tokenMatch[1];
            console.log('[WELCOME] Token extracted successfully');

            // Store the token
            await setAuthToken(token);
            console.log('[WELCOME] Token stored successfully');

            // Refresh app state
            if (global.refreshOnboardingStatus) {
              global.refreshOnboardingStatus();
            }
          }
        }
      } else if (result.type === 'cancel') {
        console.log('[WELCOME] Auth cancelled by user');
      }
    } catch (error) {
      console.error('[WELCOME] Failed to open WHOOP auth:', error);
      Alert.alert('Error', 'Failed to connect with WHOOP');
    } finally {
      setIsLoading(false);
    }
  };

  // For Expo Go development - paste token from clipboard
  const handlePasteToken = async () => {
    try {
      const clipboardContent = await Clipboard.getStringAsync();

      if (!clipboardContent) {
        Alert.alert('No Token', 'Clipboard is empty. Copy the token from the success page first.');
        return;
      }

      // Basic JWT validation (should have 3 parts separated by dots)
      if (!clipboardContent.includes('.') || clipboardContent.split('.').length !== 3) {
        Alert.alert('Invalid Token', 'The clipboard content does not appear to be a valid token.');
        return;
      }

      // Store the token
      await setAuthToken(clipboardContent.trim());
      console.log('[WELCOME] Token pasted and stored successfully');

      // Refresh app state
      if (global.refreshOnboardingStatus) {
        global.refreshOnboardingStatus();
      }
    } catch (error) {
      console.error('[WELCOME] Failed to paste token:', error);
      Alert.alert('Error', 'Failed to paste token');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* Title */}
        <Text style={styles.title}>Welcome to{'\n'}FitSmart</Text>
        <Text style={styles.subtitle}>
          Your AI-powered fitness coach{'\n'}powered by WHOOP data
        </Text>

        {/* Features */}
        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <View style={styles.featureIconContainer}>
                <Ionicons name={feature.icon} size={24} color={colors.accent} />
              </View>
              <View style={styles.featureTextContainer}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Connect Button */}
        <TouchableOpacity
          style={[styles.connectButton, isLoading && styles.connectButtonDisabled]}
          onPress={handleConnectWhoop}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.bgPrimary} />
          ) : (
            <Ionicons name="heart-outline" size={24} color={colors.bgPrimary} />
          )}
          <Text style={styles.connectButtonText}>
            {isLoading ? 'Connecting...' : 'Connect with WHOOP'}
          </Text>
        </TouchableOpacity>

        {/* Security Note */}
        <View style={styles.securityNote}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
          <Text style={styles.securityText}>
            Secure WHOOP login — your data stays private
          </Text>
        </View>

        {/* Dev: Paste Token (for Expo Go) */}
        <TouchableOpacity style={styles.pasteButton} onPress={handlePasteToken}>
          <Ionicons name="clipboard-outline" size={16} color={colors.textMuted} />
          <Text style={styles.pasteButtonText}>Paste Token (Expo Go)</Text>
        </TouchableOpacity>
      </ScrollView>
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
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  title: {
    ...typography.h1,
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 44,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: 24,
  },
  featuresContainer: {
    gap: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(39, 233, 181, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    ...typography.title,
    fontSize: 16,
    marginBottom: 2,
  },
  featureDescription: {
    ...typography.bodyMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  spacer: {
    flex: 1,
    minHeight: spacing.xxl,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  connectButtonDisabled: {
    opacity: 0.7,
  },
  connectButtonText: {
    ...typography.title,
    color: colors.bgPrimary,
    fontSize: 18,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  securityText: {
    ...typography.small,
    color: colors.textMuted,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  pasteButtonText: {
    ...typography.small,
    color: colors.textMuted,
  },
});
