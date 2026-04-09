import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../../stores/sessionStore';
import { AttachmentPreview } from './AttachmentPreview';
import { useFileUpload } from '../../hooks/useFileUpload';
import type { SlashCommandItem, AttachmentRef } from 'cc-remote-shared';

export interface SlashCommand {
  name: string;
  description: string;
  category: 'builtin' | 'model' | 'project' | 'user';
  action?: string;
  content?: string;
}

const BUILT_IN_COMMANDS: SlashCommand[] = [
  { name: '/clear', description: 'chat.clearingHistory', category: 'builtin' },
  { name: '/help', description: 'chat.showHelp', category: 'builtin' },
  { name: '/compact', description: 'chat.compressContext', category: 'builtin' },
  { name: '/status', description: 'chat.showSessionStatus', category: 'builtin' },
  { name: '/cost', description: 'chat.showTokenUsage', category: 'builtin' },
  { name: '/memory', description: 'chat.viewClaudeMd', category: 'builtin' },
];

const MODEL_COMMANDS: SlashCommand[] = [
  { name: '/model claude-sonnet-4-20250514', description: 'chat.modelSwitchSonnet', category: 'model', action: 'claude-sonnet-4-20250514' },
  { name: '/model claude-opus-4-20250514', description: 'chat.modelSwitchOpus', category: 'model', action: 'claude-opus-4-20250514' },
  { name: '/model claude-3-5-haiku-20241022', description: 'chat.modelSwitchHaiku', category: 'model', action: 'claude-3-5-haiku-20241022' },
];

const CATEGORY_LABELS: Record<string, string> = {
  builtin: 'chat.builtinCommands',
  model: 'chat.modelSwitch',
  project: 'chat.projectCommands',
  user: 'chat.skillCommands',
  plugin: 'chat.pluginCommands',
};

const CATEGORY_ICONS: Record<string, string> = {
  builtin: '/',
  model: 'M',
  project: 'P',
  user: 'S',
  plugin: 'P',
};

