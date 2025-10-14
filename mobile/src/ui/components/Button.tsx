/**
 * Button Component - Themed buttons with variants
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';

interface ButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  onPress,
  children,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}: ButtonProps) {
  const buttonStyles = [
    styles.button,
    styles[variant],
    disabled && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.text,
    styles[`${variant}Text` as keyof typeof styles],
    disabled && styles.disabledText,
    textStyle,
  ];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={buttonStyles}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.bgPrimary : colors.accent} />
      ) : (
        <Text style={textStyles}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44, // Accessibility touch target
  },
  text: {
    ...typography.body,
    fontWeight: '600',
  },

  // Primary variant (accent background)
  primary: {
    backgroundColor: colors.accent,
  },
  primaryText: {
    color: colors.bgPrimary,
  },

  // Secondary variant (muted background)
  secondary: {
    backgroundColor: colors.surfaceMute,
  },
  secondaryText: {
    color: colors.textPrimary,
  },

  // Danger variant (red background)
  danger: {
    backgroundColor: colors.danger,
  },
  dangerText: {
    color: '#FFFFFF',
  },

  // Ghost variant (transparent with border)
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.surfaceMute,
  },
  ghostText: {
    color: colors.accent,
  },

  // Disabled state
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.7,
  },
});
