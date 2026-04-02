/**
 * GlobResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getFileIcon } from '../utils/fileTypeIcons';

interface GlobResultProps {
  pattern: string;
  files: string[];
  isError?: boolean;
}

export const GlobResult: React.FC<GlobResultProps> = memo(({ pattern, files, isError }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = useCallback(() => setExpanded(prev => !prev), []);

  const displayFiles = expanded ? files : files.slice(0, 10);
  const hasMore = files.length > 10;

  return (
    <div className="group flex items-center gap-1.5 border-l-2 border-l-gray-400 dark:border-l-gray-500 my-0.5 py-0.5 pl-3">
      <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">Glob</span>
      <span className="text-[10px] text-gray-300 dark:text-gray-600">/</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">
        {pattern}
      </span>
      <span className="flex-shrink-0 text-[11px] italic text-gray-400 dark:text-gray-500">
        {t('toolResult.fileCount', { count: files.length })}
      </span>
      {hasMore && (
        <button
          onClick={toggleExpand}
          className="flex-shrink-0 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          {expanded ? t('toolResult.collapse') : t('toolResult.expandAll')}
        </button>
      )}

      {/* Expanded file list */}
      {expanded && (
        <div className="fixed left-0 right-0 mt-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-10 max-h-64 overflow-auto">
          {displayFiles.map((file, idx) => {
            const { icon, color, label } = getFileIcon(file);
            const fileName = file.split('/').pop() || file;
            const isDirectory = file.endsWith('/');

            return (
              <div
                key={idx}
                className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors rounded"
              >
                <span className={`text-xs font-bold ${color}`}>{icon}</span>
                <span className={`text-sm font-mono truncate ${
                  isDirectory ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'
                }`}>
                  {fileName}
                </span>
                <span className="text-xs text-gray-400 truncate flex-1">
                  {file}
                </span>
              </div>
            );
          })}
          {files.length === 0 && (
            <div className="p-2 text-center text-gray-500 italic text-xs">
              {t('toolResult.noMatchingFiles')}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

GlobResult.displayName = 'GlobResult';
