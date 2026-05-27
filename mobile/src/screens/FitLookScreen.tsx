import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Modal, Dimensions, Platform, PanResponder,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const PILLARS = [
  { key: 'nutrition' as const, icon: 'nutrition-outline', label: 'NUTRITION' },
  { key: 'recovery'  as const, icon: 'heart-outline',     label: 'RECOVERY'  },
  { key: 'training'  as const, icon: 'flash-outline',     label: 'TRAINING'  },
];
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, typography, radii, shadows } from '../theme';
import {
  getCheckinToday, saveCheckin, getFitLookToday, regenerateFitLook,
  type Feeling, type FitLookResponse,
} from '../api/fitlook';

const FITLOOK_CHECKIN_KEY = () => `fitlook_checkin_${new Date().toISOString().slice(0, 10)}`;

// Regex: match numbers with fitness units (ranges too) and times like 16:00
const EMPHASIS_RE = /(\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:kcal|cal|g|kg|ml|mg|h|min|%|x)?|\d{1,2}:\d{2})/gi;

function renderBulletText(text: string, emphasisStyle: object, baseStyle: object): React.ReactNode {
  const parts = text.split(EMPHASIS_RE);
  return parts.map((part, i) =>
    /^\d/.test(part)
      ? <Text key={i} style={emphasisStyle}>{part}</Text>
      : <Text key={i} style={baseStyle}>{part}</Text>
  );
}

/**
 * Builds the prefilled FitCoach prompt from the FitLook payload.
 * Only uses data already on screen — no new API calls.
 */
function buildExplainPlanPrompt(fitlook: FitLookResponse, feeling: Feeling | null): string {
  const chips = fitlook.snapshot_chips ?? [];
  const feelingLabel = feeling
    ? feeling.charAt(0).toUpperCase() + feeling.slice(1)
    : chips[2] ?? 'Unknown';

  const readinessParts = [
    chips[0] ? `Recovery ${chips[0]}` : null,
    chips[1] ? `Sleep ${chips[1]}` : null,
    `Feeling: ${feelingLabel}`,
  ].filter(Boolean).join(', ');

  const lines: string[] = [];
  lines.push('Explain today\'s plan using my FitLook context.');
  if (readinessParts) lines.push(`Today's readiness: ${readinessParts}.`);
  if (fitlook.focus) lines.push(`Today's focus: ${fitlook.focus}.`);
  if (fitlook.do && fitlook.do.length > 0) {
    lines.push(`Actions — DO: ${fitlook.do.join('; ')}.`);
  }
  if (fitlook.avoid) {
    lines.push(`Actions — AVOID: ${fitlook.avoid}.`);
  }
  if (fitlook.forecast_line) {
    const clean = fitlook.forecast_line
      .replace(/^to hit today['']s\s+(fitscore\s+)?forecast:\s*/i, '')
      .trim();
    lines.push(`Forecast target: ${clean}.`);
  }
  lines.push('');
  lines.push('1) Briefly explain WHY this is the right plan today (tie directly to readiness + context flags).');
  lines.push('2) Clarify how strict I should be on AVOID items and what safe alternatives look like (within rehab/goal limits if applicable).');
  lines.push('3) Give 1–2 practical tips to make the DO actions easier to execute today.');
  lines.push('Keep it concise and aligned with the FitLook plan (no generic advice unless explicitly flagged in today\'s context).');

  return lines.join('\n');
}


const FEELINGS: { key: Feeling; label: string; icon: string }[] = [
  { key: 'energized', label: 'Energized', icon: 'flash' },
  { key: 'steady', label: 'Steady', icon: 'water' },
  { key: 'tired', label: 'Tired', icon: 'moon' },
  { key: 'stressed', label: 'Stressed', icon: 'thunderstorm' },
];

