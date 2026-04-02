/**
 * CC Remote - Theme Store
 * Manages dark/light mode theme state
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  (set) => ({
    isDark: false,
    toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
    setTheme: (isDark) => set({ isDark }),
  })
);

// Theme colors based on mode
export const useThemeColors = () => {
  const isDark = useThemeStore((state) => state.isDark);

  return {
    isDark,
    background: isDark ? '#0a0a0a' : '#ffffff',
    surface: isDark ? '#1a1a1a' : '#f5f5f5',
    surfaceVariant: isDark ? '#252525' : '#e5e5e5',
    text: isDark ? '#ffffff' : '#000000',
    textSecondary: isDark ? '#a0a0a0' : '#666666',
    primary: isDark ? '#7c3aed' : '#6366f1',
    primaryLight: isDark ? '#a78bfa' : '#818cf8',
    border: isDark ? '#333333' : '#e0e0e0',
    error: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
  };
};
