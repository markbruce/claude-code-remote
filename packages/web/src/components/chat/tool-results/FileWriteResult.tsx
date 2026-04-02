/**
 * FileWriteResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';

interface FileWriteResultProps {
  filePath: string;
  content: string;
}

export const FileWriteResult: React.FC<FileWriteResultProps> = memo(({ filePath, content }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);

  const size = new Blob([content]).size;
  const sizeKB = (size / 1024).toFixed(1);
  const filename = filePath.split('/').pop() || filePath;

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(filePath).then(() => {
      setCopied('path');
      setTimeout(() => setCopied(null), 2000);
    });
  }, [filePath]);

  const handleCopyContent = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied('content');
      setTimeout(() => setCopied(null), 2000);
    });
  }, [content]);

  return (
    <div className="border-l-2 border-l-amber-500 dark:border-l-amber-400 my-1 py-0.5 pl-3">
      {/* Collapsible header */}
      <details className="group/details relative">
        <summary className="flex cursor-pointer select-none items-center gap-1.5 py-0.5 text-xs">
          <svg
            className="h-3 w-3 flex-shrink-0 text-gray-400 transition-transform duration-150 group-open/details:rotate-90 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="flex-shrink-0 font-medium text-gray-500 dark:text-gray-400">Write</span>
          <span className="flex-shrink-0 text-[10px] text-gray-300 dark:text-gray-600">/</span>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyPath(); }}
            className="flex-1 truncate text-left font-mono text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
            title={filePath}
          >
            {filename}
          </button>
          <span className="flex-shrink-0 text-[11px] italic text-gray-400 dark:text-gray-500">
            {sizeKB} KB
          </span>
          <span className="flex-shrink-0 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('toolResult.writeSuccess')}
          </span>
        </summary>
        <div className="mt-1.5 pl-[18px]">
          <div className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-200/50 dark:border-gray-700/50 text-xs max-h-48 overflow-auto">
            <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
              {content.length > 500 ? content.slice(0, 500) + '...' : content}
            </pre>
            {content.length > 500 && (
              <button
                onClick={handleCopyContent}
                className="mt-1 text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
              >
                {copied === 'content' ? t('common.copied') : t('toolResult.copyFullContent')}
              </button>
            )}
          </div>
        </div>
      </details>
    </div>
  );
});

FileWriteResult.displayName = 'FileWriteResult';
