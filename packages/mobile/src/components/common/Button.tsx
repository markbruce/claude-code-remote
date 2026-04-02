/**
 * CC Remote - Button Component
 * Reusable button with variants: primary, secondary, danger
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useThemeStore } from '../../store/theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'small' | 'medium' | 'large';

interface Props extends Omit<TouchableOpacityProps, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  isDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: string | React.JSX.Element | React.JSX.Element[];
}

export function Button({
  variant = 'primary',
  size = 'medium',
  isLoading = false,
  isDisabled = false,
  style,
  children,
  ...rest
}: Props): React.JSX.Element {
  const isDark = useThemeStore((state) => state.isDark);

  const theme = {
    primary: colors.primary[600],
    primaryDark: colors.primary[800],
    secondary: isDark ? colors.background.cardDark : colors.background.light,
    danger: colors.error.light,
    text: isDark ? colors.text.darkPrimary : colors.text.primary,
    textSecondary: isDark ? colors.text.darkSecondary : colors.text.secondary,
    border: isDark ? colors.border.dark : colors.border.light,
  };

  const getSizeStyles = (): { paddingVertical: number; paddingHorizontal: number; fontSize: number; minHeight: number } => {
    switch (size) {
      case 'small':
        return { paddingVertical: 8, paddingHorizontal: 16, fontSize: 14, minHeight: 36 };
      case 'large':
        return { paddingVertical: 16, paddingHorizontal: 24, fontSize: 16, minHeight: 56 };
      case 'medium':
      default:
        return { paddingVertical: 12, paddingHorizontal: 20, fontSize: 15, minHeight: 44 };
    }
  };

  const sizeStyles = getSizeStyles();

  const getVariantStyles = (): { backgroundColor: string; borderColor: string; textColor: string; borderWidth?: number } => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: theme.secondary,
          borderColor: theme.border,
          textColor: theme.text,
          borderWidth: 1,
        };
      case 'danger':
        return {
          backgroundColor: theme.danger,
          borderColor: theme.danger,
          textColor: '#ffffff',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          textColor: theme.text,
        };
      case 'primary':
      default:
        return {
          backgroundColor: theme.primary,
          borderColor: theme.primary,
          textColor: '#ffffff',
        };
    }
  };

  const variantStyles = getVariantStyles();
  const disabled = isDisabled || isLoading || rest.disabled;

  const buttonStyle: ViewStyle = {
    backgroundColor: disabled ? colors.text.light : variantStyles.backgroundColor,
    borderColor: disabled ? colors.text.light : variantStyles.borderColor,
    borderWidth: variantStyles.borderWidth ?? 0,
    paddingVertical: sizeStyles.paddingVertical,
    paddingHorizontal: sizeStyles.paddingHorizontal,
    minHeight: sizeStyles.minHeight,
    opacity: disabled ? 0.6 : 1,
  };

  const content = isLoading ? (
    <ActivityIndicator color={variantStyles.textColor} size="small" />
  ) : (
    <Text
      style={[
        styles.text,
        {
          color: disabled ? colors.text.light : variantStyles.textColor,
          fontSize: sizeStyles.fontSize,
        },
      ]}
      numberOfLines={1}
    >
      {children}
    </Text>
  );

  return (
    <View style={style}>
      <TouchableOpacity
        style={[styles.button, buttonStyle]}
        disabled={disabled}
        activeOpacity={0.8}
        {...rest}
      >
        {content}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
