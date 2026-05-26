import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, ActivityIndicator, Image, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../../theme';
import { API_BASE_URL, setAuthToken } from '../../api/client';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

interface FeatureItem {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const features: FeatureItem[] = [
  {
    icon: 'moon-outline',
    title: 'Recovery Insights',
    description: 'Daily recovery tracking',
  },
  {
    icon: 'flash-outline',
    title: 'Training Analysis',
    description: 'Personalized training guidance',
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

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList>;

export default function OnboardingWelcome() {
  const navigation = useNavigation<NavigationProp>();
  const [isLoading, setIsLoading] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  const privacyUrl = `${API_BASE_URL.replace(/\/$/, '')}/privacy`;

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
          Your AI-powered fitness coach
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

        {/* Consent checkbox */}
        <TouchableOpacity
          style={styles.consentRow}
          onPress={() => setConsentGiven(v => !v)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, consentGiven && styles.checkboxChecked]}>
            {consentGiven && <Ionicons name="checkmark" size={13} color={colors.bgPrimary} />}
          </View>
          <Text style={styles.consentText}>
            I agree to the processing of my health and fitness data, including sensitive data (recovery, injury context, biometrics), as described in the{' '}
            <Text
              style={styles.consentLink}
              onPress={() => Linking.openURL(privacyUrl)}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </TouchableOpacity>

        {/* WHOOP login */}
        <TouchableOpacity
          style={[styles.connectButton, (!consentGiven || isLoading) && styles.connectButtonDisabled]}
          onPress={handleConnectWhoop}
          disabled={!consentGiven || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.bgPrimary} />
          ) : (
            <Ionicons name="heart-outline" size={22} color={colors.bgPrimary} />
          )}
          <Text style={styles.connectButtonText}>
            {isLoading ? 'Connecting...' : 'Continue with WHOOP'}
          </Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Email login */}
        <TouchableOpacity
          style={[styles.emailButton, !consentGiven && styles.emailButtonDisabled]}
          onPress={() => consentGiven && navigation.navigate('OnboardingEmailAuth')}
          activeOpacity={0.85}
        >
          <Ionicons name="mail-outline" size={20} color={consentGiven ? colors.accent : colors.textMuted} />
          <Text style={[styles.emailButtonText, !consentGiven && styles.emailButtonTextDisabled]}>Sign Up with Email</Text>
        </TouchableOpacity>

        {/* Already have an account */}
        <View style={styles.signInRow}>
          <Text style={styles.signInText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('OnboardingEmailAuth', { mode: 'signin' })}>
            <Text style={styles.signInLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
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
    marginBottom: spacing.xl,
  },
  logoImage: {
    width: 100,
    height: 100,
  },
  title: {
    ...typography.h1,
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 42,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  featuresContainer: {
    gap: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 15,
    marginBottom: 1,
  },
  featureDescription: {
    ...typography.bodyMuted,
    fontSize: 13,
    lineHeight: 17,
  },
  spacer: {
    flex: 1,
    minHeight: spacing.xl,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  consentText: {
    ...typography.small,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  consentLink: {
    color: colors.accent,
    fontWeight: '600',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  connectButtonDisabled: {
    opacity: 0.4,
  },
  connectButtonText: {
    ...typography.title,
    color: colors.bgPrimary,
    fontSize: 17,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.surfaceMute,
  },
  dividerText: {
    ...typography.small,
    color: colors.textMuted,
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  emailButtonDisabled: {
    borderColor: colors.textMuted,
    opacity: 0.4,
  },
  emailButtonText: {
    ...typography.title,
    color: colors.accent,
    fontSize: 17,
    fontWeight: '600',
  },
  emailButtonTextDisabled: {
    color: colors.textMuted,
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  signInText: {
    ...typography.small,
    color: colors.textMuted,
  },
  signInLink: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '600',
  },
  joinTeamRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  joinTeamText: {
    ...typography.small,
    color: colors.textMuted,
  },
  joinTeamLink: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '600',
  },
});
