/**
 * CC Remote - Loading Component
 * Loading spinner with optional message
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { colors } from '../../theme/colors';
import { useThemeStore } from '../../store/theme';

interface Props {
  isVisible?: boolean;
  message?: string;
  size?: 'small' | 'large';
  color?: string;
}

export function Loading({ isVisible = true, message, size = 'large', color }: Props): React.JSX.Element {
  const isDark = useThemeStore((state) => state.isDark);

  const theme = {
    overlay: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)',
    text: isDark ? colors.text.darkPrimary : colors.text.primary,
  };

  const spinnerColor = color ?? colors.primary[600];

  const content = (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={spinnerColor} />
      {message && (
        <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
      )}
    </View>
  );

  if (isVisible) {
    return (
      <Modal transparent visible={isVisible} animationType="none">
        <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
          {content}
        </View>
      </Modal>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
});

/**
 * Inline loading indicator (small, without modal)
 */
export function LoadingSpinner({ size = 'small', color }: { size?: 'small' | 'large'; color?: string }): React.JSX.Element {
  return <ActivityIndicator size={size} color={color ?? colors.primary[600]} />;
}

/**
 * Dots loading animation
 */
export function LoadingDots({ isDark }: { isDark?: boolean }): React.JSX.Element {
  const themeStore = useThemeStore();
  const dark = isDark ?? themeStore.isDark;

  const theme = {
    dot: dark ? colors.text.darkSecondary : colors.text.secondary,
  };

  return (
    <View style={dotsStyles.dotsContainer}>
      <View style={[dotsStyles.dot, dotsStyles.dot1, { backgroundColor: theme.dot }]} />
      <View style={[dotsStyles.dot, dotsStyles.dot2, { backgroundColor: theme.dot }]} />
      <View style={[dotsStyles.dot, dotsStyles.dot3, { backgroundColor: theme.dot }]} />
    </View>
  );
}

const dotsStyles = StyleSheet.create({
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dot1: {
    // Animation would be added with Animated API
  },
  dot2: {},
  dot3: {},
});
