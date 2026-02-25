import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, typography, radii } from '../theme';
import type { FitRoastResponse } from '../api/fitroast';

interface Props {
  visible: boolean;
  roast: FitRoastResponse;
  onClose: () => void;
}

function formatWeekRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`;
  } catch {
    return `${start} – ${end}`;
  }
}

// ── Individual roast card ──────────────────────────────────────────────────────

function RoastShareCard({
  contextTitle,
  topic,
  isHeadline,
  text,
  weekRange,
  onShare,
}: {
  contextTitle: string;
  topic: string;
  isHeadline: boolean;
  text: string;
  weekRange: string;
  onShare: () => void;
}) {
  return (
    <View style={cardStyles.wrapper}>
      {/* Context label — visible to external viewers */}
      <Text style={cardStyles.contextTitle}>{contextTitle}</Text>

      {/* Card visual — mirrors the actual roast screen */}
      <LinearGradient colors={['#0D2233', '#051824']} style={cardStyles.card}>
        {/* Header row */}
        <View style={cardStyles.cardHeader}>
          <View style={cardStyles.brandRow}>
            <Text style={cardStyles.brandName}>FitSmart</Text>
            <View style={cardStyles.brandDot} />
          </View>
          <Text style={cardStyles.weekLabel}>{weekRange}</Text>
        </View>

        <View style={cardStyles.accentLine} />

        {/* Topic / THIS WEEK label */}
        <Text style={cardStyles.topicLabel}>
          {isHeadline ? 'THIS WEEK' : topic.toUpperCase()}
        </Text>

        {/* Main roast text */}
        <Text style={cardStyles.roastText}>{text}</Text>

        {/* Footer */}
        <View style={cardStyles.cardFooter}>
          <Text style={cardStyles.footerText}>FitSmart Weekly Roast</Text>
          <View style={cardStyles.footerDot} />
          <Text style={cardStyles.footerText}>fitsmartapp.com</Text>
        </View>
      </LinearGradient>

      {/* Share trigger — native share sheet */}
      <TouchableOpacity style={cardStyles.shareBtn} onPress={onShare} activeOpacity={0.8}>
        <Ionicons name="share-outline" size={17} color={colors.bgPrimary} style={{ marginRight: 7 }} />
        <Text style={cardStyles.shareBtnText}>Share this card</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────

export default function FitRoastShareModal({ visible, roast, onClose }: Props) {
  const weekRange = formatWeekRange(roast.week_start, roast.week_end);

  async function triggerShare(contextTitle: string, topic: string, text: string) {
    const message = [
      contextTitle,
      '',
      `"${text}"`,
      '',
      `— FitSmart Weekly Roast (${weekRange})`,
    ].join('\n');

    try {
      await Share.share({ message, title: contextTitle });
    } catch {
      // User cancelled — no action needed
    }
  }

  // Intro card (headline) + one card per segment
  const introCard = {
    contextTitle: 'My FitRoast this week 🔥',
    topic: 'THIS WEEK',
    isHeadline: true,
    text: roast.headline,
  };

  const segmentCards = roast.segments.map((seg) => ({
    contextTitle: `FitRoast on my ${seg.topic} this week 🔥`,
    topic: seg.topic,
    isHeadline: false,
    text: seg.text,
  }));

  const allCards = [introCard, ...segmentCards];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Share the Roast</Text>
            <Text style={styles.headerFlame}>🔥</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Pick a section — each card shares to your native share sheet.
        </Text>

        {/* Scrollable card stack */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {allCards.map((card, i) => (
            <RoastShareCard
              key={i}
              contextTitle={card.contextTitle}
              topic={card.topic}
              isHeadline={card.isHeadline}
              text={card.text}
              weekRange={weekRange}
              onShare={() => triggerShare(card.contextTitle, card.topic, card.text)}
            />
          ))}
        </ScrollView>

      </View>
    </Modal>
  );
}

// ── Card styles ────────────────────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.xl,
  },
  contextTitle: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.2,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  card: {
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '50',
    shadowColor: colors.accent,
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    minHeight: 220,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  brandName: {
    ...typography.title,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  brandDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  weekLabel: {
    ...typography.small,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  accentLine: {
    height: 2,
    width: 36,
    backgroundColor: colors.accent,
    borderRadius: 1,
    marginBottom: spacing.lg,
  },
  topicLabel: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 10,
    marginBottom: spacing.sm,
  },
  roastText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 30,
    letterSpacing: -0.2,
    flex: 1,
    marginBottom: spacing.lg,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute + '50',
  },
  footerText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.surfaceMute,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 13,
  },
  shareBtnText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
});

// ── Modal shell styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    ...typography.h2,
    fontWeight: '700',
  },
  headerFlame: {
    fontSize: 22,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    ...typography.bodyMuted,
    fontSize: 13,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
