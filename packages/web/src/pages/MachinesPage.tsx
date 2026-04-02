/**
 * 机器列表页面
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMachinesStore, useAuthStore, useSocketStore, useSessionStore } from '../stores';
import { Button, StatusIndicator, Loading } from '../components';
import { socketManager } from '../lib/socket';
import { apiClient } from '../lib/api';
import type { MachineWithStatus } from '../stores/machinesStore';

// 全局搜索结果类型
interface ProjectSearchResult {
  id: string;
  machineId: string;
  machineName: string;
  machineHostname: string;
  name: string;
  path: string;
  lastAccessed: string | null;
}

export const MachinesPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token, isAuthenticated } = useAuthStore();
  const { isConnected, isConnecting, connect } = useSocketStore();
  const {
    machines,
    isLoading,
    isScanning,
    error,
    scanProjects,
    selectMachine,
    clearError,
  } = useMachinesStore();
  const { startSession, currentSession } = useSessionStore();

  const [scanningMachineId, setScanningMachineId] = useState<string | null>(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProjectSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [pendingNavigation, setPendingNavigation] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // 初始化Socket连接（socketStore 统一管理事件订阅）
  useEffect(() => {
    if (!token || !isAuthenticated) {
      navigate('/login');
      return;
    }

    // 连接 socket（socketStore 会处理事件订阅和避免重复连接）
    // 优先使用环境变量配置的服务地址，否则使用当前页面的 origin（支持多机访问）
    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
    connect(serverUrl, token);

  }, [token, isAuthenticated, navigate, connect]);

  // 处理扫描工程
  const handleScanProjects = (machine: MachineWithStatus) => {
    if (!machine.isOnline) return;

    setScanningMachineId(machine.id);
    selectMachine(machine.id);
    scanProjects(machine.id);

    // 导航到工程页面
    setTimeout(() => {
      navigate(`/machines/${machine.id}/projects`);
    }, 100);
  };

  // 格式化最后在线时间
  const formatLastSeen = (machine: MachineWithStatus): string => {
    if (machine.isOnline) return t('common.online');
    if (!machine.last_seen) return t('machines.neverConnected');

    const lastSeen = new Date(machine.last_seen);
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t('machines.justNow');
    if (diffMins < 60) return t('machines.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('machines.hoursAgo', { count: diffHours });
    return t('machines.daysAgo', { count: diffDays });
  };

  // 全局搜索工程
  const handleGlobalSearch = async (query: string) => {
    setGlobalSearchQuery(query);
    setSelectedIndex(-1); // 重置选中项
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await apiClient.get<ProjectSearchResult[]>('/api/machines/projects/search', {
        params: { q: query }
      });
      setSearchResults(results);
    } catch (err) {
      console.error('[MachinesPage] Search error:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // 跳转到工程会话
  const handleSelectSearchResult = (result: ProjectSearchResult) => {
    // 重置搜索状态
    setGlobalSearchQuery('');
    setSearchResults([]);
    setSelectedIndex(-1);
    // 设置标志，等待会话启动后导航
    setPendingNavigation(true);
    // 启动会话
    startSession(result.machineId, result.path, 'chat');
  };

  // 当会话启动后自动导航到工作区（仅从搜索结果触发时）
  useEffect(() => {
    if (currentSession && pendingNavigation) {
      setPendingNavigation(false);
      navigate(`/workspace/${currentSession.sessionId}`);
    }
  }, [currentSession, pendingNavigation, navigate]);

  // 键盘导航
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchResults.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectSearchResult(searchResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      setGlobalSearchQuery('');
      setSearchResults([]);
      setSelectedIndex(-1);
    }
  };

  // 滚动选中项到可见区域
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // 加载状态
  if (isConnecting) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading text={t('workspace.connecting')} />
      </div>
    );
  }

  // 等待机器数据
  if (!isConnected && machines.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  return (
    <div>
      {/* 页面标题 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('machines.title')}</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-300">{t('machines.subtitle')}</p>
        </div>
        {/* 全局工程搜索 */}
        <div className="relative w-64">
          <svg
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={globalSearchQuery}
            onChange={(e) => handleGlobalSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t('machines.globalSearch')}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {isSearching && (
            <svg className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5.683 5.373 5 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {/* 搜索结果下拉 */}
          {globalSearchQuery && searchResults.length > 0 && (
            <div
              ref={resultsRef}
              className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50"
            >
              {searchResults.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectSearchResult(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors ${
                    index === selectedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {result.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <span className="text-blue-500">{result.machineName}</span>
                    <span>•</span>
                    <span className="truncate">{result.path}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {globalSearchQuery && !isSearching && searchResults.length === 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-sm text-gray-500 dark:text-gray-400 z-50">
              {t('machines.noResults')}
            </div>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
          <span className="text-red-600 dark:text-red-400">{error}</span>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-600 dark:hover:text-red-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 机器列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loading text={t('common.loading')} />
        </div>
      ) : machines.length === 0 ? (
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
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">{t('machines.noMachines')}</h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">{t('machines.noMachinesTip')}</p>
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-left max-w-md mx-auto">
            <code className="text-sm text-gray-700 dark:text-gray-300">
              npx cc-remote agent --server wss://your-server.com
            </code>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {machines.map((machine) => (
            <div
              key={machine.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow"
            >
              {/* 机器头部 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-8 h-8 text-gray-400 dark:text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{machine.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{machine.hostname}</p>
                  </div>
                </div>
                <StatusIndicator isOnline={machine.isOnline} showLabel />
              </div>

              {/* 机器信息 */}
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                <p>{t('machines.lastSeen')}: {formatLastSeen(machine)}</p>
              </div>

              {/* 操作按钮 */}
              <Button
                onClick={() => handleScanProjects(machine)}
                disabled={!machine.isOnline}
                loading={isScanning && scanningMachineId === machine.id}
                fullWidth
                variant={machine.isOnline ? 'primary' : 'secondary'}
              >
                {machine.isOnline ? t('machines.scanProjects') : t('machines.machineOffline')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 刷新按钮 */}
      <div className="fixed bottom-6 right-6">
        <Button
          onClick={() => {
            // 请求机器列表刷新
            if (socketManager.isConnected()) {
              socketManager.emit('request-machines');
            }
          }}
          className="shadow-lg rounded-full w-14 h-14 !p-0 flex items-center justify-center"
        >
          <svg
            className="w-6 h-6 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </Button>
      </div>
    </div>
  );
};
