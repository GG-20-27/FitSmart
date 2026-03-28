import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Image, Animated, DeviceEventEmitter, Platform, StatusBar } from 'react-native';
import Constants from 'expo-constants';
import DashboardScreen from './src/screens/DashboardScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import GoalsScreen from './src/screens/GoalsScreen';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import InsightsNavigator from './src/navigation/InsightsNavigator';
import MorningCheckInScreen from './src/screens/MorningCheckInScreen';
import { API_BASE_URL, setAuthToken, hasUserToken, getDataSource, apiRequest } from './src/api/client';
import { navigationTheme } from './src/ui/navigationTheme';
import { colors, spacing, radii, typography } from './src/theme';
import { Ionicons } from '@expo/vector-icons';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.centered}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.errorText}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Coming soon</Text>
    </View>
  );
}

// ── Network Error Banner ───────────────────────────────────────────────────
function NetworkErrorBanner() {
  const slideAnim = useRef(new Animated.Value(-130)).current;
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
    hideTimer.current = setTimeout(() => hide(), 5000);
  };

  const hide = () => {
    Animated.timing(slideAnim, { toValue: -130, duration: 300, useNativeDriver: true }).start(() => setVisible(false));
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('networkError', show);
    return () => { sub.remove(); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  if (!visible) return null;
  return (
    <Animated.View style={[networkBannerStyles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={networkBannerStyles.row}>
        <Text style={networkBannerStyles.icon}>📡</Text>
        <View style={networkBannerStyles.textBlock}>
          <Text style={networkBannerStyles.title}>No connection</Text>
          <Text style={networkBannerStyles.subtitle}>Can't reach the server. Check your network.</Text>
        </View>
        <TouchableOpacity onPress={hide} style={networkBannerStyles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={networkBannerStyles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const BANNER_TOP_PADDING = Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight ?? 24) + 10;

const networkBannerStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent + '40',
    paddingTop: BANNER_TOP_PADDING,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    fontSize: 20,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 16,
  },
});

const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgPrimary,
          borderTopColor: colors.surfaceMute,
          borderTopWidth: 1,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          height: 65,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.surfaceMute,
        tabBarShowLabel: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Goals') {
            iconName = focused ? 'trophy' : 'trophy-outline';
          } else if (route.name === 'Insights') {
            iconName = focused ? 'bulb' : 'bulb-outline';
          } else if (route.name === 'Calendar') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'FitCoach') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          }

          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Goals" component={GoalsScreen} />
      <Tab.Screen name="Insights" component={InsightsNavigator} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="FitCoach" component={ChatScreen} />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarButton: () => null }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Handle deep links (WHOOP OAuth callback only — password reset is now web-based)
  const handleDeepLink = async (url: string) => {
    console.log('[APP] Received deep link:', url);

    // fitsmart://auth?token=xxx — WHOOP OAuth callback
    if (url.includes('auth') && url.includes('token=')) {
      const tokenMatch = url.match(/token=([^&]+)/);
      if (tokenMatch && tokenMatch[1]) {
        const token = tokenMatch[1];
        console.log('[APP] Extracted token from deep link');
        await setAuthToken(token);
        console.log('[APP] Token stored successfully');
        setOnboardingComplete(true);
        setLoading(false);
        return;
      }
    }

    // Not a token URL, check onboarding status
    checkOnboardingStatus();
  };

  useEffect(() => {
    // Log startup info
    console.log('='.repeat(60));
    console.log('🚀 FitScoreAI Mobile App Starting');
    console.log('='.repeat(60));
    console.log('📱 Expo SDK:', Constants.expoConfig?.sdkVersion || 'Unknown');
    console.log('🌐 API Base URL:', API_BASE_URL);
    console.log('🔧 App Version:', Constants.expoConfig?.version || '1.0.0');
    console.log('📦 Platform:', Constants.platform?.ios ? 'iOS' : Constants.platform?.android ? 'Android' : 'Unknown');
    console.log('='.repeat(60));

    // Check for initial URL (app opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      } else {
        checkOnboardingStatus();
      }
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [refreshKey]);

  const checkOnboardingStatus = async () => {
    try {
      setLoading(true);

      // Check if user has manually authenticated (not dev fallback)
      const hasToken = await hasUserToken();
      if (hasToken) {
        console.log('[APP] Found stored auth token, checking data source');
        const ds = await getDataSource();
        if (ds === 'manual') {
          // Manual users: check if they've done today's morning check-in
          try {
            const checkin = await apiRequest<any>('/api/checkin/today');
            if (!checkin) {
              console.log('[APP] Manual user — no check-in today, showing check-in screen');
              setOnboardingComplete(true);
              setShowCheckin(true);
              setLoading(false);
              return;
            }
          } catch (e) {
            console.warn('[APP] Could not fetch check-in status, proceeding to main app', e);
          }
        }
        setOnboardingComplete(true);
        setShowCheckin(false);
        setLoading(false);
        return;
      }

      console.log('[APP] No stored token, showing welcome screen');
      setOnboardingComplete(false);
      setShowCheckin(false);
    } catch (error) {
      console.error('[APP] Failed to check auth status:', error);
      console.log('[APP] Error details:', error instanceof Error ? error.message : 'Unknown error');

      // On error, default to showing welcome (need to authenticate)
      setOnboardingComplete(false);
      setShowCheckin(false);
    } finally {
      setLoading(false);
    }
  };

  // Global refresh function that can be called from anywhere
  global.refreshOnboardingStatus = () => {
    console.log('[APP] Refreshing onboarding status...');
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Image
          source={require('./assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.welcomeText}>Welcome to FitSmart</Text>
      </View>
    );
  }

  // Manual user who hasn't done morning check-in yet
  if (onboardingComplete && showCheckin) {
    return (
      <ErrorBoundary>
        <MorningCheckInScreen onComplete={() => setShowCheckin(false)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }}>
        <NavigationContainer theme={navigationTheme}>
          {onboardingComplete
            ? <MainTabs />
            : <OnboardingNavigator />}
        </NavigationContainer>
        <NetworkErrorBanner />
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPrimary,
    padding: spacing.xl,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: spacing.xl,
  },
  welcomeText: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  title: typography.h1,
  subtitle: {
    ...typography.bodyMuted,
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.bodyMuted,
    marginTop: spacing.md,
    color: colors.danger,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
  },
  retryText: {
    ...typography.title,
    color: colors.bgPrimary,
  },
});

