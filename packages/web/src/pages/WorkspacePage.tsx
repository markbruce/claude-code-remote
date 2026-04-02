import React, { useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { WorkspaceLayout } from '../components/workspace/WorkspaceLayout';
import { ChatInterface } from '../components/chat/ChatInterface';
import { Shell } from '../components/shell/Shell';
import { useSessionStore, useMachinesStore, useSocketStore, useAuthStore } from '../stores';
import { useChatStore } from '../stores/chatStore';
import { socketManager } from '../lib/socket';
import { ERROR_MESSAGES } from 'cc-remote-shared';
import { Loading } from '../components';

export const WorkspacePage: React.FC = () => {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { token, isAuthenticated } = useAuthStore();
  const { isConnected, connect } = useSocketStore();
  const {
    currentSession, isLoading, error, clearError,
    sessionHistory, isLoadingHistory,
    fileTree, isLoadingFiles,
    fetchSessionHistory, fetchFileTree, startSession,
    openFilePreview, openFileFixed,
    agentConnectionState, agentDisconnectReason,
  } = useSessionStore();
  const { machines } = useMachinesStore();
  const clearChat = useChatStore((s) => s.clearMessages);
  const lastJoinSessionIdRef = useRef<string | null>(null);
  /** 仅在曾经连上过之后又断开、再次连上时补一次 join（刷新首连由 SESSION_STARTED / 路由 join 处理） */
  const hadConnectedRef = useRef(false);
  const shouldRejoinAfterReconnectRef = useRef(false);

  useEffect(() => {
    if (!token || !isAuthenticated) {
      navigate('/login');
      return;
    }
    // 优先使用环境变量配置的服务地址，否则使用当前页面的 origin
    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
    connect(serverUrl, token);
  }, [token, isAuthenticated, navigate, connect]);

  useEffect(() => {
    if (!sessionId) {
      navigate('/machines');
      return;
    }
    if (!currentSession && !isLoading && isConnected) {
      const machineId = machines[0]?.id;
      if (machineId && lastJoinSessionIdRef.current !== sessionId) {
        console.log('[WorkspacePage][Diag] route-driven joinSession', {
          routeSessionId: sessionId,
          machineId,
          socketId: socketManager.getId(),
          currentSessionId: null,
          lastJoinSessionId: lastJoinSessionIdRef.current,
        });
        lastJoinSessionIdRef.current = sessionId;
        socketManager.joinSession(sessionId, machineId);
      }
    } else if (currentSession?.sessionId === sessionId) {
      lastJoinSessionIdRef.current = null;
    }
  }, [sessionId, currentSession, isLoading, navigate, machines, isConnected]);

  useEffect(() => {
    if (!isConnected) {
      if (hadConnectedRef.current) {
        shouldRejoinAfterReconnectRef.current = true;
      }
      return;
    }
    hadConnectedRef.current = true;
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected || !sessionId || currentSession?.sessionId !== sessionId || !currentSession.machineId) {
      return;
    }
    if (!shouldRejoinAfterReconnectRef.current) {
      return;
    }
    shouldRejoinAfterReconnectRef.current = false;
    console.log('[WorkspacePage][Diag] reconnect rejoin current session', {
      routeSessionId: sessionId,
      currentSessionId: currentSession.sessionId,
      machineId: currentSession.machineId,
      socketId: socketManager.getId(),
    });
    socketManager.joinSession(currentSession.sessionId, currentSession.machineId);
  }, [isConnected, sessionId, currentSession]);

  useEffect(() => {
    if (currentSession && currentSession.sessionId !== sessionId) {
      navigate(`/workspace/${currentSession.sessionId}`, { replace: true });
    }
  }, [currentSession, sessionId, navigate]);

  // 刷新后停留在 /workspace/xxx 时会尝试 join，若服务端返回「会话不存在」则跳转到机器列表，让用户从机器重新进入
  useEffect(() => {
    if (sessionId && !currentSession && error === ERROR_MESSAGES.SESSION_NOT_FOUND) {
      clearError();
      navigate('/machines', { replace: true });
    }
  }, [sessionId, currentSession, error, clearError, navigate]);

  // 仅在离开工作区页面时清空聊天；不在 sessionId 变化时清空，否则加入历史会话后 navigate 会触发清理，把刚加载的历史消息清空
  useEffect(() => {
    return () => { clearChat(); };
  }, [clearChat]);

  const machine = currentSession?.machineId
    ? machines.find((m) => m.id === currentSession.machineId)
    : machines[0];

  const machineId = machine?.id || '';
  const projectPath = currentSession?.projectPath || '';

  // 同步 Agent 连接状态与机器在线状态
  useEffect(() => {
    if (machine && currentSession) {
      const { setAgentConnectionState } = useSessionStore.getState();
      if (machine.isOnline) {
        setAgentConnectionState('connected');
      } else {
        setAgentConnectionState('disconnected', t('workspace.machineOffline'));
      }
    }
  }, [machine?.isOnline, currentSession]);

  const handleDisconnect = () => {
    useSessionStore.getState().leaveSession();
    navigate('/machines');
  };

  const handleBack = () => {
    useSessionStore.getState().leaveSession();
    // 返回到工程列表，而不是机器列表
    navigate(`/machines/${machineId}/projects`);
  };

  const handleNewSession = useCallback(() => {
    if (!machineId || !projectPath) return;
    useSessionStore.getState().leaveSession();
    clearChat();
    startSession(machineId, projectPath, 'chat');
  }, [machineId, projectPath, clearChat, startSession]);

  const handleFetchHistory = useCallback(() => {
    if (machineId && projectPath) {
      fetchSessionHistory(machineId, projectPath);
    }
  }, [machineId, projectPath, fetchSessionHistory]);

  const handleFetchFiles = useCallback(() => {
    if (machineId && projectPath) {
      fetchFileTree(machineId, projectPath);
    }
  }, [machineId, projectPath, fetchFileTree]);

  const handleSelectHistorySession = useCallback((sdkSessionId: string) => {
    if (!machineId || !projectPath) return;
    console.log('[WorkspacePage][Diag] select history session', {
      selectedSdkSessionId: sdkSessionId,
      currentSessionId: currentSession?.sessionId ?? null,
      machineId,
      projectPath,
      socketId: socketManager.getId(),
    });
    if (currentSession?.sessionId === sdkSessionId) {
      console.log('[WorkspacePage][Diag] ignore selecting active history session', {
        sdkSessionId,
        socketId: socketManager.getId(),
      });
      return;
    }
    useSessionStore.getState().leaveSession();
    // 清空当前消息和历史会话列表，准备加载新的历史会话
    clearChat();
    // 启动会话时带上 resume 参数，指定要恢复的 SDK 会话 ID
    startSession(machineId, projectPath, 'chat', {
      resume: sdkSessionId
    });
  }, [machineId, projectPath, currentSession?.sessionId, clearChat, startSession]);

  const handleFileClick = useCallback((filePath: string) => {
    if (!machineId || !projectPath) return;
    openFilePreview(machineId, projectPath, filePath);
  }, [machineId, projectPath, openFilePreview]);

  const handleFileDoubleClick = useCallback((filePath: string) => {
    if (!machineId || !projectPath) return;
    openFileFixed(machineId, projectPath, filePath);
  }, [machineId, projectPath, openFileFixed]);

  const handleStartShellSession = useCallback(() => {
    if (!machineId || !projectPath) return;
    useSessionStore.getState().leaveSession();
    clearChat();
    startSession(machineId, projectPath, 'shell');
  }, [machineId, projectPath, clearChat, startSession]);

  if (isLoading && !currentSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <Loading text={t('workspace.connecting')} />
      </div>
    );
  }

  return (
    <WorkspaceLayout
      machineName={machine?.name || t('workspace.unknownMachine')}
      machineOnline={machine?.isOnline ?? false}
      projectPath={projectPath}
      session={currentSession}
      machineId={machineId}
      sessionHistory={sessionHistory}
      isLoadingHistory={isLoadingHistory}
      fileTree={fileTree}
      isLoadingFiles={isLoadingFiles}
      onDisconnect={handleDisconnect}
      onBack={handleBack}
      onNewSession={handleNewSession}
      onFetchHistory={handleFetchHistory}
      onFetchFiles={handleFetchFiles}
      onSelectHistorySession={handleSelectHistorySession}
      onFileClick={handleFileClick}
      onFileDoubleClick={handleFileDoubleClick}
      onStartShellSession={handleStartShellSession}
      chatContent={
        sessionId ? (
          <ChatInterface sessionId={sessionId} machineId={machineId} projectPath={projectPath} />
        ) : <div />
      }
      shellContent={
        <Shell sessionId={sessionId ?? null} />
      }
      agentConnectionState={agentConnectionState}
      agentDisconnectReason={agentDisconnectReason}
    />
  );
};
