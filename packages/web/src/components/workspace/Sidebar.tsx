import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionInfo, SessionHistoryItem, FileTreeItem } from 'cc-remote-shared';
import { DarkModeToggle } from '../DarkModeToggle';
import { GitPanel } from '../git-panel/GitPanel';
import { useGit } from '../git-panel/hooks/useGit';

type SidebarTab = 'sessions' | 'files' | 'git';

import { useSessionStore } from '../../stores/sessionStore';

interface SidebarProps {
  machineName: string;
  machineOnline: boolean;
  projectPath: string;
  session: SessionInfo | null;
  machineId: string;
  sessionHistory: SessionHistoryItem[];
  isLoadingHistory: boolean;
  fileTree: FileTreeItem[];
  isLoadingFiles: boolean;
  currentFile: string | null;
  onDisconnect: () => void;
  onBack: () => void;
  onNewSession: () => void;
  onFetchHistory: () => void;
  onFetchFiles: () => void;
  onSelectHistorySession: (sdkSessionId: string) => void;
  /** 单击文件 - 预览模式 */
  onFileClick: (filePath: string) => void;
  /** 双击文件 - 固定标签 */
  onFileDoubleClick?: (filePath: string) => void;
  /** Mobile/tablet drawer state */
  isOpen?: boolean;
  /** Called when sidebar should close (mobile backdrop click, tablet collapse) */
  onClose?: () => void;
  /** Optional width for desktop mode (in pixels) */
  width?: number;
}

