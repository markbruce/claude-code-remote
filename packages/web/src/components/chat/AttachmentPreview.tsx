import React from 'react';
import type { PendingAttachment } from '../../hooks/useFileUpload';

interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({ attachments, onRemove }) => {
  if (attachments.length === 0) return null;

  return (
    <div className="flex gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-x-auto">
      {attachments.map(att => (
        <div
          key={att.id}
          className="relative flex-shrink-0 group"
        >
          {att.preview ? (
            <div className="w-16 h-16 rounded-md overflow-hidden border border-gray-200 dark:border-gray-600">
              <img src={att.preview} alt={att.file.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-md bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex flex-col items-center justify-center px-1">
              <span className="text-xs text-gray-400">&#128196;</span>
              <span className="text-[9px] text-gray-500 dark:text-gray-400 truncate w-full text-center">
                {att.file.name}
              </span>
              <span className="text-[8px] text-gray-400">
                {(att.file.size / 1024).toFixed(att.file.size > 1024 ? 1 : 0)}KB
              </span>
            </div>
          )}
          {att.status === 'uploading' && (
            <div className="absolute inset-0 bg-black/40 rounded-md flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {att.status === 'error' && (
            <div className="absolute inset-0 bg-red-500/40 rounded-md flex items-center justify-center">
              <span className="text-white text-xs">!</span>
            </div>
          )}
          <button
            onClick={() => onRemove(att.id)}
            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            &#10005;
          </button>
        </div>
      ))}
    </div>
  );
};
