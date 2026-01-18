import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import FitScoreScreen from '../screens/FitScoreScreen';
import FitLookScreen from '../screens/FitLookScreen';
import FitRoastScreen from '../screens/FitRoastScreen';
import { colors, spacing, typography, radii } from '../theme';

type InsightTab = 'FitScore' | 'FitLook' | 'FitRoast';

export default function InsightsNavigator() {
  const [activeTab, setActiveTab] = useState<InsightTab>('FitScore');

  const renderScreen = () => {
    switch (activeTab) {
      case 'FitScore':
        return <FitScoreScreen />;
      case 'FitLook':
        return <FitLookScreen />;
      case 'FitRoast':
        return <FitRoastScreen />;
      default:
        return <FitScoreScreen />;
    }
  };

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

      {/* Screen Content */}
      <View style={styles.screenContainer}>
        {renderScreen()}
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
