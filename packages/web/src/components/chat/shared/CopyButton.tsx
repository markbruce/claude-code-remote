import React, { useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';

interface CopyButtonProps {
  text: string;
  className?: string;
  label?: string;
  successLabel?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = memo(({
  text,
  className = '',
  label,
  successLabel,
}) => {
  const { t } = useTranslation();
  const _label = label || t('common.copy');
  const _successLabel = successLabel || t('common.copied');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`relative flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 ${className}`}
      title={copied ? _successLabel : _label}
    >
      {copied ? (
        <svg className="h-3.5 w-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2z" />
        </svg>
      )}
      <span className="text-gray-500 dark:text-gray-400">{copied ? _successLabel : _label}</span>
    </button>
  );
});

CopyButton.displayName = 'CopyButton';
