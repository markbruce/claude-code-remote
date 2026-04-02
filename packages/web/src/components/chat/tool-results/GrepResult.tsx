/**
 * GrepResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';

interface GrepMatch {
  filePath: string;
  line: number;
  column?: number;
  content: string;
  matchedText: string;
}

interface GrepResultProps {
  pattern: string;
  matches: GrepMatch[];
  isError?: boolean;
}

export const GrepResult: React.FC<GrepResultProps> = memo(({ pattern, matches, isError }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = useCallback(() => setExpanded(prev => !prev), []);

  const displayMatches = expanded ? matches : matches.slice(0, 5);
  const hasMore = matches.length > 5;

  return (
    <div className="border-l-2 border-l-gray-400 dark:border-l-gray-500 my-1 py-0.5 pl-3">
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
          <span className="flex-shrink-0 font-medium text-gray-500 dark:text-gray-400">Grep</span>
          <span className="flex-shrink-0 text-[10px] text-gray-300 dark:text-gray-600">/</span>
          <span className="flex-1 truncate font-mono text-gray-700 dark:text-gray-300">
            {pattern}
          </span>
          <span className="flex-shrink-0 text-[11px] italic text-gray-400 dark:text-gray-500">
            {t('toolResult.matchCount', { count: matches.length })}
          </span>
        </summary>
        <div className="mt-1.5 pl-[18px] max-h-64 overflow-auto">
          {displayMatches.map((match, idx) => {
            const fileName = match.filePath.split('/').pop() || match.filePath;

            return (
              <div
                key={idx}
                className="flex items-start gap-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded px-1"
              >
                <span className="text-xs font-mono text-blue-600 dark:text-blue-400 truncate flex-shrink-0 max-w-40">
                  {fileName}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  :{match.line}
                </span>
                <div className="flex-1 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-hidden">
                  {match.content}
                </div>
              </div>
            );
          })}
          {matches.length === 0 && (
            <div className="p-2 text-center text-gray-500 italic text-xs">
              {t('toolResult.noMatch')}
            </div>
          )}
        </div>
      </details>
    </div>
  );
});

GrepResult.displayName = 'GrepResult';
