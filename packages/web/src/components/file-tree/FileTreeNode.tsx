import React from 'react';
import type { FileNode } from './types';

interface FileTreeNodeProps {
  node: FileNode;
  level: number;
  selectedPath?: string;
  onSelect: (node: FileNode) => void;
  onDoubleClick?: (node: FileNode) => void;
  onToggle: (path: string) => void;
  expandedPaths: Set<string>;
}

const FILE_ICONS: Record<string, string> = {
  ts: 'TS',
  tsx: 'TSX',
  js: 'JS',
  jsx: 'JSX',
  json: '{}',
  md: 'MD',
  css: 'CSS',
  html: 'HTML',
};

const getFileIcon = (name: string, isDirectory: boolean): string => {
  if (isDirectory) return '📁';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || '📄';
};

const getFileColor = (name: string, isDirectory: boolean): string => {
  if (isDirectory) return 'text-yellow-600';
  const ext = name.split('.').pop()?.toLowerCase();
  if (['ts', 'tsx'].includes(ext || '')) return 'text-blue-600';
  if (['js', 'jsx'].includes(ext || '')) return 'text-yellow-500';
  if (ext === 'json') return 'text-green-600';
  if (ext === 'md') return 'text-gray-600';
  return 'text-gray-500';
};

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  level,
  selectedPath,
  onSelect,
  onDoubleClick,
  onToggle,
  expandedPaths,
}) => {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-0.5 px-2 cursor-pointer hover:bg-gray-100 rounded text-sm ${
          isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (node.type === 'directory') {
            onToggle(node.path);
          }
          onSelect(node);
        }}
        onDoubleClick={() => {
          if (node.type === 'file') {
            onDoubleClick?.(node);
          }
        }}
      >
        {node.type === 'directory' && (
          <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        )}
        <span className={getFileColor(node.name, node.type === 'directory')}>
          {getFileIcon(node.name, node.type === 'directory')}
        </span>
        <span className="truncate">{node.name}</span>
      </div>

      {node.type === 'directory' && isExpanded && node.children?.map((child) => (
        <FileTreeNode
          key={child.path}
          node={child}
          level={level + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onDoubleClick={onDoubleClick}
          onToggle={onToggle}
          expandedPaths={expandedPaths}
        />
      ))}
    </div>
  );
};
