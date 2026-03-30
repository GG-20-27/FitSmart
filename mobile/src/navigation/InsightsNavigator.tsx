import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import FitScoreScreen from '../screens/FitScoreScreen';
import FitLookScreen from '../screens/FitLookScreen';
import FitRoastScreen from '../screens/FitRoastScreen';
import { colors, spacing, typography, radii } from '../theme';

type InsightTab = 'FitScore' | 'FitLook' | 'FitRoast';

export default function InsightsNavigator() {
  const [activeTab, setActiveTab] = useState<InsightTab>('FitLook');
  const route = useRoute();

  // Switch to requested tab when navigated here with params (e.g. Sunday FitRoast reminder)
  useFocusEffect(useCallback(() => {
    const params = route.params as { initialTab?: InsightTab } | undefined;
    if (params?.initialTab) {
      setActiveTab(params.initialTab);
    }
  }, [route.params]));

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Segmented Navigation */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[
            styles.segment,
            activeTab === 'FitScore' && styles.segmentActive,
          ]}
          onPress={() => setActiveTab('FitScore')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'FitScore' && styles.segmentTextActive,
            ]}
          >
            FitScore
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segment,
            activeTab === 'FitLook' && styles.segmentActive,
          ]}
          onPress={() => setActiveTab('FitLook')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'FitLook' && styles.segmentTextActive,
            ]}
          >
            FitLook
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segment,
            activeTab === 'FitRoast' && styles.segmentActive,
          ]}
          onPress={() => setActiveTab('FitRoast')}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'FitRoast' && styles.segmentTextActive,
            ]}
          >
            FitRoast
          </Text>
        </TouchableOpacity>
      </View>

      {/* Keep all screens mounted to preserve state — show/hide via display */}
      <View style={[styles.screenContainer, { display: activeTab === 'FitScore' ? 'flex' : 'none' }]}>
        <FitScoreScreen />
      </View>
      <View style={[styles.screenContainer, { display: activeTab === 'FitLook' ? 'flex' : 'none' }]}>
        <FitLookScreen />
      </View>
      <View style={[styles.screenContainer, { display: activeTab === 'FitRoast' ? 'flex' : 'none' }]}>
        <FitRoastScreen />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMute + '30',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: colors.bgPrimary,
    fontWeight: '600',
  },
  screenContainer: {
    flex: 1,
  },
});
