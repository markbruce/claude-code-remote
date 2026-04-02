/**
 * Mobile app color theme matching the web app's design system
 * Based on packages/web/src/index.css and tailwind.config.js
 */

export const colors = {
  // Primary blue color palette
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },

  // Background colors
  background: {
    light: '#f9fafb',
    dark: '#030712',
    card: '#ffffff',
    cardDark: '#111827',
  },

  // Text colors
  text: {
    primary: '#111827',
    secondary: '#6b7280',
    light: '#9ca3af',
    darkPrimary: '#f3f4f6',
    darkSecondary: '#d1d5db',
    darkLight: '#9ca3af',
  },

  // Border colors
  border: {
    light: '#e5e7eb',
    dark: '#374151',
    focus: '#3b82f6',
  },

  // Semantic colors
  success: {
    light: '#10b981',
    dark: '#059669',
  },
  warning: {
    light: '#f59e0b',
    dark: '#d97706',
  },
  error: {
    light: '#ef4444',
    dark: '#dc2626',
  },
  info: {
    light: '#3b82f6',
    dark: '#2563eb',
  },

  // Terminal/workspace dark theme
  terminal: {
    background: '#1e1e1e',
    scrollbar: '#4a4a4a',
    scrollbarHover: '#5a5a5a',
  },

  // Scrollbar colors
  scrollbar: {
    trackLight: '#f1f1f1',
    trackDark: '#1f2937',
    thumbLight: '#c1c1c1',
    thumbDark: '#4b5563',
    thumbHoverLight: '#a1a1a1',
    thumbHoverDark: '#6b7280',
  },

  // Overlay/Modal colors
  overlay: {
    light: 'rgba(0, 0, 0, 0.5)',
    dark: 'rgba(0, 0, 0, 0.7)',
  },

  // Status indicators
  status: {
    online: '#10b981',
    offline: '#6b7280',
    connecting: '#f59e0b',
    error: '#ef4444',
  },
};

export type Colors = typeof colors;

/**
 * Get colors based on current color scheme (light/dark)
 */
export function getThemeColors(isDark: boolean): {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
} {
  return {
    background: isDark ? colors.background.dark : colors.background.light,
    card: isDark ? colors.background.cardDark : colors.background.card,
    text: isDark ? colors.text.darkPrimary : colors.text.primary,
    textSecondary: isDark ? colors.text.darkSecondary : colors.text.secondary,
    border: isDark ? colors.border.dark : colors.border.light,
    scrollbarTrack: isDark ? colors.scrollbar.trackDark : colors.scrollbar.trackLight,
    scrollbarThumb: isDark ? colors.scrollbar.thumbDark : colors.scrollbar.thumbLight,
    scrollbarThumbHover: isDark
      ? colors.scrollbar.thumbHoverDark
      : colors.scrollbar.thumbHoverLight,
  };
}
