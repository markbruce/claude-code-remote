/**
 * CC Remote - Projects Screen
 * Displays list of projects for a selected machine
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, type NativeStackNavigationProp } from '@react-navigation/native';
import type { RootStackParamList, ProjectsScreenParams } from '../navigation/types';
import { useProjectsStore } from '../store/projects';
import { useAuthStore } from '../store/auth';
import { useSocketStore } from '../store/socket';
import { useThemeStore } from '../store/theme';
import { colors } from '../theme/colors';
import { useMachinesStore } from '../store/machines';
import { getStoredApiUrl } from '../store/auth';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ProjectsScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const { isDark } = useThemeStore();
  const params = route.params as ProjectsScreenParams;

  const { machineId, machineName } = params;
  const { socket } = useSocketStore();
  const { getMachineById } = useMachinesStore();
  const { token } = useAuthStore();
  const { getProjectsByMachine, fetchProjects, isLoading, error, scanProjects } = useProjectsStore();

  const machine = getMachineById(machineId);
  const projects = getProjectsByMachine(machineId);

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
    // Load projects when screen mounts
    loadProjects();

    // Set up header
    navigation.setOptions({
      title: machineName || machine?.name || 'Projects',
    });
  }, [machineId]);

  const loadProjects = async () => {
    try {
      await fetchProjects(
        machineId,
        () => token,
        getStoredApiUrl
      );
    } catch (err) {
      // Silent fail, will show empty state
    }
  };

  const handleRefresh = () => {
    if (socket) {
      scanProjects(
        machineId,
        socket.emit.bind(socket),
        socket.on.bind(socket),
        socket.off.bind(socket),
        true
      );
    }
  };

  const handleProjectPress = (project: typeof projects[0]) => {
    navigation.navigate('Chat', {
      sessionId: '', // Will start new session
      projectId: project.id || project.path,
      projectName: project.name,
      machineId,
    });
  };

  const renderProject = ({ item }: { item: typeof projects[0] }) => (
    <TouchableOpacity
      style={[styles.projectCard, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => handleProjectPress(item)}
    >
      <View style={styles.projectHeader}>
        <View style={styles.projectIconContainer}>
          <Text style={styles.projectIcon}>📁</Text>
        </View>
        <View style={styles.projectInfo}>
          <Text style={[styles.projectName, { color: theme.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.projectPath, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.path}
          </Text>
        </View>
      </View>
      {item.last_accessed && (
        <Text style={[styles.lastAccessed, { color: theme.textSecondary }]}>
          Last accessed: {new Date(item.last_accessed).toLocaleDateString()}
        </Text>
      )}
      {item.last_scanned && (
        <Text style={[styles.lastScanned, { color: theme.textSecondary }]}>
          Scanned: {new Date(item.last_scanned).toLocaleString()}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header with Refresh */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Projects</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {projects.length} projects found
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: theme.card }]}
            onPress={handleRefresh}
            disabled={isLoading}
          >
            <ActivityIndicator
              size="small"
              color={isLoading ? colors.primary[600] : theme.textSecondary}
              animating={isLoading}
            />
            {!isLoading && <Text style={[styles.refreshText, { color: theme.textSecondary }]}>Refresh</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Projects List */}
      {isLoading && projects.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading projects...</Text>
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📂</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Projects Found</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Tap Refresh to scan for projects on this machine
          </Text>
          <TouchableOpacity
            style={[styles.emptyActionButton, { backgroundColor: colors.primary[600] }]}
            onPress={handleRefresh}
          >
            <Text style={styles.emptyActionText}>Scan for Projects</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id || item.path}
          renderItem={renderProject}
          contentContainerStyle={styles.listContent}
          refreshing={isLoading}
          onRefresh={loadProjects}
        />
      )}

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.error.light + '20' }]}>
          <Text style={[styles.errorText, { color: colors.error.light }]}>{error}</Text>
        </View>
      )}
    </View>
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
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  refreshText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  projectCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  projectIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary[600] + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  projectIcon: {
    fontSize: 22,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  projectPath: {
    fontSize: 13,
  },
  lastAccessed: {
    fontSize: 12,
    marginTop: 8,
  },
  lastScanned: {
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyActionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorBanner: {
    padding: 16,
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
  },
});
