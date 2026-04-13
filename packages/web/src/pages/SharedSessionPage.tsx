/**
 * SharedSessionPage — 访客只读查看页面
 * 无需登录，通过 URL 中的 shareToken 连接到分享的会话
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SocketEvents } from 'cc-remote-shared';
import { ChatMessagesPane } from '../components/chat/ChatMessagesPane';
import { TokenUsagePanel } from '../components/chat/TokenUsagePanel';
import { useChatStore } from '../stores/chatStore';
import { socketManager } from '../lib/socket';
import type { ChatMessage } from '../stores/chatStore';
import type { ChatMessageEvent } from 'cc-remote-shared';

const genSysId = (() => {
  let n = 0;
  return () => `sys-${Date.now()}-${++n}`;
})();

export const SharedSessionPage: React.FC = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    messages,
    isGenerating,
    tokenUsage,
    handleChatEvent,
  } = useChatStore();

  // 连接到分享会话
  useEffect(() => {
    if (!shareToken) {
      setError('缺少分享链接');
      setIsConnecting(false);
      return;
    }

    const serverUrl = window.location.origin;
    setIsConnecting(true);

    // 注册消息监听
    const unsubChatMessage = socketManager.on(SocketEvents.CHAT_MESSAGE, (data: unknown) => {
      const event = data as ChatMessageEvent;
      handleChatEvent(event);
    });

    const unsubChatToolUse = socketManager.on(SocketEvents.CHAT_TOOL_USE, (data: unknown) => {
      const event = data as ChatMessageEvent;
      handleChatEvent(event);
    });

    const unsubChatToolResult = socketManager.on(SocketEvents.CHAT_TOOL_RESULT, (data: unknown) => {
      const event = data as ChatMessageEvent;
      handleChatEvent(event);
    });

    const unsubChatComplete = socketManager.on(SocketEvents.CHAT_COMPLETE, (data: unknown) => {
      useChatStore.setState({ isGenerating: false });
    });

    const unsubError = socketManager.on(SocketEvents.ERROR, (data: unknown) => {
      const errData = data as { message: string };
      setError(errData.message);
      setIsConnecting(false);
    });

    const unsubStopShare = socketManager.on(SocketEvents.STOP_SHARE, () => {
      setError('会话分享已结束');
    });

    const unsubDisconnect = socketManager.on('disconnect', () => {
      setError('连接已断开');
    });

    // 以 viewer 身份连接
    socketManager.connectAsViewer(serverUrl, shareToken)
      .then(() => {
        setIsConnecting(false);
        const sysMsg: ChatMessage = {
          id: genSysId(),
          type: 'assistant',
          content: '📋 您正在以只读模式查看此会话。无法发送消息或审批权限。',
          timestamp: new Date(),
        };
        useChatStore.setState((s) => ({ messages: [...s.messages, sysMsg] }));
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
      unsubError();
      unsubStopShare();
      unsubDisconnect();
      socketManager.disconnect();
      useChatStore.setState({ messages: [], isGenerating: false });
    };
  }, [shareToken]);

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-semibold text-gray-700 dark:text-gray-200">无法访问</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            重试
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
          <p className="text-sm text-gray-500 dark:text-gray-400">正在连接分享会话...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Shared Session</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            Viewing
          </span>
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
    </div>
  );
};
