import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentConnectionState } from 'cc-remote-shared';

interface AgentDisconnectOverlayProps {
  connectionState: AgentConnectionState;
  disconnectReason?: string;
  onReconnect?: () => void;
  onBackToList: () => void;
}

export const AgentDisconnectOverlay: React.FC<AgentDisconnectOverlayProps> = ({
  connectionState,
  disconnectReason,
  onReconnect,
  onBackToList,
}) => {
  const { t } = useTranslation();

  // 连接状态不显示遮罩
  if (connectionState === 'connected') return null;

  // 获取状态配置
  const config = {
    connecting: {
      icon: 'spinner',
      title: t('workspace.connectingSession'),
      description: t('common.loading'),
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/30',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      showButtons: false,
    },
    disconnecting: {
      icon: 'spinner',
      title: t('workspace.connectingSession'),
      description: t('errors.connectionLost'),
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/30',
      borderColor: 'border-orange-200 dark:border-orange-800',
      showButtons: false,
    },
    disconnected: {
      icon: 'error',
      title: t('errors.connectionLost'),
      description: disconnectReason ? formatDisconnectReason(disconnectReason, t) : t('errors.connectionFailed'),
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/30',
      borderColor: 'border-red-200 dark:border-red-800',
      showButtons: true,
    },
  }[connectionState];

  return (
    <div className="absolute inset-0 bg-white/95 dark:bg-gray-900/95 flex items-center justify-center z-50">
      <div className={`max-w-md w-full mx-4 p-6 rounded-lg border ${config.borderColor} ${config.bgColor} shadow-lg`}>
        {/* 图标 */}
        <div className="flex justify-center mb-4">
          {config.icon === 'spinner' && (
            <svg className={`w-12 h-12 animate-spin ${config.color}`} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5 5.373 5 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {config.icon === 'error' && (
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>

        {/* 标题 */}
        <h3 className={`text-lg font-semibold text-center mb-2 ${config.color}`}>
          {config.title}
        </h3>

        {/* 描述 */}
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">
          {config.description}
        </p>

        {/* 按钮 */}
        {config.showButtons && (
          <div className="flex flex-col gap-2">
            {onReconnect && (
              <button
                onClick={onReconnect}
                className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                {t('shell.reconnect')}
              </button>
            )}
            <button
              onClick={onBackToList}
              className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
            >
              {t('machines.backToList')}
            </button>
          </div>
        )}

        {/* 提示信息 */}
        {connectionState === 'disconnected' && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
            {t('shell.reconnect')}
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * 格式化断开原因
 */
function formatDisconnectReason(reason: string, t: (key: string) => string): string {
  const reasonMap: Record<string, string> = {
    'client namespace disconnect': t('notifications.clientDisconnect'),
    'server namespace disconnect': t('notifications.serverDisconnect'),
    'ping timeout': t('notifications.pingTimeout'),
    'transport close': t('notifications.transportClose'),
    'transport error': t('notifications.transportError'),
    'io server disconnect': t('notifications.serverActiveDisconnect'),
    'io client disconnect': t('notifications.clientActiveDisconnect'),
  };

  return reasonMap[reason] || reason;
}

export default AgentDisconnectOverlay;
