/**
 * CC Remote - File Browser Screen
 * Browse and view files in a project
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, type NativeStackNavigationProp } from '@react-navigation/native';
import type { RootStackParamList, FileBrowserScreenParams } from '../navigation/types';
import { useThemeStore } from '../store/theme';
import { colors } from '../theme/colors';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

export function FileBrowserScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const { isDark } = useThemeStore();
  const { projectName, initialPath } = (route.params as FileBrowserScreenParams) || {};

  const [currentPath, setCurrentPath] = useState(initialPath || '/');
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

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

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const renderTreeNode = (node: FileTreeNode, depth: number = 0): React.JSX.Element => {
    const isExpanded = expandedDirs.has(node.path);
    const paddingLeft = 16 + depth * 20;

    const getFileIcon = (filename: string): string => {
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const icons: Record<string, string> = {
        ts: '📘',
        tsx: '⚛️',
        js: '📜',
        jsx: '⚛️',
        json: '📋',
        css: '🎨',
        html: '🌐',
        md: '📝',
        py: '🐍',
        rs: '🦀',
        go: '🐹',
      };
      return icons[ext] || '📄';
    };

    return (
      <View key={node.path}>
        <TouchableOpacity
          style={[styles.treeNode, { paddingLeft }]}
          onPress={() => {
            if (node.type === 'directory') {
              toggleDir(node.path);
            } else {
              // TODO: Open file
              console.log('Open file:', node.path);
            }
          }}
        >
          {node.type === 'directory' && (
            <Text style={[styles.chevron, { color: theme.textSecondary }]}>
              {isExpanded ? '▼' : '▶'}
            </Text>
          )}
          <Text style={[styles.fileIcon, { marginRight: 8 }]}>
            {node.type === 'directory' ? '📁' : getFileIcon(node.name)}
          </Text>
          <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
            {node.name}
          </Text>
        </TouchableOpacity>
        {node.type === 'directory' && isExpanded && node.children && (
          <View>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {projectName || 'Files'}
        </Text>
        <Text style={[styles.path, { color: theme.textSecondary }]} numberOfLines={1}>
          {currentPath}
        </Text>
      </View>

      {/* File Tree */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading files...</Text>
        </View>
      ) : fileTree.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyEmoji]}>📄</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Files</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            This directory is empty
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.treeContainer}>
          {fileTree.map((node) => renderTreeNode(node))}
        </ScrollView>
      )}

      {/* Breadcrumb Navigation */}
      <View style={[styles.breadcrumb, { borderTopColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.breadcrumbContent}>
            <TouchableOpacity
              onPress={() => setCurrentPath('/')}
              style={styles.breadcrumbItem}
            >
              <Text style={[styles.breadcrumbText, { color: colors.primary[600] }]}>
                Root
              </Text>
            </TouchableOpacity>
            <Text style={[styles.breadcrumbSeparator, { color: theme.textSecondary }]}>
              {' '}
              /{' '}
            </Text>
            <Text style={[styles.breadcrumbText, { color: theme.text }]}>
              {currentPath}
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  path: {
    fontSize: 13,
  },
  treeContainer: {
    flex: 1,
  },
  treeNode: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    minHeight: 44,
  },
  chevron: {
    fontSize: 10,
    width: 16,
    marginRight: 4,
  },
  fileIcon: {
    fontSize: 18,
  },
  fileName: {
    fontSize: 15,
    flex: 1,
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
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
    marginTop: -60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
  },
  breadcrumb: {
    padding: 12,
    borderTopWidth: 1,
  },
  breadcrumbContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbItem: {
    flexDirection: 'row',
  },
  breadcrumbText: {
    fontSize: 14,
  },
  breadcrumbSeparator: {
    fontSize: 14,
  },
});
