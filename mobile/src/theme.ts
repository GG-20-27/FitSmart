/**
 * FitScore AI - Global Theme (Green-Gray Palette)
 *
 * Semantic design tokens for consistent theming across the app.
 * Based on the FitSmart 2025 design system.
 */

export const colors = {
  // Core palette
  bgPrimary:   '#051824', // app background
  bgSecondary: '#162936', // cards/surfaces/input
  accent:      '#27E9B5', // CTAs, active, highlights (teal-green)
  surfaceMute: '#3B5265', // borders, dividers, disabled
  textPrimary: '#FFFFFF', // headings / body
  textMuted:   '#B0C2CC', // timestamps, sublabels
  success:     '#10B981', // green
  warning:     '#F59E0B', // amber
  danger:      '#EF4444', // red

  // Optional gradient for hero/headers/progress
  accentGradStart: '#27E9B5',
  accentGradEnd:   '#3B5265',
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  soft: {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3
  },
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.textPrimary },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.textPrimary },
  title: { fontSize: 18, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 16, color: colors.textPrimary },
  bodyMuted: { fontSize: 14, color: colors.textMuted },
  small: { fontSize: 12, color: colors.textMuted },
};

// FitScore state mapping (used across app for recovery/readiness)
export const state = {
  ready:   colors.success, // green (70-100% recovery)
  monitor: colors.warning, // yellow (40-69% recovery)
  rest:    colors.danger,  // red (0-39% recovery)
};

// Export combined theme object
export const theme = {
  colors,
  radii,
  spacing,
  shadows,
  typography,
  state,
};

export default theme;
