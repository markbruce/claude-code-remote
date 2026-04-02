/**
 * UnknownResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

interface UnknownResultProps {
  toolName: string;
  toolInput: string;
  toolResult: { content: string; isError: boolean };
  isError?: boolean;
}

export const UnknownResult: React.FC<UnknownResultProps> = memo(({ toolName, toolInput, toolResult, isError }) => {
  const { t } = useTranslation();
  // Try to parse input as JSON
  let parsedInput: Record<string, unknown> = {};
  try {
    parsedInput = JSON.parse(toolInput);
  } catch {
    parsedInput = {};
  }

  return (
    <div className="border-l-2 border-l-gray-300 dark:border-l-gray-600 my-1 py-0.5 pl-3">
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
          <span className="flex-shrink-0 font-medium text-gray-500 dark:text-gray-400">{toolName || t('toolResult.unknownTool')}</span>
          {isError && (
            <span className="flex-shrink-0 text-xs text-red-500 dark:text-red-400">{t('toolResult.error')}</span>
          )}
        </summary>
        <div className="mt-1.5 pl-[18px] space-y-2">
          {/* Input section */}
          {Object.keys(parsedInput).length > 0 && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('toolResult.inputParams')}</div>
              <pre className="max-h-48 overflow-auto text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/50 p-2 rounded border border-gray-200/50 dark:border-gray-700/50">
                {JSON.stringify(parsedInput, null, 2)}
              </pre>
            </div>
          )}

          {/* Result section */}
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('toolResult.executionResult')}</div>
            <pre className={`max-h-64 overflow-auto text-xs whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/50 p-2 rounded border border-gray-200/50 dark:border-gray-700/50 ${
              isError ? 'text-red-500 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
            }`}>
              {toolResult.content}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
});

UnknownResult.displayName = 'UnknownResult';
