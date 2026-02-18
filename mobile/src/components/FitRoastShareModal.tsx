import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  Share, Linking, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, typography, radii } from '../theme';
import type { FitRoastResponse, FitRoastSegment } from '../api/fitroast';

interface Props {
  visible: boolean;
  roast: FitRoastResponse;
  onClose: () => void;
}

interface SharePlatform {
  key: string;
  label: string;
  icon: string;
  color: string;
  scheme?: string; // deep link scheme
}

const PLATFORMS: SharePlatform[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366', scheme: 'whatsapp://send?text=' },
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E1306C', scheme: 'instagram://story' },
  { key: 'tiktok', label: 'TikTok', icon: 'musical-notes', color: '#010101', scheme: 'tiktok://' },
  { key: 'snapchat', label: 'Snapchat', icon: 'logo-snapchat', color: '#FFFC00', scheme: 'snapchat://' },
  { key: 'sms', label: 'SMS', icon: 'chatbubble', color: '#34C759', scheme: 'sms:?&body=' },
  { key: 'more', label: 'More', icon: 'share-outline', color: colors.accent },
];

function buildShareText(roast: FitRoastResponse): string {
  const week = formatWeekRange(roast.week_start, roast.week_end);
  const lines = [
    `🔥 FitRoast — ${week}`,
    `"${roast.headline}"`,
    '',
    ...roast.segments.map(s => `${s.topic}: ${s.text}`),
    '',
    'FitSmart — Your weekly reality check',
  ];
  return lines.join('\n');
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

export default function FitRoastShareModal({ visible, roast, onClose }: Props) {
  const shareText = buildShareText(roast);

  async function handleShare(platform: SharePlatform) {
    if (platform.key === 'more') {
      try {
        await Share.share({ message: shareText, title: roast.headline });
      } catch { /* user cancelled */ }
      return;
    }

    if (platform.scheme) {
      const url = platform.scheme + encodeURIComponent(shareText);
      const canOpen = await Linking.canOpenURL(url).catch(() => false);
      if (canOpen) {
        await Linking.openURL(url).catch(() => {});
      } else {
        // App not installed — fall back to system share
        try {
          await Share.share({ message: shareText, title: roast.headline });
        } catch { /* user cancelled */ }
      }
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Prompt heading */}
          <Text style={styles.promptTitle}>Share the roast 🔥</Text>
          <Text style={styles.promptSubtitle}>
            Your weekly reality check, packaged for the world.
          </Text>

          {/* ── Brand share card ── */}
          <View style={styles.shareCard}>
            <LinearGradient
              colors={['#0D2233', '#051824']}
              style={styles.cardGradient}
            >
              {/* Card header */}
              <View style={styles.cardHeader}>
                <View style={styles.cardLogo}>
                  <Text style={styles.cardLogoText}>FitSmart</Text>
                  <View style={styles.cardLogoDot} />
                </View>
                <Text style={styles.cardWeek}>
                  {formatWeekRange(roast.week_start, roast.week_end)}
                </Text>
              </View>

              {/* Accent line */}
              <View style={styles.cardAccentLine} />

              {/* Headline */}
              <Text style={styles.cardHeadline}>{roast.headline}</Text>

              {/* Segments */}
              <View style={styles.cardSegments}>
                {roast.segments.map((seg, i) => (
                  <View key={i} style={styles.cardSegmentRow}>
                    <Text style={styles.cardSegmentTopic}>{seg.topic}</Text>
                    <Text style={styles.cardSegmentText} numberOfLines={2}>
                      {seg.text}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Card footer */}
              <View style={styles.cardFooter}>
                <Text style={styles.cardFooterText}>FitSmart Weekly Roast</Text>
                <View style={styles.cardFooterDot} />
                <Text style={styles.cardFooterText}>fitsmartapp.com</Text>
              </View>
            </LinearGradient>
          </View>

          {/* ── Platform buttons ── */}
          <Text style={styles.shareViaLabel}>Share via</Text>
          <View style={styles.platformGrid}>
            {PLATFORMS.map((platform) => (
              <TouchableOpacity
                key={platform.key}
                style={styles.platformButton}
                onPress={() => handleShare(platform)}
                activeOpacity={0.75}
              >
                <View style={[styles.platformIcon, { backgroundColor: platform.color + '22', borderColor: platform.color + '44' }]}>
                  <Ionicons
                    name={platform.icon as any}
                    size={26}
                    color={platform.color === '#FFFC00' ? '#888' : platform.color}
                  />
                </View>
                <Text style={styles.platformLabel}>{platform.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl + spacing.xxl,
    paddingBottom: spacing.xxl,
  },

  // Prompt heading
  promptTitle: {
    ...typography.h1,
    marginBottom: spacing.xs,
  },
  promptSubtitle: {
    ...typography.bodyMuted,
    marginBottom: spacing.xl,
  },

  // ── Share card ──
  shareCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceMute + '60',
    shadowColor: colors.accent,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  cardGradient: {
    padding: spacing.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardLogoText: {
    ...typography.title,
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardLogoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  cardWeek: {
    ...typography.small,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  cardAccentLine: {
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
    marginBottom: spacing.lg,
    width: 40,
  },
  cardHeadline: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 34,
    letterSpacing: -0.3,
    marginBottom: spacing.xl,
  },
  cardSegments: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  cardSegmentRow: {
    gap: 3,
  },
  cardSegmentTopic: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontSize: 10,
  },
  cardSegmentText: {
    ...typography.bodyMuted,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute + '60',
  },
  cardFooterText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
  },
  cardFooterDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.surfaceMute,
  },

  // Platform buttons
  shareViaLabel: {
    ...typography.bodyMuted,
    marginBottom: spacing.lg,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  platformGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'flex-start',
  },
  platformButton: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 64,
  },
  platformIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  platformLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
  },
});