function formatTimeAgo(ms: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return t('common.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('common.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('common.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  return t('common.daysAgo', { count: days });
}

const FileIcon: React.FC<{ name: string }> = ({ name }) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const colors: Record<string, string> = {
    ts: 'text-blue-500', tsx: 'text-blue-500',
    js: 'text-yellow-500', jsx: 'text-yellow-500',
    json: 'text-yellow-400',
    css: 'text-purple-400',
    html: 'text-orange-400',
    md: 'text-gray-400',
    py: 'text-green-400',
    rs: 'text-orange-500',
    go: 'text-cyan-400',
    vue: 'text-green-500',
    svelte: 'text-red-400',
  };
  const color = colors[ext] || 'text-gray-400';
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
};

interface FileTreeNodeProps {
  item: FileTreeItem;
  depth: number;
  currentFile: string | null;
  loadingDirs: Set<string>;
  onFileClick: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  onExpandDir: (dirPath: string) => void;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({ item, depth, currentFile, loadingDirs, onFileClick, onFileDoubleClick, onExpandDir }) => {
  const [expanded, setExpanded] = useState(false);
  const isActive = currentFile === item.path;

  const handleToggle = useCallback(() => {
    if (!expanded && item.children === undefined) {
      onExpandDir(item.path);
    }
    setExpanded(!expanded);
  }, [expanded, item.path, item.children, onExpandDir]);

  if (item.type === 'directory') {
    const isLoading = loadingDirs.has(item.path);
    return (
      <div>
        <button
          onClick={handleToggle}
          className="w-full text-left flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <svg
            className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <span className="text-gray-700 dark:text-gray-200 text-xs truncate">{item.name}</span>
          {isLoading && (
            <svg className="w-3 h-3 text-gray-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </button>
        {expanded && isLoading && (
          <div className="text-gray-400 dark:text-gray-500 text-xs text-center py-1" style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}>
            ...
          </div>
        )}
        {expanded && item.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            item={child}
            depth={depth + 1}
            currentFile={currentFile}
            loadingDirs={loadingDirs}
            onFileClick={onFileClick}
            onFileDoubleClick={onFileDoubleClick}
            onExpandDir={onExpandDir}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileClick(item.path)}
      onDoubleClick={() => onFileDoubleClick?.(item.path)}
      className={`w-full flex items-center gap-1.5 py-0.5 px-1 rounded transition-colors cursor-pointer ${
        isActive ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
      }`}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      title={item.path}
    >
      <FileIcon name={item.name} />
      <span className="text-xs truncate">{item.name}</span>
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  machineName,
  machineOnline,
  projectPath,
  session,
  machineId,
  sessionHistory,
  isLoadingHistory,
  fileTree,
  isLoadingFiles,
  currentFile,
  onDisconnect,
  onBack,
  onNewSession,
  onFetchHistory,
  onFetchFiles,
  onSelectHistorySession,
  onFileClick,
  onFileDoubleClick,
  isOpen = true,
  onClose,
  width,
}) => {
  const projectName = projectPath.split(/[/\\]/).pop() || projectPath;
  const [tab, setTab] = useState<SidebarTab>('sessions');
  const { t } = useTranslation();

  const loadingDirs = useSessionStore((s) => s.loadingDirs);
  const expandDir = useSessionStore((s) => s.expandDir);

  const handleExpandDir = useCallback((dirPath: string) => {
    if (machineId && projectPath) {
      expandDir(machineId, projectPath, dirPath);
    }
  }, [machineId, projectPath, expandDir]);

  const [showNewSessionHint, setShowNewSessionHint] = useState(false);

  // 获取 Git 状态
  const { status: gitStatus, fetchStatus: fetchGitStatus } = useGit(machineId, projectPath);

  // 定时检查 Git 分支（每 30 秒）；依赖仅 machineId/projectPath，避免 fetchGitStatus 引用变化导致重复 effect
  useEffect(() => {
    if (machineId && projectPath) {
      fetchGitStatus();
      const interval = setInterval(() => {
        fetchGitStatus();
      }, 30000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随工程切换刷新；fetchGitStatus 由 useGit 与 machineId/projectPath 同步
  }, [machineId, projectPath]);

  useEffect(() => { onFetchHistory(); }, [projectPath]);

  const handleTabSwitch = useCallback((tab: SidebarTab) => {
    setTab(tab);
    if (tab === 'files' && fileTree.length === 0 && !isLoadingFiles) {
      onFetchFiles();
    }
  }, [fileTree.length, isLoadingFiles, onFetchFiles]);

  const sortedHistory = useMemo(
    () => [...sessionHistory].sort((a, b) => b.lastModified - a.lastModified),
    [sessionHistory],
  );

  return (
    <>
      {/* Mobile backdrop */}
      {(isOpen !== undefined) && (
        <div
          className={`lg:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <div
        className={`
          bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700
          flex flex-col h-full text-sm
          /* Desktop: always visible, dynamic or fixed width */
          lg:relative lg:translate-x-0 lg:z-auto
          /* Tablet & Mobile: off-canvas drawer */
          fixed inset-y-0 left-0 z-50 w-64 max-w-[80vw]
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={width !== undefined ? { width: `${width}px` } : undefined}
      >
        {/* Close button for mobile/tablet */}
        <button
          onClick={onClose}
          className="lg:hidden absolute top-3 right-3 p-1 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label={t('common.close')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

      {/* Header */}
      <div className="p-3 pr-10 border-b border-gray-200 dark:border-gray-700 lg:pr-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs mb-2 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('workspace.back')}
        </button>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${machineOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-gray-700 dark:text-gray-200 font-medium truncate">{machineName}</span>
        </div>
      </div>

      {/* Project */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span className="text-gray-700 dark:text-gray-200 truncate" title={projectPath}>{projectName}</span>
        </div>
        {/* Git 分支显示 */}
        {gitStatus && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <svg className="w-3 h-3 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7v-7z" />
            </svg>
            <span className="text-gray-500 dark:text-gray-400 text-xs font-mono">
              {gitStatus.branch || 'HEAD'}
            </span>
            {gitStatus.ahead > 0 && (
              <span className="text-green-500 text-xs">↑{gitStatus.ahead}</span>
            )}
            {gitStatus.behind > 0 && (
              <span className="text-orange-500 text-xs">↓{gitStatus.behind}</span>
            )}
          </div>
        )}
        {session && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-gray-500 dark:text-gray-400 text-xs">
              {session.mode === 'chat' ? 'Chat' : 'Shell'} - {session.sessionId.slice(0, 8)}...
            </span>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => handleTabSwitch('sessions')}
          className={`flex-1 py-2 text-xs text-center transition-colors ${
            tab === 'sessions' ? 'text-gray-900 dark:text-white border-b-2 border-blue-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('sidebar.session')}
        </button>
        <button
          onClick={() => handleTabSwitch('files')}
          className={`flex-1 py-2 text-xs text-center transition-colors ${
            tab === 'files' ? 'text-gray-900 dark:text-white border-b-2 border-blue-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('sidebar.files')}
        </button>
        <button
          onClick={() => handleTabSwitch('git')}
          className={`flex-1 py-2 text-xs text-center transition-colors ${
            tab === 'git' ? 'text-gray-900 dark:text-white border-b-2 border-blue-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('workspace.git')}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {tab === 'sessions' ? (
          <>
            <div className="p-2 pb-1 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">{t('sidebar.historySessions')}</div>
              <button
                onClick={onFetchHistory}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title={t('common.refresh')}
              >
                <svg className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-1.5 pb-2">
              {isLoadingHistory && sortedHistory.length === 0 ? (
                <div className="text-gray-400 dark:text-gray-500 text-xs text-center py-4">{t('common.loading')}</div>
              ) : sortedHistory.length === 0 ? (
                <div className="text-gray-400 dark:text-gray-500 text-xs text-center py-4">{t('sidebar.noHistorySessions')}</div>
              ) : (
                <div className="space-y-0.5">
                  {sortedHistory.map((item) => (
                    <div
                      key={item.sdkSessionId}
                      className="group px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      onClick={() => onSelectHistorySession(item.sdkSessionId)}
                      title={item.firstPrompt || item.summary}
                    >
                      <div className="text-gray-700 dark:text-gray-200 text-xs truncate group-hover:text-gray-900 dark:group-hover:text-white">
                        {item.summary.length > 50 ? item.summary.slice(0, 50) + '...' : item.summary}
                      </div>
                      <div className="text-gray-400 dark:text-gray-500 text-[10px] mt-0.5">
                        {formatTimeAgo(item.lastModified, t)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onNewSession}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('sidebar.newSession')}
              </button>
            </div>
          </>
        ) : tab === 'files' ? (
          <>
            <div className="p-2 pb-1 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">{t('files.fileExplorer')}</div>
              <button
                onClick={onFetchFiles}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title={t('common.refresh')}
              >
                <svg className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-1 pb-2">
              {isLoadingFiles && fileTree.length === 0 ? (
                <div className="text-gray-400 dark:text-gray-500 text-xs text-center py-4">{t('common.loading')}</div>
              ) : fileTree.length === 0 ? (
                <div className="text-gray-400 dark:text-gray-500 text-xs text-center py-4">{t('files.noFilesYet')}</div>
              ) : (
                <div>
                  {fileTree.map((item) => (
                    <FileTreeNode
                      key={item.path}
                      item={item}
                      depth={0}
                      currentFile={currentFile}
                      loadingDirs={loadingDirs}
                      onFileClick={onFileClick}
                      onFileDoubleClick={onFileDoubleClick}
                      onExpandDir={handleExpandDir}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : tab === 'git' ? (
          <GitPanel
            machineId={machineId}
            projectPath={projectPath}
            onFileClick={onFileClick}
          />
        ) : null}
      </div>

      {/* Dark Mode Toggle & Disconnect */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <DarkModeToggle />
        <button
          onClick={onDisconnect}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {t('sidebar.disconnectSession')}
        </button>
      </div>
      </div>
    </>
  );
};
