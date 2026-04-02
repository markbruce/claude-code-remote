import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitStatus } from './types';

interface ChangesViewProps {
  status: GitStatus;
  onStage: (file: string) => void;
  onUnstage: (file: string) => void;
  onCommit: (message: string) => void;
  onFileClick?: (file: string) => void;
}

export const ChangesView: React.FC<ChangesViewProps> = ({
  status,
  onStage,
  onUnstage,
  onCommit,
  onFileClick,
}) => {
  const [commitMessage, setCommitMessage] = useState('');
  const { t } = useTranslation();

  const hasChanges = status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Staged Changes */}
      {status.staged.length > 0 && (
        <div className="border-b border-gray-100">
          <div className="px-3 py-2 bg-green-50 text-xs font-medium text-green-700 flex items-center justify-between">
            <span>{t('git.staged')} ({status.staged.length})</span>
            <button
              onClick={() => status.staged.forEach(onUnstage)}
              className="text-green-600 hover:text-green-800"
            >
              {t('git.allUnstage')}
            </button>
          </div>
          {status.staged.map((file) => (
            <div
              key={file}
              className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer"
              onClick={() => onFileClick?.(file)}
            >
              <span className="text-green-500">✓</span>
              <span className="flex-1 truncate text-gray-700">{file}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onUnstage(file); }}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Unstaged Changes */}
      {status.unstaged.length > 0 && (
        <div className="border-b border-gray-100">
          <div className="px-3 py-2 bg-yellow-50 text-xs font-medium text-yellow-700 flex items-center justify-between">
            <span>{t('git.unstaged')} ({status.unstaged.length})</span>
            <button
              onClick={() => status.unstaged.forEach(onStage)}
              className="text-yellow-600 hover:text-yellow-800"
            >
              {t('git.allStage')}
            </button>
          </div>
          {status.unstaged.map((file) => (
            <div
              key={file}
              className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer"
              onClick={() => onFileClick?.(file)}
            >
              <span className="text-yellow-500">M</span>
              <span className="flex-1 truncate text-gray-700">{file}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onStage(file); }}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >
                {t('git.stage')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Untracked Files */}
      {status.untracked.length > 0 && (
        <div className="border-b border-gray-100">
          <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600 flex items-center justify-between">
            <span>{t('git.untracked')} ({status.untracked.length})</span>
            <button
              onClick={() => status.untracked.forEach(onStage)}
              className="text-gray-500 hover:text-gray-700"
            >
              {t('git.allAdd')}
            </button>
          </div>
          {status.untracked.map((file) => (
            <div
              key={file}
              className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer"
              onClick={() => onFileClick?.(file)}
            >
              <span className="text-gray-400">?</span>
              <span className="flex-1 truncate text-gray-700">{file}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onStage(file); }}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >
                {t('git.add')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Commit Input */}
      {status.staged.length > 0 && (
        <div className="p-3 border-t border-gray-200 mt-auto">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder={t('git.commitMessage')}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-blue-500"
            rows={3}
          />
          <button
            onClick={() => {
              if (commitMessage.trim()) {
                onCommit(commitMessage.trim());
                setCommitMessage('');
              }
            }}
            disabled={!commitMessage.trim()}
            className="mt-2 w-full py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t('git.commit')} ({t('git.commitDetails', { count: status.staged.length })})
          </button>
        </div>
      )}

      {/* Empty State */}
      {!hasChanges && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          {t('git.noChanges')}
        </div>
      )}
    </div>
  );
};
