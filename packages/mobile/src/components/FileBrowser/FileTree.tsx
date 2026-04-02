/**
 * CC Remote - File Tree Component
 * Displays file/folder tree with expandable folders and file icons
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { useThemeStore } from '../../store/theme';
import type { FileTreeItem } from 'cc-remote-shared';

interface Props {
  items: FileTreeItem[];
  onFilePress?: (path: string) => void;
  onFolderPress?: (path: string) => void;
  maxHeight?: number;
}

interface FileNodeProps {
  item: FileTreeItem;
  level: number;
  onFilePress?: (path: string) => void;
  onFolderPress?: (path: string) => void;
}

function getFileIcon(filename: string, isDirectory: boolean): string {
  if (isDirectory) {
    return '📁';
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return '📜';
    case 'py':
      return '🐍';
    case 'java':
    case 'kt':
      return '☕';
    case 'go':
      return '🐹';
    case 'rs':
      return '🦀';
    case 'cpp':
    case 'c':
    case 'cc':
    case 'h':
    case 'hpp':
      return '⚙️';
    case 'html':
    case 'htm':
      return '🌐';
    case 'css':
    case 'scss':
    case 'sass':
      return '🎨';
    case 'json':
      return '📋';
    case 'md':
      return '📝';
    case 'txt':
      return '📄';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'ico':
      return '🖼️';
    case 'pdf':
      return '📕';
    case 'zip':
    case 'tar':
    case 'gz':
    case 'rar':
    case '7z':
      return '📦';
    case 'env':
    case 'config':
    case 'conf':
      return '⚙️';
    default:
      return '📄';
  }
}

function FileNode({ item, level, onFilePress, onFolderPress }: FileNodeProps): React.JSX.Element {
  const isDark = useThemeStore((state) => state.isDark);

  const theme = {
    text: isDark ? colors.text.darkPrimary : colors.text.primary,
    textSecondary: isDark ? colors.text.darkSecondary : colors.text.secondary,
    hover: isDark ? colors.border.dark : colors.border.light,
  };

  const [isExpanded, setIsExpanded] = useState(level === 0);
  const isDirectory = item.type === 'directory';
  const hasChildren = isDirectory && item.children && item.children.length > 0;

  const toggleExpand = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
    if (onFolderPress) {
      onFolderPress(item.path);
    }
  };

  const handlePress = () => {
    if (isDirectory) {
      toggleExpand();
    } else if (onFilePress) {
      onFilePress(item.path);
    }
  };

  const paddingLeft = 16 + level * 20;

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.node,
          {
            paddingLeft,
            backgroundColor: isExpanded ? theme.hover : 'transparent',
          },
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {hasChildren && (
          <Text style={[styles.chevron, { color: theme.textSecondary }]}>
            {isExpanded ? '▼' : '▶'}
          </Text>
        )}
        {!hasChildren && <View style={styles.chevronPlaceholder} />}
        <Text style={styles.icon}>{getFileIcon(item.name, isDirectory)}</Text>
        <Text style={[styles.filename, { color: theme.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        {hasChildren && (
          <Text style={[styles.count, { color: theme.textSecondary }]}>
            ({item.children?.length})
          </Text>
        )}
      </TouchableOpacity>

      {isExpanded && hasChildren && item.children && (
        <View>
          {item.children.map((child) => (
            <FileNode
              key={child.path}
              item={child}
              level={level + 1}
              onFilePress={onFilePress}
              onFolderPress={onFolderPress}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function FileTree({ items, onFilePress, onFolderPress, maxHeight }: Props): React.JSX.Element {
  const isDark = useThemeStore((state) => state.isDark);

  const theme = {
    background: isDark ? colors.background.cardDark : colors.background.card,
    border: isDark ? colors.border.dark : colors.border.light,
  };

  const content = (
    <View style={[styles.container, { backgroundColor: theme.background, borderColor: theme.border }]}>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📂</Text>
          <Text style={styles.emptyText}>No files found</Text>
        </View>
      ) : (
        items.map((item) => (
          <FileNode
            key={item.path}
            item={item}
            level={0}
            onFilePress={onFilePress}
            onFolderPress={onFolderPress}
          />
        ))
      )}
    </View>
  );

  if (maxHeight) {
    return (
      <ScrollView style={{ maxHeight }} nestedScrollEnabled>
        {content}
      </ScrollView>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  node: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 16,
    gap: 8,
  },
  chevron: {
    fontSize: 10,
    width: 16,
    textAlign: 'center',
  },
  chevronPlaceholder: {
    width: 16,
  },
  icon: {
    fontSize: 16,
  },
  filename: {
    flex: 1,
    fontSize: 14,
  },
  count: {
    fontSize: 12,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
});
