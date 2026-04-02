import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChangesView } from './ChangesView';
import { HistoryView } from './HistoryView';
import { useGit } from './hooks/useGit';
import type { ViewTab } from './types';

interface GitPanelProps {
  machineId?: string;
  projectPath?: string;
  onFileClick?: (file: string) => void;
}

export const GitPanel: React.FC<GitPanelProps> = ({
  machineId,
  projectPath,
  onFileClick,
}) => {
  const [activeTab, setActiveTab] = useState<ViewTab>('changes');
  const { status, commits, isLoading, fetchStatus, fetchLog, stage, unstage, commit } = useGit(machineId, projectPath);
  const { t } = useTranslation();

  useEffect(() => {
    if (machineId && projectPath) {
      fetchStatus({ force: true });
      fetchLog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随工程切换；打开 Git 面板需强制拉最新状态
  }, [machineId, projectPath]);

  const tabs: { id: ViewTab; label: string }[] = [
    { id: 'changes', label: t('git.changes') },
    { id: 'history', label: t('git.history') },
  ];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'changes' && status && (
          <ChangesView
            status={status}
            onStage={stage}
            onUnstage={unstage}
            onCommit={commit}
            onFileClick={onFileClick}
          />
        )}
        {activeTab === 'history' && (
          <HistoryView
            commits={commits}
            isLoading={isLoading}
            ahead={status?.ahead ?? 0}
          />
        )}
      </div>
    </div>
  );
};
