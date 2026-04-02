/**
 * 会话终端页面
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { useTranslation } from 'react-i18next';
import { useSessionStore, useMachinesStore, useSocketStore } from '../stores';
import { Button, Input, Modal, Loading } from '../components';
import { socketManager } from '../lib/socket';
import type { PermissionRequest } from '../stores/sessionStore';

export const SessionPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const {
    currentSession,
    outputBuffer,
    permissionRequests,
    inputHistory,
    sendInput,
    answerPermission,
    isLoading,
    error,
    clearError,
  } = useSessionStore();
  const { isConnected } = useSocketStore();

  const { machines } = useMachinesStore();
  const lastJoinSessionIdRef = useRef<string | null>(null);

  // 终端相关
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // 输入状态
  const [inputValue, setInputValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 权限确认模态框
  const [currentPermission, setCurrentPermission] = useState<PermissionRequest | null>(null);

  // 注意：事件订阅由 socketStore 统一管理，这里不需要单独订阅

  // 初始化终端
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      fontFamily: 'Monaco, Menlo, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 2000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 写入欢迎信息
    terminal.writeln('\x1b[1;36m=== Claude Code Remote Session ===\x1b[0m');
    terminal.writeln(`\x1b[90m${t('session.connecting')}\x1b[0m`);
    terminal.writeln('');

    // 窗口大小调整
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // 输出缓冲区更新
  useEffect(() => {
    if (!xtermRef.current || !sessionId) return;

    const buffer = outputBuffer.get(sessionId);
    if (buffer) {
      const terminal = xtermRef.current;
      terminal.clear();

      buffer.forEach((line) => {
        terminal.writeln(line);
      });

      // 滚动到底部
      terminal.scrollToBottom();
    }
  }, [outputBuffer, sessionId]);

  // 处理权限请求
  useEffect(() => {
    const pendingRequest = permissionRequests.find((r) => r.pending);
    if (pendingRequest && !currentPermission) {
      setCurrentPermission(pendingRequest);
    }
  }, [permissionRequests, currentPermission]);

  // 检查会话状态
  useEffect(() => {
    if (!sessionId) {
      navigate('/machines');
      return;
    }

    // 如果没有当前会话，尝试加入
    if (!currentSession && !isLoading && isConnected) {
      // 从store获取machineId
      const machineId = machines[0]?.id;
      if (machineId && lastJoinSessionIdRef.current !== sessionId) {
        lastJoinSessionIdRef.current = sessionId;
        socketManager.joinSession(sessionId, machineId);
      }
    } else if (currentSession?.sessionId === sessionId) {
      lastJoinSessionIdRef.current = null;
    }
  }, [sessionId, currentSession, isLoading, navigate, machines, isConnected]);

  useEffect(() => {
    if (!isConnected || !sessionId || currentSession?.sessionId !== sessionId || !currentSession.machineId) {
      return;
    }

    socketManager.joinSession(currentSession.sessionId, currentSession.machineId);
  }, [isConnected, sessionId, currentSession]);

  // 处理输入提交
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    sendInput(inputValue);
    setInputValue('');
    setHistoryIndex(-1);
  }, [inputValue, sendInput]);

  // 处理历史导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < inputHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInputValue(inputHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(inputHistory[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputValue('');
      }
    }
  }, [historyIndex, inputHistory]);

  // 处理权限确认
  const handlePermissionAnswer = (approved: boolean) => {
    if (!currentPermission) return;

    answerPermission(currentPermission.id, approved);
    setCurrentPermission(null);

    // 在终端显示结果
    if (xtermRef.current) {
      xtermRef.current.writeln('');
      xtermRef.current.writeln(`\x1b[1;33m[${t('chat.permissionRequest')}] ${approved ? t('chat.approve') : t('chat.deny')}\x1b[0m`);
    }
  };

  // 返回工程列表
  const handleBack = () => {
    navigate(-1);
  };

  // 断开会话
  const handleDisconnect = () => {
    useSessionStore.getState().leaveSession();
    navigate('/machines');
  };

  // 获取机器名称
  const machineName = currentSession?.machineId
    ? machines.find((m) => m.id === currentSession.machineId)?.name || t('workspace.unknownMachine')
    : t('workspace.unknownMachine');

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* 头部 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('session.terminal')}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {machineName} - {currentSession?.projectPath || t('workspace.unknownProject')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentSession && (
            <span className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              {t('session.inSession')}
            </span>
          )}
          <Button onClick={handleDisconnect} variant="danger" size="sm">
            {t('session.disconnect')}
          </Button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
          <span className="text-red-600 dark:text-red-400 text-sm">{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 终端区域 */}
      <div className="flex-1 bg-gray-900 dark:bg-gray-950 rounded-lg overflow-hidden flex flex-col">
        {/* 终端输出 */}
        <div
          ref={terminalRef}
          className="flex-1 p-2 overflow-hidden"
          style={{ minHeight: '300px' }}
        />

        {/* 输入框 */}
        <div className="border-t border-gray-700 dark:border-gray-800 p-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <span className="text-green-400 font-mono">$</span>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('session.enterCommand')}
              className="flex-1 bg-transparent text-white font-mono text-sm outline-none placeholder-gray-500"
              autoComplete="off"
              autoFocus
            />
            <Button type="submit" size="sm" disabled={!inputValue.trim()}>
              {t('session.send')}
            </Button>
          </form>
        </div>
      </div>

      {/* 权限确认模态框 */}
      <Modal
        isOpen={!!currentPermission}
        onClose={() => setCurrentPermission(null)}
        title={t('chat.permissionRequest')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => handlePermissionAnswer(false)}>
              {t('chat.deny')}
            </Button>
            <Button onClick={() => handlePermissionAnswer(true)}>
              {t('chat.approve')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-yellow-800 dark:text-yellow-300 text-sm">
              {t('session.permissionRequestDescription')}
            </p>
          </div>
          <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg font-mono text-sm whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">
            {currentPermission?.message || t('session.unknownRequest')}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('session.permissionReviewTip')}
          </p>
        </div>
      </Modal>

      {/* 加载状态 */}
      {isLoading && !currentSession && (
        <Loading fullscreen text={t('workspace.connectingSession')} />
      )}
    </div>
  );
};
