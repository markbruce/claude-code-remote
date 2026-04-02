/**
 * TodoResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'high' | 'medium' | 'low';
}

interface TodoResultProps {
  todos: TodoItem[];
  mode: 'read' | 'write';
  isError?: boolean;
}

export const TodoResult: React.FC<TodoResultProps> = memo(({ todos, mode, isError }) => {
  const { t } = useTranslation();

  const getStatusIcon = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="h-3.5 w-3.5 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'in_progress':
        return (
          <svg className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        );
      default:
        return (
          <svg className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
          </svg>
        );
    }
  };

  const getStatusColor = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400';
      case 'in_progress':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const pendingCount = todos.filter(t => t.status === 'pending').length;
  const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
  const completedCount = todos.filter(t => t.status === 'completed').length;

  return (
    <div className="border-l-2 border-l-violet-500 dark:border-l-violet-400 my-1 py-0.5 pl-3">
      {/* Collapsible header */}
      <details className="group/details relative" open={mode === 'read'}>
        <summary className="flex cursor-pointer select-none items-center gap-1.5 py-0.5 text-xs">
          <svg
            className="h-3 w-3 flex-shrink-0 text-gray-400 transition-transform duration-150 group-open/details:rotate-90 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="flex-shrink-0 font-medium text-gray-500 dark:text-gray-400">
            {mode === 'read' ? 'TodoRead' : 'TodoWrite'}
          </span>
          <span className="flex-shrink-0 text-[10px] text-gray-300 dark:text-gray-600">/</span>
          <span className="flex-1 truncate text-gray-600 dark:text-gray-400">
            {mode === 'read' ? 'reading list' : 'updating list'}
          </span>
          <span className="flex-shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
            {pendingCount} {t('toolResult.pending')}
          </span>
          <span className="flex-shrink-0 text-[11px] text-blue-400 dark:text-blue-500">
            {inProgressCount} {t('toolResult.inProgress')}
          </span>
          <span className="flex-shrink-0 text-[11px] text-green-400 dark:text-green-500">
            {completedCount} {t('toolResult.completed')}
          </span>
        </summary>
        <div className="mt-1.5 pl-[18px]">
          {/* Todo list */}
          <div className="space-y-1">
            {todos.map((todo, idx) => (
              <div
                key={todo.id || idx}
                className={`flex items-start gap-2 py-1 px-1 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded ${
                  todo.status === 'completed' ? 'opacity-60' : ''
                }`}
              >
                {/* Status icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(todo.status)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs ${getStatusColor(todo.status)} ${
                    todo.status === 'completed' ? 'line-through' : ''
                  }`}>
                    {todo.content}
                  </p>
                </div>

                {/* Priority badge */}
                {todo.priority && (
                  <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                    todo.priority === 'high'
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      : todo.priority === 'medium'
                      ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {todo.priority === 'high' ? t('toolResult.high') : todo.priority === 'medium' ? t('toolResult.medium') : t('toolResult.low')}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Empty state */}
          {todos.length === 0 && (
            <div className="py-2 text-center text-gray-500 italic text-xs">
              {t('toolResult.noTasks')}
            </div>
          )}

          {/* Error indicator */}
          {isError && (
            <div className="py-1.5 text-xs text-red-600 dark:text-red-400">
              {t('toolResult.operationFailed')}
            </div>
          )}
        </div>
      </details>
    </div>
  );
});

TodoResult.displayName = 'TodoResult';
