import { useState, useCallback } from 'react';
import type { AttachmentRef } from 'cc-remote-shared';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS = 5;

const ALLOWED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.kt',
  '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.md', '.txt', '.log', '.csv', '.sql', '.sh', '.bash',
  '.css', '.html', '.scss', '.less',
];

export interface PendingAttachment {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  fileId?: string;
  signedUrl?: string;
  preview?: string; // data URL for image preview
}

export interface useFileUploadReturn {
  attachments: PendingAttachment[];
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  uploadAll: (sessionId: string) => Promise<AttachmentRef[]>;
}

export function useFileUpload(): useFileUploadReturn {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setAttachments(prev => {
      const remaining = MAX_ATTACHMENTS - prev.length;
      const toAdd = fileArray.slice(0, remaining).filter(file => {
        // Size check
        if (file.size > MAX_FILE_SIZE) return false;
        // Type check — allow images and common text extensions
        if (file.type.startsWith('image/') || file.type.startsWith('text/')) return true;
        if (file.type === 'application/json' || file.type === 'application/xml') return true;
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        return ALLOWED_EXTENSIONS.includes(ext ?? '');
      }).map(file => ({
        id: crypto.randomUUID(),
        file,
        status: 'pending' as const,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      }));
      return [...prev, ...toAdd];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    attachments.forEach(att => {
      if (att.preview) URL.revokeObjectURL(att.preview);
    });
    setAttachments([]);
  }, [attachments]);

  const uploadAll = useCallback(async (sessionId: string): Promise<AttachmentRef[]> => {
    const pending = attachments.filter(a => a.status === 'pending' || a.status === 'error');
    const results: AttachmentRef[] = [];

    for (const att of pending) {
      setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'uploading' as const } : a));

      try {
        const formData = new FormData();
        formData.append('file', att.file);
        formData.append('session_id', sessionId);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Upload failed' }));
          setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'error' as const, error: err.error } : a));
          continue;
        }

        const result = await response.json();
        setAttachments(prev => prev.map(a => a.id === att.id ? {
          ...a,
          status: 'done' as const,
          fileId: result.fileId,
          signedUrl: result.signedUrl,
        } : a));

        results.push({
          fileId: result.fileId,
          signedUrl: result.signedUrl,
          filename: att.file.name,
          mimeType: att.file.type,
          size: att.file.size,
        });
      } catch {
        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'error' as const, error: 'Network error' } : a));
      }
    }

    return results;
  }, [attachments]);

  return { attachments, addFiles, removeAttachment, clearAttachments, uploadAll };
}
