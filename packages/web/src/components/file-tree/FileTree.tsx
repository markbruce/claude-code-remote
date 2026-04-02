import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FileTreeNode } from './FileTreeNode';
import { useFileTree } from './hooks/useFileTree';
import type { FileTreeProps, FileNode } from './types';

export const FileTree: React.FC<FileTreeProps> = ({
  rootPath,
  machineId,
  onFileSelect,
  onFileDoubleClick,
  selectedFile,
  maxHeight = '100%',
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const { tree, isLoading, error } = useFileTree(rootPath, machineId);
  const { t } = useTranslation();

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback((node: FileNode) => {
    if (node.type === 'file') {
      onFileSelect(node.path);
    }
  }, [onFileSelect]);

  const handleDoubleClick = useCallback((node: FileNode) => {
    if (node.type === 'file' && onFileDoubleClick) {
      onFileDoubleClick(node.path);
    }
  }, [onFileDoubleClick]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400">
        <span>{t('files.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-32 text-red-400">
        <span>{error}</span>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400">
        <span>{t('files.noFiles')}</span>
      </div>
    );
  }

  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <FileTreeNode
        node={tree}
        level={0}
        selectedPath={selectedFile}
        onSelect={handleSelect}
        onDoubleClick={handleDoubleClick}
        onToggle={handleToggle}
        expandedPaths={expandedPaths}
      />
    </div>
  );
};
