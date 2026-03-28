import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
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

        {/* WHOOP login */}
        <TouchableOpacity
          style={[styles.connectButton, isLoading && styles.connectButtonDisabled]}
          onPress={handleConnectWhoop}
          disabled={isLoading}
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
          style={styles.emailButton}
          onPress={() => navigation.navigate('OnboardingEmailAuth')}
          activeOpacity={0.85}
        >
          <Ionicons name="mail-outline" size={20} color={colors.accent} />
          <Text style={styles.emailButtonText}>Sign Up with Email</Text>
        </TouchableOpacity>

        {/* Already have an account */}
        <View style={styles.signInRow}>
          <Text style={styles.signInText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('OnboardingEmailAuth', { mode: 'signin' })}>
            <Text style={styles.signInLink}>Sign in</Text>
          </TouchableOpacity>
        </View>

        {/* Security Note */}
        <View style={styles.securityNote}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
          <Text style={styles.securityText}>
            Your data stays private
          </Text>
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
    opacity: 0.7,
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
  emailButtonText: {
    ...typography.title,
    color: colors.accent,
    fontSize: 17,
    fontWeight: '600',
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
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  securityText: {
    ...typography.small,
    color: colors.textMuted,
  },
});