export default function FitLookScreen() {
  // States
  const [checkinDone, setCheckinDone] = useState<boolean | null>(null);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [savingCheckin, setSavingCheckin] = useState(false);
  const [fitlook, setFitlook] = useState<FitLookResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPillar, setOpenPillar] = useState<'nutrition' | 'recovery' | 'training' | null>(null);
  const [seenPillars, setSeenPillars] = useState<Set<string>>(new Set());

  const navigation = useNavigation<any>();

  // Card stagger animations
  const cardAnims = useRef(
    PILLARS.map(() => ({ opacity: new Animated.Value(0), translateY: new Animated.Value(24) }))
  ).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const glowLoop = useRef<Animated.CompositeAnimation | null>(null);
  const modalAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  // 0 = unseen (use glowAnim), 1 = seen (fade to 0.35)
  const ctaSeenAnims = useRef(PILLARS.map(() => new Animated.Value(0))).current;

  const dragPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 3,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) modalAnim.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          Animated.timing(modalAnim, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true })
            .start(() => setOpenPillar(null));
        } else {
          Animated.spring(modalAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // Trigger staggered card animations + glow when v4 plan loads
  useEffect(() => {
    if (!fitlook?.plan) return;
    cardAnims.forEach(a => { a.opacity.setValue(0); a.translateY.setValue(32); });
    Animated.stagger(600, cardAnims.map(a =>
      Animated.parallel([
        Animated.timing(a.opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(a.translateY, { toValue: 0, duration: 650, useNativeDriver: true }),
      ])
    )).start();
    glowLoop.current?.stop();
    glowAnim.setValue(0.3);
    glowLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 1600, useNativeDriver: true }),
      ])
    );
    glowLoop.current.start();
    ctaSeenAnims.forEach(a => a.setValue(0));
    return () => { glowLoop.current?.stop(); };
  }, [fitlook?.plan]);

  const openPillarModal = (key: 'nutrition' | 'recovery' | 'training') => {
    setOpenPillar(key);
    setSeenPillars(prev => new Set(prev).add(key));
    const idx = PILLARS.findIndex(p => p.key === key);
    Animated.timing(ctaSeenAnims[idx], { toValue: 1, duration: 350, useNativeDriver: true }).start();
    modalAnim.setValue(SCREEN_HEIGHT);
    Animated.spring(modalAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
  };

  const closeModal = () => {
    Animated.timing(modalAnim, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true })
      .start(() => setOpenPillar(null));
  };

  const handleExplainPlan = () => {
    if (!fitlook) return;
    const prompt = buildExplainPlanPrompt(fitlook, feeling);
    // Try direct navigate first; if FitLook is in a nested navigator, bubble up to root tabs
    const nav = navigation.getParent() ?? navigation;
    nav.navigate('FitCoach', { prefilledMessage: prompt, autoSubmit: false });
  };


  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const checkinFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkInitialState();
  }, []);

  async function checkInitialState() {
    // Restore from cache immediately to prevent feeling question flashing on remount
    try {
      const cached = await AsyncStorage.getItem(FITLOOK_CHECKIN_KEY());
      if (cached) {
        const { feeling: cachedFeeling } = JSON.parse(cached);
        setCheckinDone(true);
        setFeeling(cachedFeeling);
        await loadFitLook();
        return;
      }
    } catch { /* ignore cache errors */ }

    try {
      const checkin = await getCheckinToday();
      if (checkin.exists && checkin.feeling) {
        setCheckinDone(true);
        setFeeling(checkin.feeling);
        await AsyncStorage.setItem(FITLOOK_CHECKIN_KEY(), JSON.stringify({ feeling: checkin.feeling })).catch(() => {});
        await loadFitLook();
      } else {
        setCheckinDone(false);
        Animated.timing(checkinFade, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }
    } catch {
      setCheckinDone(false);
      Animated.timing(checkinFade, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }

  async function handleCheckin(selectedFeeling: Feeling) {
    setSavingCheckin(true);
    try {
      await saveCheckin(selectedFeeling);
      setFeeling(selectedFeeling);
      setCheckinDone(true);
      await AsyncStorage.setItem(FITLOOK_CHECKIN_KEY(), JSON.stringify({ feeling: selectedFeeling })).catch(() => {});
      await loadFitLook();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save check-in');
      setSavingCheckin(false);
    }
  }

  async function loadFitLook() {
    setLoading(true);
    setError(null);
    fadeAnim.setValue(0);
    try {
      let data = await getFitLookToday();
      // Auto-upgrade v2 plans (no fuel/protocol/edge) to v3 format
      if (data.snapshot_chips && !data.fuel && !data.protocol && !data.edge && !data.plan) {
        try {
          data = await regenerateFitLook();
        } catch { /* keep v2 if regeneration fails */ }
      }
      // Auto-upgrade old v4 format where plan pillars are string[] instead of {summary, detail}
      if (data.plan && Array.isArray((data.plan.nutrition as any))) {
        try {
          data = await regenerateFitLook();
        } catch { /* keep if regeneration fails */ }
      }
      setFitlook(data);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } catch (e: any) {
      if (e?.needs_checkin) {
        setCheckinDone(false);
        Animated.timing(checkinFade, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load FitLook');
      }
    } finally {
      setLoading(false);
      setSavingCheckin(false);
    }
  }


  const formatDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // ──── Render: Loading initial check ────

  if (checkinDone === null) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // ──── Render: Self-assessment ────

  if (!checkinDone) {
    return (
      <Animated.View style={[styles.centerContainer, { opacity: checkinFade }]}>
        <View style={styles.checkinCard}>
          <Text style={styles.checkinTitle}>How are you feeling today?</Text>
          <Text style={styles.checkinSubtitle}>One tap to start your morning outlook</Text>
          <View style={styles.feelingList}>
            {FEELINGS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={styles.feelingRow}
                activeOpacity={0.7}
                disabled={savingCheckin}
                onPress={() => handleCheckin(f.key)}
              >
                <View style={styles.feelingIconWrap}>
                  <Ionicons name={f.icon as any} size={22} color={colors.accent} />
                </View>
                <Text style={styles.feelingLabel}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {savingCheckin && (
            <View style={styles.checkinLoading}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.checkinLoadingText}>Generating your outlook...</Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  }

  // ──── Render: Loading FitLook ────

  if (loading && !fitlook) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Preparing your morning outlook...</Text>
      </View>
    );
  }

  // ──── Render: Error ────

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.surfaceMute} />
        <Text style={styles.errorText}>Couldn't load your outlook</Text>
        <Text style={styles.errorDetail}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadFitLook}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!fitlook) return null;

  // Legacy v1 format: no snapshot_chips → prompt regeneration
  if (!fitlook.snapshot_chips) {
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>FitLook</Text>
        <Text style={styles.subtitle}>Today's Outlook</Text>
        <View style={styles.legacyCard}>
          <Ionicons name="refresh-circle-outline" size={40} color={colors.accent} />
          <Text style={styles.legacyTitle}>New layout available</Text>
          <Text style={styles.legacyText}>Tap below to refresh your morning outlook.</Text>
          <TouchableOpacity
            style={styles.legacyButton}
            onPress={async () => {
              setLoading(true);
              setError(null);
              try {
                const data = await regenerateFitLook();
                setFitlook(data);
              } catch {
                setError('Failed to refresh');
              } finally {
                setLoading(false);
              }
            }}
          >
            <Text style={styles.legacyButtonText}>Refresh Outlook</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ──── Render: v4 three-pillar layout (falls back to v3/v2 if absent) ────

  const hasV4 = !!fitlook.plan;
  const hasV3 = !hasV4 && !!(fitlook.fuel || fitlook.protocol || fitlook.edge);

  // Chip icon by position: 0=recovery, 1=sleep, 2=feeling
  const chipIcon = (index: number): string => {
    if (index === 0) return 'heart';
    if (index === 1) return 'moon';
    return FEELINGS.find(f => f.key === feeling)?.icon ?? 'ellipse';
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.header}>FitLook</Text>
      <Text style={styles.subtitle}>
        {fitlook.isRestDay ? 'Rest Day' : "Today's Outlook"}
      </Text>
      <Text style={styles.dateText}>{formatDate(fitlook.date_local)}</Text>

      <Animated.View style={[styles.cards, { opacity: fadeAnim }]}>

        {/* Readiness — single-line horizontal pill strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsStrip}
          contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.xs }}
        >
          {fitlook.snapshot_chips.slice(0, 4).map((chip, i) => (
            <View key={i} style={styles.chipPill}>
              <Ionicons name={chipIcon(i) as any} size={13} color={colors.accent} />
              <Text style={styles.chipPillText}>{chip}</Text>
            </View>
          ))}
        </ScrollView>

        {hasV4 ? (
          <>
            {PILLARS.map((pillar, i) => {
              const data = fitlook.plan![pillar.key];
              if (!data) return null;
              const anim = cardAnims[i];
              const isSeen = seenPillars.has(pillar.key);
              return (
                <Animated.View
                  key={pillar.key}
                  style={{ opacity: anim.opacity, transform: [{ translateY: anim.translateY }], marginBottom: spacing.sm }}
                >
                  <View>
                    {!isSeen && (
                      <Animated.View style={[styles.glowBorder, { opacity: glowAnim }]} pointerEvents="none" />
                    )}
                    <TouchableOpacity
                      style={styles.pillarCard}
                      activeOpacity={0.82}
                      onPress={() => openPillarModal(pillar.key)}
                    >
                      <View style={styles.pillarCardHeader}>
                        <View style={styles.pillarIconWrap}>
                          <Ionicons name={pillar.icon as any} size={15} color={colors.accent} />
                        </View>
                        <Text style={styles.pillarCardLabel}>{pillar.label}</Text>
                      </View>
                      {(data.detail ?? []).length > 0 ? (
                        <View style={styles.pillarBulletList}>
                          {(data.detail ?? []).map((action, ai) => (
                            <View key={ai} style={styles.pillarBulletRow}>
                              <View style={styles.pillarBulletDot} />
                              <Text style={styles.pillarBulletText}>
                                {renderBulletText(action, styles.bulletEmphasis, styles.pillarBulletText)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.pillarSummaryText}>{data.summary ?? ''}</Text>
                      )}
                      <Animated.View style={[styles.pillarCtaRow, { opacity: Animated.add(
                          Animated.multiply(glowAnim, ctaSeenAnims[i].interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
                          ctaSeenAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] })
                        ) }]}>
                        <Text style={styles.pillarCtaText}>Full overview</Text>
                        <Ionicons name="chevron-forward" size={12} color={colors.accent} />
                      </Animated.View>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              );
            })}
          </>
        ) : hasV3 ? (
          <>
            {/* v3 legacy: Fuel + Protocol + Edge */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="nutrition-outline" size={15} color={colors.accent} />
                <Text style={styles.cardLabel}>FUEL</Text>
              </View>
              {(fitlook.fuel ?? []).map((item, i) => (
                <View key={i} style={styles.actionRow}>
                  <View style={styles.actionDot} />
                  <Text style={styles.actionText}>{item}</Text>
                </View>
              ))}
            </View>
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="flash-outline" size={15} color={colors.accent} />
                <Text style={styles.cardLabel}>{fitlook.isRestDay ? 'RECOVERY PROTOCOL' : "TODAY'S PROTOCOL"}</Text>
              </View>
              {(fitlook.protocol ?? []).map((step, i) => (
                <View key={i} style={styles.protocolRow}>
                  <View style={styles.protocolTimeTag}>
                    <Text style={styles.protocolTimeText}>{step.time}</Text>
                  </View>
                  <Text style={styles.protocolActionText}>{step.action}</Text>
                </View>
              ))}
            </View>
            {fitlook.edge && (
              <View style={styles.forecastCard}>
                <View style={styles.forecastStripe} />
                <View style={styles.forecastContent}>
                  <Text style={styles.forecastHeading}>YOUR EDGE</Text>
                  <Text style={styles.forecastText}>{fitlook.edge}</Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            {/* v2 fallback layout */}
            {fitlook.focus && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>TODAY'S FOCUS</Text>
                <Text style={styles.focusText}>{fitlook.focus}</Text>
              </View>
            )}

            {(fitlook.do || fitlook.avoid) && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>ACTIONS</Text>
                {fitlook.do && fitlook.do.length > 0 && (
                  <View style={styles.actionSection}>
                    <Text style={styles.actionGroupLabel}>DO</Text>
                    {fitlook.do.map((item, i) => (
                      <View key={i} style={styles.actionRow}>
                        <View style={styles.actionDot} />
                        <Text style={styles.actionText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {fitlook.avoid && (
                  <View style={[styles.actionSection, { marginTop: spacing.sm }]}>
                    <Text style={[styles.actionGroupLabel, styles.avoidLabel]}>AVOID</Text>
                    <View style={styles.actionRow}>
                      <View style={[styles.actionDot, styles.avoidDot]} />
                      <Text style={styles.actionText}>{fitlook.avoid}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {fitlook.forecast_line && (
              <View style={styles.forecastCard}>
                <View style={styles.forecastStripe} />
                <View style={styles.forecastContent}>
                  <Text style={styles.forecastHeading}>To hit today's FitScore forecast:</Text>
                  <Text style={styles.forecastText}>
                    {(() => {
                      const s = fitlook.forecast_line!.replace(/^to hit today['']s\s+(fitscore\s+)?forecast:\s*/i, '').trim();
                      return s.charAt(0).toUpperCase() + s.slice(1);
                    })()}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* CTA — Explain Today's Plan */}
        <TouchableOpacity
          style={styles.explainButton}
          activeOpacity={0.8}
          onPress={handleExplainPlan}
        >
          <Ionicons name="chatbubbles-outline" size={16} color={colors.bgPrimary} />
          <Text style={styles.explainButtonText}>Explain Today's Plan</Text>
        </TouchableOpacity>

        {/* Dev: force regenerate */}
        <TouchableOpacity
          style={styles.regenButton}
          activeOpacity={0.7}
          onPress={async () => {
            setLoading(true);
            setError(null);
            try {
              const data = await regenerateFitLook();
              setFitlook(data);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Failed to regenerate');
            } finally {
              setLoading(false);
            }
          }}
        >
          <Ionicons name="refresh-outline" size={13} color={colors.textMuted} />
          <Text style={styles.regenButtonText}>Regenerate</Text>
        </TouchableOpacity>

        {/* Cached hint */}
        {(fitlook as any).cached && (
          <Text style={styles.cachedHint}>Generated earlier today</Text>
        )}
      </Animated.View>
    </ScrollView>

    {/* Pillar detail bottom sheet */}
    <Modal visible={openPillar !== null} transparent animationType="none" onRequestClose={closeModal}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeModal} />
        <Animated.View style={[styles.modalSheet, { transform: [{ translateY: modalAnim }] }]}>
          <View style={styles.modalDragArea} {...dragPan.panHandlers}>
            <View style={styles.modalHandle} />
          </View>
          {openPillar && (() => {
            const pillar = PILLARS.find(p => p.key === openPillar)!;
            const data = fitlook!.plan![openPillar]!;
            return (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <View style={styles.pillarIconWrap}>
                    <Ionicons name={pillar.icon as any} size={18} color={colors.accent} />
                  </View>
                  <Text style={styles.modalTitle}>{pillar.label}</Text>
                </View>
                {data.summary ? (
                  <Text style={styles.modalContextText}>{data.summary}</Text>
                ) : null}
                {(data.detail ?? []).length > 0 && (
                  <View style={[styles.modalActionList, data.summary ? { marginTop: spacing.lg } : {}]}>
                    <Text style={styles.modalActionLabel}>ACTIONS</Text>
                    {(data.detail ?? []).map((action, i) => (
                      <View key={i} style={styles.modalActionRow}>
                        <View style={styles.modalActionDot} />
                        <Text style={styles.modalActionText}>
                          {renderBulletText(action, styles.modalActionEmphasis, styles.modalActionText)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {openPillar === 'training' && fitlook!.edge && (
                  <View style={styles.modalEdge}>
                    <Text style={styles.modalEdgeLabel}>YOUR EDGE</Text>
                    <Text style={styles.modalEdgeText}>{fitlook!.edge}</Text>
                  </View>
                )}
              </ScrollView>
            );
          })()}
        </Animated.View>
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },

  // Header
  header: {
    ...typography.h1,
    marginBottom: 2,
  },
  subtitle: {
    ...typography.bodyMuted,
    fontSize: 15,
  },
  dateText: {
    ...typography.small,
    color: colors.accent,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
  // Legacy pillar block styles (v3 compat)
  pillarBlock: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMute + '50',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
  },
  pillarLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  pillarText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // v4 pillar cards
  glowBorder: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: radii.lg + 2,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  pillarCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  pillarCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pillarIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarCardLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.8,
    flex: 1,
  },
  pillarSummaryText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
    fontWeight: '500',
  },
  pillarBulletList: {
    gap: spacing.sm,
  },
  pillarBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  pillarBulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 8,
    flexShrink: 0,
  },
  pillarBulletText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    fontWeight: '500',
    flex: 1,
  },
  bulletEmphasis: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  pillarCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceMute + '60',
  },
  pillarCtaText: {
    ...typography.small,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  tapHint: {
    ...typography.small,
    color: colors.accent,
    fontSize: 11,
    marginTop: spacing.sm,
    opacity: 0.7,
  },

  // Bottom sheet modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 40 : spacing.xl,
    maxHeight: SCREEN_HEIGHT * 0.75,
  },
  modalDragArea: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceMute,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.h2,
    letterSpacing: 0.5,
  },
  modalDetailText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  modalContextText: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  modalActionList: {
    gap: spacing.sm,
  },
  modalActionLabel: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  modalActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  modalActionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 9,
    flexShrink: 0,
  },
  modalActionText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
    flex: 1,
  },
  modalActionEmphasis: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 16,
  },
  modalEdge: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMute + '60',
  },
  modalEdgeLabel: {
    ...typography.small,
    color: colors.accent,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  modalEdgeText: {
    ...typography.body,
    color: colors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  yesterdayGreenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  yesterdayGreenText: {
    ...typography.small,
    color: colors.accent,
    flex: 1,
    fontWeight: '500',
  },
  cardLabelMuted: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // Check-in
  checkinCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    ...shadows.card,
  },
  checkinTitle: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  checkinSubtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  feelingList: {
    width: '100%',
    gap: spacing.sm,
  },
  feelingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  feelingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feelingLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  checkinLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  checkinLoadingText: {
    ...typography.bodyMuted,
  },

  // Loading / Error
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  errorDetail: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  retryButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '600',
  },

  // v2 card layout
  cards: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardLabel: {
    ...typography.small,
    fontSize: 11,
    letterSpacing: 1.1,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  // Readiness pill strip (v3)
  chipsStrip: {
    marginBottom: spacing.xs,
  },
  chipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent + '15',
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  chipPillText: {
    ...typography.small,
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '500',
  },

  // Section header row (icon + label)
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },

  // Protocol steps (v3)
  protocolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  protocolTimeTag: {
    backgroundColor: colors.accent + '20',
    borderRadius: radii.sm,
    paddingVertical: 3,
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  protocolTimeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  protocolActionText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 20,
  },

  // A) Readiness — 3-column metrics row (v2 fallback)
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricValue: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },

  // B) Focus — same weight as action items, not a hero headline
  focusText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },

  // C) Actions
  actionSection: {},
  actionGroupLabel: {
    ...typography.small,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.success,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  avoidLabel: {
    color: colors.warning,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  actionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  avoidDot: {
    backgroundColor: colors.warning,
  },
  actionText: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 14,
    flex: 1,
  },

  // D) Forecast — left accent stripe + subtle tinted background
  forecastCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.accent + '0D',
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...shadows.card,
  },
  forecastStripe: {
    width: 3,
    backgroundColor: colors.accent,
  },
  forecastContent: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  forecastHeading: {
    ...typography.small,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  forecastText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },

  // Legacy v1 prompt
  legacyCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    ...shadows.card,
  },
  legacyTitle: {
    ...typography.title,
    textAlign: 'center',
  },
  legacyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  legacyButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  legacyButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '600',
  },

  // CTA button
  explainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  explainButtonText: {
    ...typography.body,
    color: colors.bgPrimary,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },

  // Cached hint
  cachedHint: {
    ...typography.small,
    color: colors.surfaceMute,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: 11,
  },
  regenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  regenButtonText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
});
