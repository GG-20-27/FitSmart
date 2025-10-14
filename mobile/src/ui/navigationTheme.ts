/**
 * React Navigation Theme
 * Maps FitScore design tokens to React Navigation theme
 */

import { DefaultTheme, Theme } from '@react-navigation/native';
import { colors } from '../theme';

export const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bgPrimary,
    card: colors.bgPrimary,
    text: colors.textPrimary,
    border: colors.surfaceMute,
    primary: colors.accent,
    notification: colors.accent,
  },
};
