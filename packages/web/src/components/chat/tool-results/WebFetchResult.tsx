/**
 * WebFetchResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

interface WebFetchResultProps {
  url: string;
  content: string;
  isError?: boolean;
}

export const WebFetchResult: React.FC<WebFetchResultProps> = memo(({ url, content, isError }) => {
  const { t } = useTranslation();
  // Truncate content for preview
  const previewLength = 500;
  const hasMore = content.length > previewLength;

  return (
    <div className="border-l-2 border-l-blue-500 dark:border-l-blue-400 my-1 py-0.5 pl-3">
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
          <span className="flex-shrink-0 font-medium text-gray-500 dark:text-gray-400">WebFetch</span>
          <span className="flex-shrink-0 text-[10px] text-gray-300 dark:text-gray-600">/</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-1 truncate text-blue-600 dark:text-blue-400 hover:underline"
            title={url}
          >
            {url}
          </a>
          <span className="flex-shrink-0 text-[11px] italic text-gray-400 dark:text-gray-500">
            {t('toolResult.characterCount', { count: content.length })}
          </span>
          {isError && (
            <span className="flex-shrink-0 text-xs text-red-500 dark:text-red-400">{t('toolResult.error')}</span>
          )}
        </summary>
        <div className="mt-1.5 pl-[18px]">
          <div className="max-h-64 overflow-auto">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800/50 p-2 rounded border border-gray-200/50 dark:border-gray-700/50">
              {content}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
});

WebFetchResult.displayName = 'WebFetchResult';
