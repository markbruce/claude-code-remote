import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatMessagesPane } from './ChatMessagesPane';
import { ChatComposer } from './ChatComposer';
import { PermissionBanner } from './PermissionBanner';
import { TokenUsagePanel } from './TokenUsagePanel';
import { useChatStore } from '../../stores/chatStore';
import { useSessionStore } from '../../stores/sessionStore';
import type { ChatMessage } from '../../stores/chatStore';
import type { AttachmentRef } from 'cc-remote-shared';

interface ChatInterfaceProps {
  sessionId: string;
  machineId?: string;
  projectPath?: string;
}

const genSysId = (() => {
  let n = 0;
  return () => `sys-${Date.now()}-${++n}`;
})();

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ sessionId, machineId, projectPath }) => {
  const { t } = useTranslation();
  const {
    messages,
    isGenerating,
    permissions,
    isLoadingHistory,
    isLoadingMore,
    hasMoreHistory,
    tokenUsage,
    sendMessage,
    answerPermission,
    clearMessages,
    loadMoreHistoryMessages,
  } = useChatStore();
  const isResumed = useSessionStore((s) => s.isResumedSession);
  const isSharing = useSessionStore((s) => s.isSharing);
  const shareLink = useSessionStore((s) => s.shareLink);
  const viewersCount = useSessionStore((s) => s.viewersCount);
  const startSharing = useSessionStore((s) => s.startSharing);
  const stopSharing = useSessionStore((s) => s.stopSharing);

  const handleShare = useCallback(() => {
    if (isSharing && shareLink) {
      navigator.clipboard.writeText(shareLink);
    } else {
      startSharing(sessionId);
    }
  }, [isSharing, shareLink, startSharing, sessionId]);

  const handleStopShare = useCallback(() => {
    stopSharing(sessionId);
  }, [stopSharing, sessionId]);

  const addSystemMessage = useCallback((content: string) => {
    const msg: ChatMessage = { id: genSysId(), type: 'assistant', content, timestamp: new Date() };
    useChatStore.setState((s) => ({ messages: [...s.messages, msg] }));
  }, []);

  const handleSend = useCallback(
    (content: string, attachments?: AttachmentRef[]) => {
      if (content === '/clear') {
        clearMessages();
        return;
      }
      if (content === '/help') {
        addSystemMessage(
          `**${t('chat.clearingHistory')}**\n\n` +
          `- \`/clear\` — ${t('chat.clearingHistory')}\n` +
          `- \`/help\` — ${t('chat.showHelp')}\n` +
          `- \`/compact\` — ${t('chat.compressContext')}\n` +
          `- \`/status\` — ${t('chat.showSessionStatus')}\n` +
          `- \`/model <model_name>\` — ${t('chat.modelSwitch')}\n\n`
        );
        return;
      }
      if (content === '/status') {
        addSystemMessage(
          `**${t('chat.showSessionStatus')}**\n\n` +
          `- Session ID: \`${sessionId.slice(0, 12)}...\`\n` +
          `- ${t('workspace.chat')}\n` +
          `- ${messages.length}\n` +
          `- ${isGenerating ? '●' : '○'}`
        );
        return;
      }
      if (content.startsWith('/model ')) {
        const model = content.replace('/model ', '').trim();
        addSystemMessage(t('chat.modelSwitchRequested', { model }));
        return;
      }
      if (content === '/compact') {
        sendMessage(sessionId, '/compact');
        return;
      }
      sendMessage(sessionId, content, attachments);
    },
    [sessionId, sendMessage, clearMessages, addSystemMessage, messages.length, isGenerating, t],
  );

  const handlePermission = useCallback(
    (requestId: string, approved: boolean, message?: string, updatedInput?: Record<string, unknown>) =>
      answerPermission(sessionId, requestId, approved, message, updatedInput),
    [sessionId, answerPermission],
  );

  const handleLoadMore = useCallback(() => {
    loadMoreHistoryMessages();
  }, [loadMoreHistoryMessages]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Chat</span>
          {isResumed && <span className="text-xs text-blue-500 dark:text-blue-400">({t('chat.resumedShort')})</span>}
        </div>
        <div className="flex items-center gap-2">
          {isSharing ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-green-600 dark:text-green-400">
                👁 {viewersCount} viewer{viewersCount !== 1 ? 's' : ''}
              </span>
              <button
                onClick={handleShare}
                className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Copy link"
              >
                Copy Link
              </button>
              <button
                onClick={handleStopShare}
                className="text-xs px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
              >
                Stop
              </button>
            </div>
          ) : (
            <button
              onClick={handleShare}
              className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="Share session"
            >
              Share
            </button>
          )}
          <TokenUsagePanel
            used={tokenUsage?.total || 0}
            total={200000}
            isLoading={isGenerating}
          />
        </div>
      </div>
      <ChatMessagesPane
        messages={messages}
        isGenerating={isGenerating}
        isResumed={isResumed}
        isLoadingHistory={isLoadingHistory}
        isLoadingMore={isLoadingMore}
        hasMoreHistory={hasMoreHistory}
        onLoadMore={handleLoadMore}
      />
      <PermissionBanner permissions={permissions} onAnswer={handlePermission} />
      <ChatComposer
        onSend={handleSend}
        isGenerating={isGenerating}
        machineId={machineId}
        projectPath={projectPath}
        sessionId={sessionId}
      />
    </div>
  );
};
