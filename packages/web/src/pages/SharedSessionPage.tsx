/**
 * SharedSessionPage — 访客/协作者查看页面
 * - viewer（匿名或已登录的 viewer 邀请）: 只读
 * - collaborator（已登录的 collaborator 邀请）: 可发送消息 + 处理权限请求
 * 角色由服务端在 SESSION_STARTED 中返回（基于 DB 邀请角色 + 是否携带 JWT 决定）。
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SocketEvents } from 'cc-remote-shared';
import type { ChatMessageEvent, ChatPermissionRequestEvent, Role } from 'cc-remote-shared';
import { ChatMessagesPane } from '../components/chat/ChatMessagesPane';
import { ChatComposer } from '../components/chat/ChatComposer';
import { PermissionBanner } from '../components/chat/PermissionBanner';
import { TokenUsagePanel } from '../components/chat/TokenUsagePanel';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores';
import { socketManager } from '../lib/socket';
import type { ChatMessage } from '../stores/chatStore';
import type { ChatPermission } from '../stores/chatStore';
import type { AttachmentRef } from 'cc-remote-shared';

const genSysId = (() => {
  let n = 0;
  return () => `sys-${Date.now()}-${++n}`;
})();

// 登录要求的错误标识（与服务端 JOIN_SHARED_SESSION 的协作邀请无 JWT 报错一致）
const LOGIN_REQUIRED_MARKER = '登录';

export const SharedSessionPage: React.FC = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // 本地权限请求状态（协作者审批横幅）
  const [permissions, setPermissions] = useState<ChatPermission[]>([]);

  const {
    messages,
    isGenerating,
    tokenUsage,
    handleChatEvent,
    sendMessage,
  } = useChatStore();

  const isCollaborator = role === 'collaborator';

  const connect = useCallback((token: string, authenticated: boolean) => {
    setIsConnecting(true);
    setError(null);
    setLoginRequired(false);
    setRole(null);
    setPermissions([]);

    // 消息事件
    const unsubChatMessage = socketManager.on(SocketEvents.CHAT_MESSAGE, (data: unknown) => {
      handleChatEvent(data as ChatMessageEvent);
    });
    const unsubChatToolUse = socketManager.on(SocketEvents.CHAT_TOOL_USE, (data: unknown) => {
      handleChatEvent(data as ChatMessageEvent);
    });
    const unsubChatToolResult = socketManager.on(SocketEvents.CHAT_TOOL_RESULT, (data: unknown) => {
      handleChatEvent(data as ChatMessageEvent);
    });
    const unsubChatComplete = socketManager.on(SocketEvents.CHAT_COMPLETE, () => {
      useChatStore.setState({ isGenerating: false });
    });

    // SESSION_STARTED：读取服务端授予的角色
    const unsubStarted = socketManager.on(SocketEvents.SESSION_STARTED, (data: unknown) => {
      const evt = data as { sessionId: string; role?: Role };
      if (evt.role) setRole(evt.role);
      if (evt.sessionId) setSessionId(evt.sessionId);
    });

    // 权限请求（仅 any 模式下协作者会收到）
    const unsubPermReq = socketManager.on(SocketEvents.CHAT_PERMISSION_REQUEST, (data: unknown) => {
      const evt = data as ChatPermissionRequestEvent;
      setPermissions((prev) => [
        ...prev,
        {
          requestId: evt.requestId,
          sessionId: evt.session_id,
          toolName: evt.toolName,
          toolInput: evt.toolInput,
          pending: true,
          timestamp: new Date(),
        },
      ]);
    });

    // first-approval-wins：其他端解决后清理本地横幅
    const unsubPermResolved = socketManager.on(SocketEvents.CHAT_PERMISSION_RESOLVED, (data: unknown) => {
      const evt = data as { requestId: string };
      setPermissions((prev) => prev.filter((p) => p.requestId !== evt.requestId));
    });

    const unsubError = socketManager.on(SocketEvents.ERROR, (data: unknown) => {
      const errData = data as { message: string };
      // 协作者邀请但未登录：提示登录
      if (errData.message && errData.message.includes(LOGIN_REQUIRED_MARKER) && !authenticated) {
        setLoginRequired(true);
      } else {
        setError(errData.message);
      }
      setIsConnecting(false);
    });

    const unsubStopShare = socketManager.on(SocketEvents.STOP_SHARE, () => {
      setError(t('share.stopped'));
      socketManager.disconnect();
    });

    const unsubParticipantRemoved = socketManager.on(SocketEvents.PARTICIPANT_REMOVED, (data: unknown) => {
      // 被owner移除：提示并断开
      const evt = data as { userId?: string };
      if (evt.userId) {
        setError(t('collab.removed'));
        socketManager.disconnect();
      }
    });

    const unsubDisconnect = socketManager.on('disconnect', () => {
      setIsReconnecting(true);
    });
    const unsubReconnect = socketManager.on('client:connected', () => {
      setIsReconnecting(false);
    });
    const unsubSocketConnect = socketManager.on('connect', () => {
      setIsReconnecting(false);
    });

    const serverUrl = window.location.origin;
    const connectPromise = authenticated
      ? socketManager.connectAsCollaborator({ url: serverUrl, token: useAuthStore.getState().token || '' }, token)
      : socketManager.connectAsViewer(serverUrl, token);

    connectPromise
      .then(() => {
        setIsConnecting(false);
        setIsReconnecting(false);
        // viewer 提示只读（collaborator 不提示）
        // 角色确定后在 effect 中按需追加系统提示
      })
      .catch((err: Error) => {
        setError(err.message);
        setIsConnecting(false);
      });

    return () => {
      unsubChatMessage();
      unsubChatToolUse();
      unsubChatToolResult();
      unsubChatComplete();
      unsubStarted();
      unsubPermReq();
      unsubPermResolved();
      unsubError();
      unsubStopShare();
      unsubParticipantRemoved();
      unsubDisconnect();
      unsubReconnect();
      unsubSocketConnect();
      socketManager.disconnect();
      useChatStore.setState({ messages: [], isGenerating: false });
    };
  }, [handleChatEvent, t]);

  useEffect(() => {
    if (!shareToken) {
      setError(t('share.invalidToken'));
      setIsConnecting(false);
      return;
    }
    const cleanup = connect(shareToken, isAuthenticated);
    return cleanup;
  }, [shareToken, isAuthenticated, connect, t]);

  // 角色确定为 viewer 时，追加只读系统提示（仅一次）
  useEffect(() => {
    if (role === 'viewer') {
      const sysMsg: ChatMessage = {
        id: genSysId(),
        type: 'assistant',
        content: `📋 ${t('share.cannotSend')}`,
        timestamp: new Date(),
      };
      useChatStore.setState((s) => ({ messages: [...s.messages, sysMsg] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const handleSend = useCallback((content: string, attachments?: AttachmentRef[]) => {
    if (!sessionId || !isCollaborator) return;
    sendMessage(sessionId, content, attachments);
  }, [sessionId, isCollaborator, sendMessage]);

  const handlePermission = useCallback(
    (requestId: string, approved: boolean, message?: string, updatedInput?: Record<string, unknown>) => {
      if (!sessionId) return;
      socketManager.answerChatPermission(sessionId, requestId, approved, message, updatedInput);
      setPermissions((prev) => prev.map((p) => (p.requestId === requestId ? { ...p, pending: false } : p)));
    },
    [sessionId],
  );

  const goToLogin = useCallback(() => {
    navigate(`/login?redirect=${encodeURIComponent(`/shared/${shareToken}`)}`);
  }, [navigate, shareToken]);

  // 登录要求提示
  if (loginRequired) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center space-y-4">
          <div className="text-4xl">🔐</div>
          <h1 className="text-xl font-semibold text-gray-700 dark:text-gray-200">
            {t('collab.loginRequired')}
          </h1>
          <button
            onClick={goToLogin}
            className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {t('collab.loginToJoin')}
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-semibold text-gray-700 dark:text-gray-200">
            {t('common.failed')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('share.connecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('share.title')}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${isCollaborator ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
            {isCollaborator ? t('collab.collaborating') : t('share.viewing')}
          </span>
          {isReconnecting && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 animate-pulse">
              {t('share.reconnecting')}
            </span>
          )}
        </div>
        <TokenUsagePanel
          used={tokenUsage?.total || 0}
          total={200000}
          isLoading={isGenerating}
        />
      </div>

      {/* Messages */}
      <ChatMessagesPane
        messages={messages}
        isGenerating={isGenerating}
        isResumed={false}
        isLoadingHistory={false}
        isLoadingMore={false}
        hasMoreHistory={false}
        onLoadMore={() => {}}
      />

      {/* 协作者：权限横幅 + 发送框 */}
      {isCollaborator && (
        <>
          <PermissionBanner permissions={permissions} onAnswer={handlePermission} />
          <ChatComposer
            onSend={handleSend}
            isGenerating={isGenerating}
            sessionId={sessionId ?? undefined}
          />
        </>
      )}
    </div>
  );
};
