import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatPermission } from '../../stores/chatStore';
import { AskUserQuestionPanel } from './AskUserQuestionPanel';

interface PermissionBannerProps {
  permissions: ChatPermission[];
  onAnswer: (requestId: string, approved: boolean, message?: string, updatedInput?: Record<string, unknown>) => void;
}

// 自定义面板注册表
const customPanels: Record<string, React.FC<{
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  onDecision: (requestId: string, decision: { approved: boolean; message?: string; updatedInput?: Record<string, unknown> }) => void;
}>> = {
  AskUserQuestion: AskUserQuestionPanel as React.FC<{
    requestId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    onDecision: (requestId: string, decision: { approved: boolean; message?: string; updatedInput?: Record<string, unknown> }) => void;
  }>,
};

export const PermissionBanner: React.FC<PermissionBannerProps> = ({ permissions, onAnswer }) => {
  const { t } = useTranslation();
  const pending = permissions.filter((p) => p.pending);
  if (pending.length === 0) return null;

  return (
    <div className="border-t border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/30">
      {pending.map((perm) => {
        // 检查是否有自定义面板
        const CustomPanel = customPanels[perm.toolName];
        if (CustomPanel) {
          return (
            <div key={perm.requestId} className="px-4 py-3 max-w-4xl mx-auto">
              <CustomPanel
                requestId={perm.requestId}
                toolName={perm.toolName}
                toolInput={perm.toolInput}
                onDecision={(requestId, decision) => {
                  onAnswer(requestId, decision.approved, decision.message, decision.updatedInput);
                }}
              />
            </div>
          );
        }

        // 默认权限请求面板
        return (
          <div key={perm.requestId} className="px-4 py-3 flex items-start gap-3 max-w-4xl mx-auto">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-yellow-800 dark:text-yellow-300 text-sm font-medium mb-1">
                {t('chat.permissionRequest')}: <span className="font-mono text-yellow-700 dark:text-yellow-400">{perm.toolName}</span>
              </div>
              <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded p-2 overflow-x-auto max-h-24 mb-2">
                {JSON.stringify(perm.toolInput, null, 2)}
              </pre>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAnswer(perm.requestId, true)}
                  className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                >
                  {t('chat.approve')}
                </button>
                <button
                  onClick={() => onAnswer(perm.requestId, false)}
                  className="px-3 py-1 text-xs font-medium bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
                >
                  {t('chat.deny')}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
