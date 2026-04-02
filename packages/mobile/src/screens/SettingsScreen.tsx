/**
 * CC Remote - Settings Screen
 * App settings and configuration
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import { useThemeStore } from '../store/theme';
import { colors } from '../theme/colors';

interface SettingItem {
  id: string;
  label: string;
  type: 'toggle' | 'navigation' | 'action';
  value?: boolean;
  onPress?: () => void;
  icon: string;
}

export function SettingsScreen({ showLogout }: { showLogout?: boolean }): React.JSX.Element {
  const { isDark, toggleTheme } = useThemeStore();

  const theme = isDark
    ? {
        background: colors.background.dark,
        card: colors.background.cardDark,
        text: colors.text.darkPrimary,
        textSecondary: colors.text.darkSecondary,
        border: colors.border.dark,
      }
    : {
        background: colors.background.light,
        card: colors.background.card,
        text: colors.text.primary,
        textSecondary: colors.text.secondary,
        border: colors.border.light,
      };

  const settingsGroups: SettingItem[][] = [
    [
      {
        id: 'darkMode',
        label: 'Dark Mode',
        type: 'toggle',
        value: isDark,
        onPress: toggleTheme,
        icon: '🌙',
      },
      {
        id: 'notifications',
        label: 'Notifications',
        type: 'toggle',
        value: true,
        onPress: () => console.log('Notifications toggle'),
        icon: '🔔',
      },
    ],
    [
      {
        id: 'server',
        label: 'Server Settings',
        type: 'navigation',
        onPress: () => console.log('Navigate to server settings'),
        icon: '🖥️',
      },
      {
        id: 'sshKeys',
        label: 'SSH Keys',
        type: 'navigation',
        onPress: () => console.log('Navigate to SSH keys'),
        icon: '🔑',
      },
    ],
    [
      {
        id: 'about',
        label: 'About',
        type: 'navigation',
        onPress: () => console.log('Navigate to about'),
        icon: 'ℹ️',
      },
      {
        id: 'help',
        label: 'Help & Support',
        type: 'navigation',
        onPress: () => console.log('Navigate to help'),
        icon: '❓',
      },
    ],
  ];

  const renderSettingItem = (item: SettingItem) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.settingItem, { borderBottomColor: theme.border }]}
      onPress={item.onPress}
      activeOpacity={item.type === 'toggle' ? 1 : 0.7}
      disabled={item.type === 'toggle'}
    >
      <View style={styles.settingLeft}>
        <Text style={[styles.settingIcon, { marginRight: 12 }]}>{item.icon}</Text>
        <Text style={[styles.settingLabel, { color: theme.text }]}>{item.label}</Text>
      </View>
      {item.type === 'toggle' ? (
        <Switch
          value={item.value}
          onValueChange={item.onPress}
          trackColor={{ false: colors.text.light, true: colors.primary[400] }}
          thumbColor={item.value ? colors.primary[600] : colors.text.secondary}
        />
      ) : (
        <Text style={[styles.settingArrow, { color: theme.textSecondary }]}>›</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
      </View>

      {/* Settings Groups */}
      {settingsGroups.map((group, groupIndex) => (
        <View
          key={groupIndex}
          style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          {group.map(renderSettingItem)}
        </View>
      ))}

      {/* Version Info */}
      <View style={[styles.versionContainer, { borderColor: theme.border }]}>
        <Text style={[styles.versionText, { color: theme.textSecondary }]}>
          CC Remote v1.0.0
        </Text>
        <Text style={[styles.versionSubtext, { color: theme.textSecondary }]}>
          Built with React Native & Expo
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  group: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    fontSize: 20,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingArrow: {
    fontSize: 20,
    fontWeight: '300',
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    marginTop: 20,
    borderTopWidth: 1,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  versionSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
});
