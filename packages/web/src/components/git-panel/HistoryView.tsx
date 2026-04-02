import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GitCommit } from './types';

interface HistoryViewProps {
  commits: GitCommit[];
  isLoading: boolean;
  ahead?: number; // 本地领先远程的 commit 数量
  onCommitClick?: (hash: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  commits,
  isLoading,
  ahead = 0,
  onCommitClick,
}) => {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400">
        {t('git.loading')}
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400">
        {t('git.noCommits')}
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      {/* 未推送提示 */}
      {ahead > 0 && (
        <div className="px-3 py-2 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            <span>{t('git.localCommits', { count: ahead })}</span>
          </div>
        </div>
      )}
      {commits.map((commit, index) => {
        const isLocal = index < ahead; // 前 ahead 个是本地未推送的
        return (
          <div
            key={commit.hash}
            className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
            onClick={() => onCommitClick?.(commit.hash)}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{commit.hash.slice(0, 7)}</span>
              {isLocal && (
                <span className="px-1.5 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded">
                  {t('git.local')}
                </span>
              )}
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{commit.message}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 dark:text-gray-500">
              <span>{commit.author}</span>
              <span>•</span>
              <span>{commit.date}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
