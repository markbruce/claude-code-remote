import React from 'react';
import { useTranslation } from 'react-i18next';

interface TokenUsagePanelProps {
  used: number;
  total?: number;
  isLoading?: boolean;
}

/**
 * Token/Context 使用量显示组件
 * 参考 claudecodeui 的 TokenUsagePie 实现
 * - used: 已使用的 token 数量
 * - total: context 窗口大小（默认 200000）
 */
export const TokenUsagePanel: React.FC<TokenUsagePanelProps> = ({
  used,
  total = 200000,
  isLoading,
}) => {
  const { t } = useTranslation();
  // 过滤无效值
  if (used == null || total == null || total <= 0) return null;

  const percentage = Math.min(100, (used / total) * 100);
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  // 根据使用量选择颜色
  const getColor = () => {
    if (percentage < 50) return '#3b82f6'; // 蓝色
    if (percentage < 75) return '#f59e0b'; // 橙色
    return '#ef4444'; // 红色
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-500 dark:text-gray-400">
        <div className="animate-pulse w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full" />
        <span>{t('chat.computing')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
      <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90 transform">
        {/* 背景圆环 */}
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-gray-300 dark:text-gray-600"
        />
        {/* 进度圆环 */}
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span title={`${used.toLocaleString()} / ${total.toLocaleString()} tokens`}>
        {percentage.toFixed(1)}%
      </span>
    </div>
  );
};
