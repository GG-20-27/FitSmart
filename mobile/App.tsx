import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import Constants from 'expo-constants';
import DashboardScreen from './src/screens/DashboardScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import GoalsScreen from './src/screens/GoalsScreen';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import { getDetailedStatus } from './src/api/onboarding';
import { API_BASE_URL } from './src/api/client';
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
        tabBarLabelStyle: {
          ...typography.small,
          fontSize: 11,
          marginTop: 4,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Goals') {
            iconName = focused ? 'trophy' : 'trophy-outline';
          } else if (route.name === 'Calendar') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Coach') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          }

          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Goals" component={GoalsScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Coach" component={ChatScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
    
    checkOnboardingStatus();
  }, [refreshKey]);

  const checkOnboardingStatus = async () => {
    try {
      setLoading(true);
      
      // Add timeout to prevent hanging on network issues
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      );
      
      const status = await Promise.race([
        getDetailedStatus(),
        timeoutPromise
      ]) as any;
      
      console.log('[APP] Onboarding status:', status);

      // Check if user has completed at least Phase 1
      // For now, we'll show main app if phase 1 is complete
      setOnboardingComplete(status.phase1?.complete || status.isComplete);
    } catch (error) {
      console.error('[APP] Failed to check onboarding status:', error);
      console.log('[APP] Error details:', error instanceof Error ? error.message : 'Unknown error');
      
      // On error, default to showing onboarding (better than blank screen)
      setOnboardingComplete(false);
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
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.subtitle, { marginTop: spacing.md }]}>Loading...</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <NavigationContainer theme={navigationTheme}>
        {onboardingComplete ? <MainTabs /> : <OnboardingNavigator />}
      </NavigationContainer>
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

