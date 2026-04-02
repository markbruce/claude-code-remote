/**
 * WebSearchResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';

interface WebSearchItem {
  title: string;
  url: string;
  snippet?: string;
}

interface WebSearchResultProps {
  query: string;
  results: WebSearchItem[];
  isError?: boolean;
}

export const WebSearchResult: React.FC<WebSearchResultProps> = memo(({ query, results, isError }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = useCallback(() => setExpanded(prev => !prev), []);

  const displayResults = expanded ? results : results.slice(0, 5);
  const hasMore = results.length > 5;

  return (
    <div className="border-l-2 border-l-blue-500 dark:border-l-blue-400 my-1 py-0.5 pl-3">
      {/* Collapsible header */}
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
          <span className="flex-shrink-0 font-medium text-gray-500 dark:text-gray-400">WebSearch</span>
          <span className="flex-shrink-0 text-[10px] text-gray-300 dark:text-gray-600">/</span>
          <span className="flex-1 truncate font-mono text-gray-700 dark:text-gray-300">
            {query}
          </span>
          <span className="flex-shrink-0 text-[11px] italic text-gray-400 dark:text-gray-500">
            {t('toolResult.resultCount', { count: results.length })}
          </span>
        </summary>
        <div className="mt-1.5 pl-[18px] max-h-64 overflow-auto">
          {displayResults.map((result, idx) => (
            <div
              key={idx}
              className="py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
            >
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
              >
                {result.title}
              </a>
              <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-1">
                {result.url}
              </div>
              {result.snippet && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{result.snippet}</p>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
});

WebSearchResult.displayName = 'WebSearchResult';
