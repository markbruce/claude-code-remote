/**
 * CC Remote - Navigation Theme
 * Provides consistent theming for React Navigation
 */

import { useThemeStore } from '../store/theme';
import { colors } from './colors';

/**
 * Get navigation theme based on current color scheme
 */
export function getNavigationTheme() {
  const { isDark } = useThemeStore.getState();

  return {
    headerStyle: {
      backgroundColor: isDark ? colors.background.cardDark : colors.background.card,
    },
    headerTintColor: isDark ? colors.text.darkPrimary : colors.text.primary,
    headerTitleStyle: {
      fontWeight: '600',
      fontSize: 17,
    },
    headerShadowVisible: false,
    contentStyle: {
      backgroundColor: isDark ? colors.background.dark : colors.background.light,
    },
    cardStyle: {
      backgroundColor: isDark ? colors.background.dark : colors.background.light,
    },
  };
}

/**
 * Get tab bar style for bottom navigation
 */
export function getTabBarStyle(isActive: boolean, isDark: boolean) {
  return {
    color: isActive ? colors.primary[600] : isDark ? colors.text.darkSecondary : colors.text.secondary,
  };
}
