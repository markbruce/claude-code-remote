/**
 * 工程列表页面
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMachinesStore, useSessionStore, useAuthStore, useSocketStore } from '../stores';
import { Button, Loading, StatusIndicator } from '../components';
import { Modal } from '../components/Modal';
import { useResponsive } from '../hooks/useResponsive';
import { socketManager } from '../lib/socket';
import { SocketEvents } from 'cc-remote-shared';
import type { ProjectInfo, SessionHistoryItem } from 'cc-remote-shared';

export const ProjectsPage: React.FC = () => {
  const { t } = useTranslation();
  const { machineId } = useParams<{ machineId: string }>();
  const navigate = useNavigate();

  const { token, isAuthenticated } = useAuthStore();
  const { isConnected, isConnecting, connect } = useSocketStore();

  const {
    machines,
    projects,
    isScanning,
    error,
    scanProjects,
    clearError,
  } = useMachinesStore();

  const {
    startSession,
    isLoading: sessionLoading,
    currentSession,
    setCurrentSession,
    isValidatingPath,
    pathValidationError,
    validatedPath,
    validatePath,
    clearPathValidationError,
  } = useSessionStore();

  const [selectedProject, setSelectedProject] = useState<ProjectInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customPath, setCustomPath] = useState<string>('');
  const [showCustomPathInput, setShowCustomPathInput] = useState<boolean>(false);

  // 窄屏模式下的会话选择相关状态
  const responsive = useResponsive();
  const [isSessionSelectOpen, setIsSessionSelectOpen] = useState(false);
  const [projectForSessionSelect, setProjectForSessionSelect] = useState<ProjectInfo | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 获取当前机器信息
  const machine = machines.find((m) => m.id === machineId);

  // 获取工程列表
  const machineProjects = machineId ? projects.get(machineId) : [];

  // 过滤工程列表
  const filteredProjects = useMemo(() => {
    if (!machineProjects) return [];
    if (!searchQuery.trim()) return machineProjects;
    const query = searchQuery.toLowerCase();
    return machineProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.path.toLowerCase().includes(query)
    );
  }, [machineProjects, searchQuery]);

  // 按最近会话时间排序（对过滤后的结果排序）
  const sortedProjects = useMemo(() => {
    if (!filteredProjects) return [];
    return [...filteredProjects].sort((a, b) => {
      const timeA = a.lastSessionTime || 0;
      const timeB = b.lastSessionTime || 0;
      return timeB - timeA; // 降序，最近会话的在前
    });
  }, [filteredProjects]);

  // 初始化Socket连接（事件订阅在 socketStore 中统一管理）
  useEffect(() => {
    if (!token || !isAuthenticated) {
      navigate('/login');
      return;
    }

    // 连接 socket（socketStore 会处理事件订阅和避免重复连接）
    // 优先使用环境变量配置的服务地址，否则使用当前页面的 origin
    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
    connect(serverUrl, token);

  }, [token, isAuthenticated, navigate, connect]);

  // 进入工程列表时清掉旧会话，避免带着上次的 currentSession 被重定向到 /workspace/旧id 再 join 报「会话不存在」
  useEffect(() => {
    setCurrentSession(null);
  }, [machineId, setCurrentSession]);

  // 仅当机器在线且尚无工程数据时自动扫描，避免离线时反复触发扫描导致死循环
  useEffect(() => {
    if (
      machineId &&
      machine?.isOnline &&
      !machineProjects &&
      !isScanning &&
      isConnected
    ) {
      scanProjects(machineId);
    }
  }, [machineId, machine?.isOnline, machineProjects, isScanning, scanProjects, isConnected]);

  // 只有在本页点了「启动会话」并收到 SESSION_STARTED 后才跳转到 workspace（由 subscribeToSessionEvents 里设置 currentSession）
  useEffect(() => {
    if (currentSession && machineId) {
      navigate(`/workspace/${currentSession.sessionId}`);
    }
  }, [currentSession, machineId, navigate]);

  // 检查机器是否存在和在线
  useEffect(() => {
    if (machines.length > 0 && machineId) {
      const m = machines.find((m) => m.id === machineId);
      if (!m) {
        navigate('/machines');
      } else if (!m.isOnline) {
        // 可以选择返回机器列表
      }
    }
  }, [machines, machineId, navigate]);

  // 处理启动会话（默认 Chat 模式）
  const handleStartSession = (project: ProjectInfo) => {
    if (!machineId) return;

    // 窄屏模式下，先显示会话选择
    if (responsive.isMobile || responsive.isTablet) {
      setProjectForSessionSelect(project);
      setIsSessionSelectOpen(true);
      fetchSessionHistory(project.path);
    } else {
      // 桌面模式下，直接启动新会话
      setSelectedProject(project);
      startSession(machineId, project.path, 'chat');
    }
  };

  // 获取会话历史
  const fetchSessionHistory = useCallback((projectPath: string) => {
    if (!machineId) return;
    setIsLoadingHistory(true);
    setSessionHistory([]);
    socketManager.listSessions(machineId, projectPath);
  }, [machineId]);

  // 监听会话历史列表事件
  useEffect(() => {
    const unsubscribe = socketManager.on(
      SocketEvents.SESSIONS_LIST,
      (data: unknown) => {
        const typedData = data as { machine_id: string; project_path: string; sessions: SessionHistoryItem[] };
        // 只处理当前选中项目的数据
        if (projectForSessionSelect && typedData.project_path === projectForSessionSelect.path) {
          setSessionHistory(typedData.sessions || []);
          setIsLoadingHistory(false);
        }
      }
    );
    return unsubscribe;
  }, [projectForSessionSelect]);

  // 关闭会话选择弹窗
  const handleCloseSessionSelect = useCallback(() => {
    setIsSessionSelectOpen(false);
    setProjectForSessionSelect(null);
    setSessionHistory([]);
    setIsLoadingHistory(false);
  }, []);

  // 选择历史会话
  const handleSelectHistorySession = useCallback((sdkSessionId: string) => {
    if (!machineId || !projectForSessionSelect) return;

    setSelectedProject(projectForSessionSelect);
    handleCloseSessionSelect();
    // 使用 resume 选项启动会话来恢复历史会话
    startSession(machineId, projectForSessionSelect.path, 'chat', { resume: sdkSessionId });
  }, [machineId, projectForSessionSelect, startSession, handleCloseSessionSelect]);

  // 新建会话
  const handleNewSession = useCallback(() => {
    if (!machineId || !projectForSessionSelect) return;

    setSelectedProject(projectForSessionSelect);
    handleCloseSessionSelect();
    startSession(machineId, projectForSessionSelect.path, 'chat');
  }, [machineId, projectForSessionSelect, startSession, handleCloseSessionSelect]);

  // 格式化时间（相对时间）
  const formatTimeAgo = useCallback((ms: number): string => {
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return t('machines.justNow');
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t('machines.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('machines.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return t('machines.daysAgo', { count: days });
  }, [t]);

  // 排序后的历史会话
  const sortedSessionHistory = useMemo(
    () => [...sessionHistory].sort((a, b) => b.lastModified - a.lastModified),
    [sessionHistory]
  );

  // 处理自定义路径启动会话
  const handleStartCustomPathSession = async () => {
    if (!machineId || !customPath.trim()) return;

    // 先验证路径
    validatePath(machineId, customPath.trim());
  };

  // 监听路径验证结果，如果验证成功则启动会话
  useEffect(() => {
    if (validatedPath && !isValidatingPath && !pathValidationError) {
      // 路径验证成功，启动会话
      const customProject: ProjectInfo = {
        path: validatedPath,
        name: validatedPath.split(/[/\\]/).pop() || validatedPath,
      };
      setSelectedProject(customProject);
      startSession(machineId!, validatedPath, 'chat');
      // 重置状态
      setCustomPath('');
      setShowCustomPathInput(false);
      clearPathValidationError();
    }
  }, [validatedPath, isValidatingPath, pathValidationError, machineId, startSession, clearPathValidationError]);

  // 处理显示自定义路径输入
  const handleShowCustomPathInput = () => {
    setShowCustomPathInput(true);
    clearPathValidationError();
  };

  // 取消自定义路径输入
  const handleCancelCustomPath = () => {
    setShowCustomPathInput(false);
    setCustomPath('');
    clearPathValidationError();
  };

  // 格式化路径显示
  const formatPath = (path: string): string => {
    // 截取最后几级目录
    const parts = path.split(/[/\\]/);
    if (parts.length <= 3) return path;
    return '...' + parts.slice(-3).join('/');
  };

  // 格式化时间
  const formatTime = (date: Date | string | number | null | undefined): string => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // 返回机器列表
  const handleBack = () => {
    navigate('/machines');
  };

  // 刷新工程列表
  const handleRefresh = () => {
    if (machineId) {
      scanProjects(machineId, true);
    }
  };

  // 连接中状态
  if (isConnecting) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading text={t('workspace.connecting')} />
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  return (
    <div>
      {/* 页面头部 */}
      <div className="mb-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mb-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('machines.backToList')}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{machine.name}</h1>
            <div className="text-gray-600 dark:text-gray-300 flex items-center gap-2">
              <span>{machine.hostname}</span>
              <StatusIndicator isOnline={machine.isOnline} showLabel size="sm" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 搜索框 */}
            <div className="relative">
              <svg
                className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('projects.searchProjects')}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-48"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <Button
              onClick={handleRefresh}
              loading={isScanning}
              variant="secondary"
            >
              {t('common.refresh')}
            </Button>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
          <span className="text-red-600 dark:text-red-400">{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 机器离线提示 */}
      {!machine.isOnline && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-yellow-700 dark:text-yellow-300">{t('machines.machineOfflineTip')}</p>
        </div>
      )}

      {/* 自定义路径输入区域 */}
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        {!showCustomPathInput ? (
          <button
            onClick={handleShowCustomPathInput}
            disabled={!machine.isOnline}
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>{t('projects.useCustomPath')}</span>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="text-sm text-gray-600 dark:text-gray-300">{t('projects.customPathTip')}</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customPath}
                onChange={(e) => {
                  setCustomPath(e.target.value);
                  clearPathValidationError();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customPath.trim() && !isValidatingPath) {
                    handleStartCustomPathSession();
                  }
                  if (e.key === 'Escape') {
                    handleCancelCustomPath();
                  }
                }}
                placeholder={t('projects.customPathPlaceholder')}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                disabled={!machine.isOnline || isValidatingPath}
                autoFocus
              />
              <Button
                onClick={handleStartCustomPathSession}
                disabled={!machine.isOnline || !customPath.trim() || isValidatingPath}
                loading={isValidatingPath}
                size="sm"
              >
                {t('projects.startSession')}
              </Button>
              <Button
                onClick={handleCancelCustomPath}
                variant="secondary"
                size="sm"
                disabled={isValidatingPath}
              >
                {t('common.cancel')}
              </Button>
            </div>
            {pathValidationError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {pathValidationError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 工程列表 */}
      {isScanning && !sortedProjects ? (
        <div className="flex items-center justify-center py-12">
          <Loading text={t('common.loading')} />
        </div>
      ) : !sortedProjects || sortedProjects.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">{t('projects.noProjects')}</h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">{t('projects.noProjectsTip')}</p>
          <Button onClick={handleRefresh} variant="secondary" className="mt-4">
            {t('projects.scanAgain')}
          </Button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">{t('projects.noMatchProjects')}</h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">{t('projects.noMatchTip', { query: searchQuery })}</p>
          <Button onClick={() => setSearchQuery('')} variant="secondary" className="mt-4">
            {t('projects.clearSearch')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
{sortedProjects.map((project, index) => (
            <div
              key={project.id || index}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow"
            >
              <div className="flex items-center justify-between">
                {/* 工程信息 */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{project.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate" title={project.path}>
                    {formatPath(project.path)}
                  </p>
                  {project.lastSessionTime && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {t('projects.lastSession')}: {formatTime(project.lastSessionTime)}
                    </p>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="ml-4 flex-shrink-0">
                  <Button
                    onClick={() => handleStartSession(project)}
                    disabled={!machine.isOnline || sessionLoading}
                    loading={sessionLoading && selectedProject?.path === project.path}
                    size="sm"
                  >
                    {t('projects.startSession')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 提示信息 */}
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
        <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">{t('projects.tips')}</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>{t('projects.tip1')}</li>
          <li>{t('projects.tip2')}</li>
          <li>{t('projects.tip3')}</li>
        </ul>
      </div>

      {/* 窄屏模式下的会话选择弹窗 */}
      <Modal
        isOpen={isSessionSelectOpen}
        onClose={handleCloseSessionSelect}
        title={projectForSessionSelect ? `${projectForSessionSelect.name} - ${t('projects.selectHistory')}` : t('projects.selectHistory')}
        size="lg"
      >
        <div className="space-y-4">
          {/* 新建会话按钮 */}
          <button
            onClick={handleNewSession}
            disabled={!machine?.isOnline || sessionLoading}
            className="w-full flex items-center justify-center gap-2 p-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:dark:bg-gray-600 text-white rounded-lg transition-colors touch-manipulation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="font-medium">{t('projects.newSession')}</span>
          </button>

          {/* 历史会话列表 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('projects.history')}</h4>
              <button
                onClick={() => projectForSessionSelect && fetchSessionHistory(projectForSessionSelect.path)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
                title={t('common.refresh')}
              >
                <svg className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {isLoadingHistory ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                <Loading text={t('common.loading')} />
              </div>
            ) : sortedSessionHistory.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                {t('projects.noHistory')}
              </div>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {sortedSessionHistory.map((item) => (
                  <button
                    key={item.sdkSessionId}
                    onClick={() => handleSelectHistorySession(item.sdkSessionId)}
                    disabled={!machine?.isOnline || sessionLoading}
                    className="w-full text-left p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors touch-manipulation"
                  >
                    <div className="text-gray-900 dark:text-white text-sm font-medium truncate">
                      {item.summary.length > 60 ? item.summary.slice(0, 60) + '...' : item.summary}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                      {formatTimeAgo(item.lastModified)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
