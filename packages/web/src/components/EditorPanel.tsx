import React, { useCallback, useEffect, useMemo } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { useResponsive } from '../hooks/useResponsive';
import { useSessionStore } from '../stores';
import { EditorTabs } from './EditorTabs';

interface EditorPanelProps {
  machineId: string | null;
  projectPath: string | null;
  /** Controls mobile overlay visibility */
  isOpen?: boolean;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  machineId,
  projectPath,
  isOpen = true,
}) => {
  const { theme } = useTheme();
  const { isMobile, isDesktop } = useResponsive();
  const { t } = useTranslation();

  const {
    editorTabs,
    activeTabPath,
    isSavingFile,
    switchTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    updateTabContent,
    saveFile,
  } = useSessionStore();

  // 获取当前激活的标签
  const activeTab = useMemo(() => {
    return editorTabs.find(t => t.path === activeTabPath) || null;
  }, [editorTabs, activeTabPath]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined && activeTab && !activeTab.readonly) {
        updateTabContent(activeTab.path, value);
      }
    },
    [updateTabContent, activeTab],
  );

  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      // 注册保存快捷键
      editor.addCommand(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).monaco?.KeyMod.CtrlCmd | (window as any).monaco?.KeyCode.KeyS,
        () => {
          if (activeTab?.isDirty && !activeTab.readonly && machineId && projectPath) {
            saveFile(machineId, projectPath);
          }
        },
      );
    },
    [activeTab, machineId, projectPath, saveFile],
  );

  // 全局快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (activeTab?.isDirty && !activeTab.readonly && machineId && projectPath) {
          saveFile(machineId, projectPath);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, machineId, projectPath, saveFile]);

  const handleSave = useCallback(() => {
    if (machineId && projectPath && activeTab?.isDirty && !activeTab.readonly) {
      saveFile(machineId, projectPath);
    }
  }, [machineId, projectPath, activeTab, saveFile]);

  const handleClose = useCallback(() => {
    if (activeTabPath) {
      closeTab(activeTabPath);
    }
  }, [activeTabPath, closeTab]);

  // 空状态
  if (editorTabs.length === 0 || !activeTab) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500">
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2H5.586a1 1 0 01.707.293l5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('editor.clickToPreview')}</p>
        </div>
      </div>
    );
  }

  const fileName = activeTab.path.split(/[/\\]/).pop() || activeTab.path;

  // Mobile overlay mode
  if (isMobile) {
    return (
      <>
        {/* Mobile backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
            onClick={handleClose}
          />
        )}

        {/* Mobile overlay panel */}
        <div
          className={`
            fixed inset-y-0 right-0 w-full max-w-full bg-white dark:bg-gray-900 z-50
            transform transition-transform duration-300 ease-in-out shadow-2xl
            ${isOpen ? 'translate-x-0' : 'translate-x-full'}
            flex flex-col
          `}
        >
          {/* Mobile Tabs */}
          <EditorTabs
            tabs={editorTabs}
            activeTabPath={activeTabPath}
            onTabClick={switchTab}
            onTabClose={closeTab}
            onCloseOthers={closeOtherTabs}
            onCloseAll={closeAllTabs}
          />

          {/* Mobile Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-gray-700 dark:text-gray-300 text-sm font-medium truncate" title={activeTab.path}>
                {fileName}
              </span>
              {activeTab.isDirty && <span className="text-gray-900 dark:text-white text-sm">*</span>}
              {activeTab.readonly && (
                <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded shrink-0">{t('editor.readOnly')}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSavingFile && <span className="text-xs text-blue-500 dark:text-blue-400">{t('editor.saveTip')}</span>}
              {!activeTab.readonly && activeTab.isDirty && (
                <button
                  onClick={handleSave}
                  disabled={isSavingFile}
                  className="px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('editor.save')}
                </button>
              )}
              <button
                onClick={handleClose}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600"
                aria-label={t('editor.close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile Editor */}
          <div className="flex-1 overflow-hidden">
            {activeTab.isLoading ? (
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                <div className="flex items-center gap-2">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5.683 5.373 5 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>{t('editor.loading')}</span>
                </div>
              </div>
            ) : activeTab.language === 'image' ? (
              <div className="h-full flex items-center justify-center p-4">
                <img
                  src={activeTab.content}
                  alt={fileName}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : (
              <Editor
                height="100%"
                language={activeTab.language}
                value={activeTab.content}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                options={{
                  readOnly: activeTab.readonly,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  renderWhitespace: 'selection',
                  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                }}
              />
            )}
          </div>
        </div>
      </>
    );
  }

  // Desktop mode - fixed 450px panel
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900" style={{ width: '450px' }}>
      {/* Tabs */}
      <EditorTabs
        tabs={editorTabs}
        activeTabPath={activeTabPath}
        onTabClick={switchTab}
        onTabClose={closeTab}
        onCloseOthers={closeOtherTabs}
        onCloseAll={closeAllTabs}
      />

      {/* Tab Header (file info) */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-gray-700 dark:text-gray-300 text-sm truncate max-w-[200px]" title={activeTab.path}>
            {fileName}
          </span>
          {activeTab.isDirty && <span className="text-gray-900 dark:text-white text-sm">*</span>}
          {activeTab.readonly && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">{t('editor.readOnly')}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isSavingFile && <span className="text-xs text-blue-500 dark:text-blue-400">{t('editor.saveTip')}</span>}
          {activeTab.isLoading && <span className="text-xs text-gray-400 dark:text-gray-500">{t('common.loading')}</span>}
          {!activeTab.readonly && activeTab.isDirty && (
            <button
              onClick={handleSave}
              disabled={isSavingFile}
              className="px-2 py-0.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('editor.save')}
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            title={t('editor.close')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {activeTab.isLoading ? (
          <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
            <div className="flex items-center gap-2">
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5.683 5.373 5 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>{t('editor.loading')}</span>
            </div>
          </div>
        ) : activeTab.language === 'image' ? (
          <div className="h-full flex items-center justify-center p-4">
            <img
              src={activeTab.content}
              alt={fileName}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : (
          <Editor
            height="100%"
            language={activeTab.language}
            value={activeTab.content}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
            options={{
              readOnly: activeTab.readonly,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              renderWhitespace: 'selection',
              fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            }}
          />
        )}
      </div>
    </div>
  );
};
