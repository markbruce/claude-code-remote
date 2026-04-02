/**
 * CC Remote - Home Screen
 * Main landing screen showing quick access to recent sessions and machines
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, type NativeStackNavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { useMachinesStore } from '../store/machines';
import { useThemeStore } from '../store/theme';
import { colors } from '../theme/colors';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const { isDark } = useThemeStore();
  const { machines, isLoading, fetchMachines, getOnlineMachines } = useMachinesStore();

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

  useEffect(() => {
    // Fetch machines on mount
    // TODO: Get token and API URL from auth store
    // fetchMachines(getToken, getApiUrl);
  }, []);

  const onlineMachines = getOnlineMachines();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>CC Remote</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Connect to your remote development environments
        </Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => navigation.navigate('Machines')}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.primary[500] + '20' }]}>
              <Text style={[styles.actionEmoji, { color: colors.primary[600] }]}>🖥️</Text>
            </View>
            <Text style={[styles.actionLabel, { color: theme.text }]}>Machines</Text>
            <Text style={[styles.actionCount, { color: theme.textSecondary }]}>
              {machines.length} connected
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => navigation.navigate('Settings')}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.info.light + '20' }]}>
              <Text style={[styles.actionEmoji, { color: colors.info.light }]}>⚙️</Text>
            </View>
            <Text style={[styles.actionLabel, { color: theme.text }]}>Settings</Text>
            <Text style={[styles.actionCount, { color: theme.textSecondary }]}>
              Configure app
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Online Machines */}
      {onlineMachines.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Online Now</Text>
          {onlineMachines.slice(0, 3).map((machine) => (
            <TouchableOpacity
              key={machine.id}
              style={[styles.machineCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() =>
                navigation.navigate('Projects', {
                  machineId: machine.id,
                  machineName: machine.name,
                })
              }
            >
              <View style={styles.machineInfo}>
                <View style={[styles.statusDot, { backgroundColor: colors.status.online }]} />
                <Text style={[styles.machineName, { color: theme.text }]}>{machine.name}</Text>
              </View>
              <Text style={[styles.machinePath, { color: theme.textSecondary }]}>
                {machine.host}:{machine.port}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Loading State */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading machines...</Text>
        </View>
      )}

      {/* Empty State */}
      {!isLoading && machines.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyEmoji]}>🔌</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Machines Yet</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Add your first machine to get started
          </Text>
          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: colors.primary[600] }]}
            onPress={() => navigation.navigate('Machines')}
          >
            <Text style={styles.emptyButtonText}>Add Machine</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    marginBottom: 32,
    paddingTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionEmoji: {
    fontSize: 24,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  actionCount: {
    fontSize: 13,
  },
  machineCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  machineInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  machineName: {
    fontSize: 16,
    fontWeight: '600',
  },
  machinePath: {
    fontSize: 14,
    marginLeft: 16,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
