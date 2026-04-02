import React, { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageComponent } from './MessageComponent';
import type { ChatMessage } from '../../stores/chatStore';

interface ChatMessagesPaneProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  isResumed?: boolean;
  isLoadingHistory?: boolean;
  isLoadingMore?: boolean;
  hasMoreHistory?: boolean;
  onLoadMore?: () => void;
}

export const ChatMessagesPane: React.FC<ChatMessagesPaneProps> = ({
  messages,
  isGenerating,
  isResumed,
  isLoadingHistory,
  isLoadingMore,
  hasMoreHistory,
  onLoadMore,
}) => {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const prevScrollHeightRef = useRef(0);

  // 新消息时自动滚动到底部
  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 处理滚动，只用于判断是否在底部
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    autoScrollRef.current = atBottom;
  }, []);

  // 点击加载更多
  const handleLoadMore = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    prevScrollHeightRef.current = el.scrollHeight;
    onLoadMore?.();
  }, [onLoadMore]);

  // 加载更多后恢复滚动位置
  useEffect(() => {
    const el = containerRef.current;
    if (!el || prevScrollHeightRef.current === 0) return;

    // 当 messages 变化且之前记录了滚动高度时（即刚加载完更多消息）
    if (!isLoadingMore && messages.length > 0) {
      const newScrollHeight = el.scrollHeight;
      const diff = newScrollHeight - prevScrollHeightRef.current;
      el.scrollTop = diff;
      prevScrollHeightRef.current = 0;
    }
  }, [isLoadingMore, messages]);

  if (isLoadingHistory) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 px-8">
        <svg className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-500 mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm">{t('chat.loading')}</p>
      </div>
    );
  }

  if (messages.length === 0 && !isResumed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 px-8">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center mb-4">
          <span className="text-3xl text-white font-bold">C</span>
        </div>
        <h2 className="text-lg font-medium text-gray-300 dark:text-gray-400 mb-2">Claude Code Remote</h2>
        <p className="text-center text-sm max-w-md">
          {t('chat.welcomeMessage')}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
    >
      <div className="max-w-4xl mx-auto space-y-4">
        {/* 加载更多按钮 */}
        <div className="text-center py-2">
          {isLoadingMore ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('common.loading')}
            </div>
          ) : hasMoreHistory ? (
            <button
              onClick={handleLoadMore}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-sm px-4 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {t('chat.loadMore')}
            </button>
          ) : messages.length > 0 ? (
            <div className="text-gray-400 dark:text-gray-500 text-xs">{t('chat.noMoreHistory')}</div>
          ) : null}
        </div>

        {isResumed && (
          <div className="text-center py-3 px-4 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm">
            {t('chat.resumed')}
          </div>
        )}
        {messages.map((msg, idx) => (
          <MessageComponent key={msg.id} message={msg} prevMessage={idx > 0 ? messages[idx - 1] : null} />
        ))}
        {isGenerating && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && messages[messages.length - 1]?.type !== 'tool_use' && (
          <div className="pl-8 text-gray-500 dark:text-gray-400 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t('chat.thinking')}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
