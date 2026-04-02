/**
 * FileEditResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { useState, useCallback, memo } from 'react';
import { DiffViewer } from '../../DiffViewer';

interface FileEditResultProps {
  filePath: string;
  oldContent: string;
  newContent: string;
}

export const FileEditResult: React.FC<FileEditResultProps> = memo(({ filePath, oldContent, newContent }) => {
  const [expanded, setExpanded] = useState(false);

  // Simple diff calculation
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const addedCount = Math.max(0, newLines.length - oldLines.length);
  const removedCount = Math.max(0, oldLines.length - newLines.length);
  const filename = filePath.split('/').pop() || filePath;

  const toggleExpand = useCallback(() => setExpanded(prev => !prev), []);

  return (
    <div className="border-l-2 border-l-amber-500 dark:border-l-amber-400 my-1 py-0.5 pl-3">
      {/* Collapsible header using details/summary like claudecodeui */}
      <details className="group/details relative" open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}>
        <summary className="flex cursor-pointer select-none items-center gap-1.5 py-0.5 text-xs">
          <svg
            className="h-3 w-3 flex-shrink-0 text-gray-400 transition-transform duration-150 group-open/details:rotate-90 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="flex-shrink-0 font-medium text-gray-500 dark:text-gray-400">Edit</span>
          <span className="flex-shrink-0 text-[10px] text-gray-300 dark:text-gray-600">/</span>
          <span className="flex-1 truncate text-gray-600 dark:text-gray-400 font-mono">
            {filename}
          </span>
          <span className="flex-shrink-0 text-xs text-green-600 dark:text-green-400">+{addedCount}</span>
          <span className="flex-shrink-0 text-xs text-red-600 dark:text-red-400">-{removedCount}</span>
        </summary>
        <div className="mt-1.5 pl-[18px]">
          <DiffViewer
            oldContent={oldContent}
            newContent={newContent}
            filename={filePath}
            maxHeight="300px"
          />
        </div>
      </details>
    </div>
  );
});

FileEditResult.displayName = 'FileEditResult';
