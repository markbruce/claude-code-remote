/**
 * BashResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '../shared/CopyButton';

interface BashResultProps {
  command: string;
  result: string;
  isError?: boolean;
}

export const BashResult: React.FC<BashResultProps> = memo(({ command, result, isError }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showStderr, setShowStderr] = useState(false);

  const toggleExpand = useCallback(() => setExpanded(prev => !prev), []);
  const toggleStderr = useCallback(() => setShowStderr(prev => !prev), []);

  // Try to parse structured output
  let stdout = result;
  let stderr = '';
  let exitCode: number | null = null;

  try {
    const parsed = JSON.parse(result);
    if (typeof parsed === 'object' && parsed !== null) {
      stdout = parsed.stdout || result;
      stderr = parsed.stderr || '';
      exitCode = typeof parsed.exit_code === 'number' ? parsed.exit_code : null;
    }
  } catch {
    // Keep original result as stdout
  }

  const hasOutput = stdout.length > 0;
  const hasError = stderr.length > 0 || isError;

  return (
    <div className="group my-1 border-l-2 border-l-green-500 dark:border-l-green-400 py-0.5 pl-3">
      {/* Command line - one-line display style */}
      <div className="flex items-start gap-2">
        <div className="flex flex-shrink-0 items-center gap-1.5 pt-0.5">
          <svg className="h-3 w-3 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="min-w-0 flex-1 rounded bg-gray-900 px-2.5 py-1 dark:bg-black">
            <code className="font-mono text-xs text-green-400 whitespace-pre-wrap break-all">
              <span className="select-none text-green-600 dark:text-green-500">$ </span>{command}
            </code>
          </div>
          {hasOutput && (
            <CopyButton text={stdout} label={t('common.copy')} className="text-gray-400 hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          <button
            onClick={toggleExpand}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>{expanded ? t('toolResult.collapse') : t('toolResult.expand')}</span>
          </button>
        </div>
      </div>

      {/* Output Area */}
      {expanded && (
        <div className="mt-1.5 ml-[18px] max-h-64 overflow-auto">
          {/* Stdout */}
          {hasOutput && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between bg-gray-100/50 dark:bg-gray-800/50 px-3 py-1">
                <span className="text-xs text-gray-500 font-medium">STDOUT</span>
              </div>
              <pre className="p-3 text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/50">
                {stdout}
              </pre>
            </div>
          )}

          {/* Stderr */}
          {hasError && (
            <div>
              <div className="flex items-center justify-between bg-red-100/50 dark:bg-red-900/20 px-3 py-1">
                <span className="text-xs text-red-500 dark:text-red-400 font-medium">STDERR</span>
                <button
                  onClick={toggleStderr}
                  className="text-xs text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300"
                >
                  {showStderr ? t('toolResult.hide') : t('toolResult.show')}
                </button>
              </div>
              {showStderr && stderr && (
                <pre className="p-3 text-xs font-mono text-red-600 dark:text-red-300 whitespace-pre-wrap break-words bg-red-50 dark:bg-red-950/30">
                  {stderr}
                </pre>
              )}
            </div>
          )}

          {/* Exit code */}
          {exitCode !== null && (
            <div className="px-3 py-1.5 flex items-center gap-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-xs text-gray-500">{t('toolResult.exitCode')}:</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                exitCode === 0
                  ? 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400'
                  : 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'
              }`}>
                {exitCode}
              </span>
            </div>
          )}

          {/* Empty state */}
          {!hasOutput && !hasError && (
            <div className="p-3 text-xs text-gray-500 italic">
              {t('toolResult.noOutput')}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

BashResult.displayName = 'BashResult';
