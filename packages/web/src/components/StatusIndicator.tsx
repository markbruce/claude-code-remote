/**
 * 在线状态指示器组件
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

interface StatusIndicatorProps {
  isOnline: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const sizeStyles: Record<string, { dot: string; text: string }> = {
  sm: { dot: 'w-2 h-2', text: 'text-xs' },
  md: { dot: 'w-3 h-3', text: 'text-sm' },
  lg: { dot: 'w-4 h-4', text: 'text-base' },
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  isOnline,
  size = 'md',
  showLabel = false,
}) => {
  const { t } = useTranslation();
  const styles = sizeStyles[size];

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`${styles.dot} rounded-full ${
          isOnline
            ? 'bg-green-500 animate-pulse'
            : 'bg-gray-400'
        }`}
      />
      {showLabel && (
        <span className={`${styles.text} ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
          {isOnline ? t('common.online') : t('common.offline')}
        </span>
      )}
    </div>
  );
};
