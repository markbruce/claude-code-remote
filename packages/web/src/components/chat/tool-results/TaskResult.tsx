/**
 * TaskResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

interface TaskResultProps {
  taskName: string;
  taskType: string;
  status: 'running' | 'completed' | 'failed';
  result?: string;
  output?: string;
  isError?: boolean;
}

export const TaskResult: React.FC<TaskResultProps> = memo(({
  taskName,
  taskType,
  status,
  result,
  output,
  isError
}) => {
  const { t } = useTranslation();

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return (
          <svg className="h-3 w-3 text-blue-500 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        );
      case 'completed':
        return (
          <svg className="h-3 w-3 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="h-3 w-3 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'text-blue-600 dark:text-blue-400';
      case 'completed':
        return 'text-green-600 dark:text-green-400';
      case 'failed':
        return 'text-red-600 dark:text-red-400';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running':
        return t('toolResult.running');
      case 'completed':
        return t('toolResult.completed');
      case 'failed':
        return t('toolResult.failed');
    }
  };

  return (
    <div className={`border-l-2 my-1 py-0.5 pl-3 ${
      status === 'failed' || isError
        ? 'border-l-red-500 dark:border-l-red-400'
        : 'border-l-purple-500 dark:border-l-purple-400'
    }`}>
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
          <span className="flex-shrink-0 font-medium text-gray-500 dark:text-gray-400">Task</span>
          <span className="flex-shrink-0 text-[10px] text-gray-300 dark:text-gray-600">/</span>
          <span className="flex-1 truncate text-gray-600 dark:text-gray-400">
            {taskName}
          </span>
          <span className="flex-shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
            {taskType}
          </span>
          <span className={`flex-shrink-0 flex items-center gap-1 text-xs ${getStatusColor()}`}>
            {getStatusIcon()}
            {getStatusText()}
          </span>
        </summary>
        <div className="mt-1.5 pl-[18px] space-y-2">
          {result && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('toolResult.resultLabel')}</div>
              <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800/50 p-2 rounded border border-gray-200/50 dark:border-gray-700/50 max-h-48 overflow-auto">
                {result}
              </pre>
            </div>
          )}
          {output && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('toolResult.outputLabel')}</div>
              <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800/50 p-2 rounded border border-gray-200/50 dark:border-gray-700/50 max-h-48 overflow-auto">
                {output}
              </pre>
            </div>
          )}
        </div>
      </details>
    </div>
  );
});

TaskResult.displayName = 'TaskResult';
