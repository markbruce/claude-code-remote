import React, { memo } from 'react';
import { getFileIcon } from '../utils/fileTypeIcons';

interface ClickablePathProps {
  path: string;
  className?: string;
  showIcon?: boolean;
  onFileClick?: (path: string) => void;
}

export const ClickablePath: React.FC<ClickablePathProps> = memo(({ path, className = '', showIcon = true, onFileClick }) => {
  const handleClick = () => {
    onFileClick?.(path);
  };

  const fileName = path.split('/').pop() || path;
  const isDirectory = path.endsWith('/');
  const { icon, color } = getFileIcon(fileName, isDirectory);

  return (
    <span
      className={`inline-flex items-center gap-1.5 cursor-pointer hover:underline ${className}`}
      onClick={handleClick}
      title={path}
    >
      {showIcon && (
        <span className={`text-xs font-bold ${color}`}>{icon}</span>
      )}
      <span className="text-sm font-mono text-blue-600 dark:text-blue-400">
        {fileName}
      </span>
    </span>
  );
});

ClickablePath.displayName = 'ClickablePath';