interface ChatComposerProps {
  onSend: (content: string, attachments?: AttachmentRef[]) => void;
  disabled?: boolean;
  isGenerating?: boolean;
  machineId?: string;
  projectPath?: string;
  sessionId?: string;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSend,
  disabled,
  isGenerating,
  machineId,
  projectPath,
  sessionId,
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const customCommands = useSessionStore((s) => s.customCommands);
  const fetchCommands = useSessionStore((s) => s.fetchCommands);
  const [commandsFetched, setCommandsFetched] = useState(false);
  const { attachments, addFiles, removeAttachment, clearAttachments, uploadAll } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (machineId && projectPath && !commandsFetched) {
      console.log('[ChatComposer] Fetching commands for:', machineId, projectPath);
      fetchCommands(machineId, projectPath);
      setCommandsFetched(true);
    }
  }, [machineId, projectPath, commandsFetched, fetchCommands]);

  // Debug: log when customCommands changes
  useEffect(() => {
    console.log('[ChatComposer] customCommands updated:', customCommands.length, 'commands');
    if (customCommands.length > 0) {
      const pdfCmd = customCommands.find(c => c.name === '/pdf');
      console.log('[ChatComposer] /pdf command found:', !!pdfCmd, pdfCmd);
    }
  }, [customCommands]);

  const allCommands = useMemo(() => {
    const custom: SlashCommand[] = customCommands.map((cmd: SlashCommandItem) => ({
      name: cmd.name,
      description: cmd.description,
      category: cmd.namespace as 'project' | 'user',
      content: cmd.content,
    }));
    return [...BUILT_IN_COMMANDS, ...MODEL_COMMANDS, ...custom].map(cmd => ({
      ...cmd,
      description: cmd.category === 'builtin' || cmd.category === 'model' ? t(cmd.description) : cmd.description,
    }));
  }, [customCommands, t]);

  const filteredCommands = useMemo(() => {
    if (!value.startsWith('/')) return [];
    const q = value.slice(1).toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q),
    );
  }, [value, allCommands]);

  const groupedCommands = useMemo(() => {
    const groups: { label: string; commands: { cmd: SlashCommand; globalIdx: number }[] }[] = [];
    const order = ['builtin', 'model', 'project', 'user', 'plugin'];
    let globalIdx = 0;

    for (const cat of order) {
      const cmds = filteredCommands.filter((c) => c.category === cat);
      if (cmds.length > 0) {
        groups.push({
          label: t(CATEGORY_LABELS[cat] || cat),
          commands: cmds.map((cmd) => ({ cmd, globalIdx: globalIdx++ })),
        });
      }
    }
    return groups;
  }, [filteredCommands, t]);

  useEffect(() => {
    if (value.startsWith('/') && filteredCommands.length > 0) {
      setShowMenu(true);
      setSelectedIdx(0);
    } else {
      setShowMenu(false);
    }
  }, [value, filteredCommands.length]);

  const selectCommand = useCallback(
    (cmd: SlashCommand) => {
      setShowMenu(false);

      // 将命令内容填充到输入框，而不是直接发送
      let fillValue = '';
      if (cmd.content) {
        fillValue = cmd.content;
      } else if (cmd.category === 'model' && cmd.action) {
        fillValue = `/model ${cmd.action}`;
      } else {
        fillValue = cmd.name;
      }

      setValue(fillValue);
      // 聚焦到输入框，让用户可以编辑
      setTimeout(() => {
        textareaRef.current?.focus();
        // 将光标移动到末尾
        textareaRef.current?.setSelectionRange(fillValue.length, fillValue.length);
      }, 0);
    },
    [],
  );

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleSubmit = useCallback(async () => {
    if (showMenu && filteredCommands.length > 0) {
      selectCommand(filteredCommands[selectedIdx] || filteredCommands[0]);
      return;
    }
    const trimmed = value.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled) return;

    // Upload any pending attachments first
    let uploadedRefs: AttachmentRef[] = [];
    if (sessionId && attachments.some(a => a.status === 'pending' || a.status === 'error')) {
      uploadedRefs = await uploadAll(sessionId);
    }

    // Include already-uploaded attachments too
    const existingRefs = attachments
      .filter(a => a.status === 'done' && a.fileId && a.signedUrl)
      .map(a => ({
        fileId: a.fileId!,
        signedUrl: a.signedUrl!,
        filename: a.file.name,
        mimeType: a.file.type,
        size: a.file.size,
      }));

    const allRefs = [...existingRefs, ...uploadedRefs];

    onSend(trimmed, allRefs.length > 0 ? allRefs : undefined);
    setValue('');
    clearAttachments();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [value, disabled, onSend, showMenu, filteredCommands, selectedIdx, selectCommand, attachments, clearAttachments, sessionId, uploadAll]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showMenu && filteredCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIdx((i) => (i < filteredCommands.length - 1 ? i + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIdx((i) => (i > 0 ? i - 1 : filteredCommands.length - 1));
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const cmd = filteredCommands[selectedIdx];
          if (cmd) {
            setValue(cmd.name + ' ');
            setShowMenu(false);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowMenu(false);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          selectCommand(filteredCommands[selectedIdx] || filteredCommands[0]);
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, showMenu, filteredCommands, selectedIdx, selectCommand],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  useEffect(() => {
    if (showMenu && menuRef.current) {
      const selected = menuRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx, showMenu]);

  return (
    <div
      className={`border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 relative ${isDragOver ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.json,.xml,.yaml,.yml,.md,.txt,.log,.csv,.sql,.sh,.css,.html"
        onChange={handleFileChange}
        className="hidden"
      />
      {/* Slash command menu */}
      {showMenu && filteredCommands.length > 0 && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-3 right-3 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-72 overflow-y-auto z-50"
        >
          <div className="p-1.5">
            {groupedCommands.map((group) => (
              <div key={group.label}>
                {groupedCommands.length > 1 && (
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
                    {group.label}
                  </div>
                )}
                {group.commands.map(({ cmd, globalIdx }) => (
                  <button
                    key={cmd.name + globalIdx}
                    data-selected={globalIdx === selectedIdx}
                    onClick={() => selectCommand(cmd)}
                    onMouseEnter={() => setSelectedIdx(globalIdx)}
                    className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-colors ${
                      globalIdx === selectedIdx ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] font-medium text-gray-500 dark:text-gray-400">
                      {CATEGORY_ICONS[cmd.category] || '/'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-mono truncate">{cmd.name}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{cmd.description}</div>
                    </div>
                    {globalIdx === selectedIdx && (
                      <span className="flex-shrink-0 text-[10px] text-gray-500 dark:text-gray-400">Enter</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />

      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        {/* Attachment button */}
        <button
          onClick={handleFileSelect}
          className="flex-shrink-0 p-2.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Attach file"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        {/* Slash button */}
        <button
          onClick={() => {
            if (!value.startsWith('/')) {
              setValue('/');
              textareaRef.current?.focus();
            } else {
              setShowMenu(!showMenu);
            }
          }}
          className={`flex-shrink-0 p-2.5 rounded-lg transition-colors ${
            showMenu || value.startsWith('/')
              ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          title={t('chat.slashCommands')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l10-16" />
          </svg>
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={isGenerating ? t('chat.claudeReplying') : t('chat.sendPlaceholder')}
            disabled={disabled}
            rows={1}
            className="w-full resize-none bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-4 py-2.5 text-sm placeholder-gray-400 dark:placeholder-gray-500 outline-none border border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400 focus:bg-white dark:focus:bg-gray-700 transition-colors disabled:opacity-50"
            style={{ maxHeight: 200 }}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={(!value.trim() && attachments.length === 0) || disabled}
          className="flex-shrink-0 p-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>

      <div className="max-w-4xl mx-auto mt-1.5 flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
        <span>{t('chat.enterToSend')}</span>
        <span>{t('chat.shiftEnterNewline')}</span>
        <span>{t('chat.commandLabel')}</span>
        {customCommands.length > 0 && (
          <span className="text-blue-500/60 dark:text-blue-400/60">{t('chat.customCommandCount', { count: customCommands.length })}</span>
        )}
      </div>
    </div>
  );
};
