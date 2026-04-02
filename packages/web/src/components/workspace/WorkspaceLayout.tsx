import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { WorkspaceTabs, type TabId } from './WorkspaceTabs';
import { MobileNav } from './MobileNav';
import { EditorPanel } from '../EditorPanel';
import { AgentDisconnectOverlay } from './AgentDisconnectOverlay';
import { useResponsive } from '../../hooks/useResponsive';
import { useSessionStore } from '../../stores';
import { usePanelResize } from '../../hooks/usePanelResize';
import type { SessionInfo, SessionHistoryItem, FileTreeItem, AgentConnectionState } from 'cc-remote-shared';

// Panel resize configuration
const SIDEBAR_CONFIG = {
  storageKey: 'sidebar-width',
  defaultWidth: 224, // 56 * 4 = w-56
  minWidth: 180,
  maxWidth: 400,
};

const EDITOR_CONFIG = {
  storageKey: 'editor-width',
  defaultWidth: 450,
  minWidth: 300,
  maxWidth: 800,
};

interface WorkspaceLayoutProps {
  machineName: string;
  machineOnline: boolean;
  projectPath: string;
  session: SessionInfo | null;
  machineId: string;
  sessionHistory: SessionHistoryItem[];
  isLoadingHistory: boolean;
  fileTree: FileTreeItem[];
  isLoadingFiles: boolean;
  onDisconnect: () => void;
  onBack: () => void;
  onNewSession: () => void;
  onFetchHistory: () => void;
  onFetchFiles: () => void;
  onSelectHistorySession: (sdkSessionId: string) => void;
  /** 单击文件 - 预览模式 */
  onFileClick: (filePath: string) => void;
  /** 双击文件 - 固定标签 */
  onFileDoubleClick?: (filePath: string) => void;
  onStartShellSession: () => void;
  chatContent: React.ReactNode;
  shellContent: React.ReactNode;
  // Agent 连接状态
  agentConnectionState: AgentConnectionState;
  agentDisconnectReason?: string;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  machineName,
  machineOnline,
  projectPath,
  session,
  machineId,
  sessionHistory,
  isLoadingHistory,
  fileTree,
  isLoadingFiles,
  onDisconnect,
  onBack,
  onNewSession,
  onFetchHistory,
  onFetchFiles,
  onSelectHistorySession,
  onFileClick,
  onFileDoubleClick,
  onStartShellSession,
  chatContent,
  shellContent,
  agentConnectionState,
  agentDisconnectReason,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>(
    session?.mode === 'shell' ? 'shell' : 'chat',
  );

  // Get editor state from store
  const { editorTabs, activeTabPath, closeTab } = useSessionStore();
  const currentFile = activeTabPath;

  // Responsive state
  const responsive = useResponsive();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Panel resize hooks - only active in desktop mode
  const sidebarResize = usePanelResize({
    ...SIDEBAR_CONFIG,
    direction: 'left',
  });
  const editorResize = usePanelResize({
    ...EDITOR_CONFIG,
    direction: 'right',
  });

  // Auto-close mobile panels when switching to desktop
  useEffect(() => {
    if (responsive.isDesktop) {
      setIsSidebarOpen(false);
      setIsEditorOpen(false);
    }
  }, [responsive.isDesktop]);

  // Close mobile panels when switching tabs
  useEffect(() => {
    if (responsive.isMobile) {
      setIsEditorOpen(false);
    }
  }, [activeTab, responsive.isMobile]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    // 如果切换到 Shell tab 但当前是 Chat 会话，需要启动 Shell 会话
    if (tab === 'shell' && session?.mode !== 'shell' && onStartShellSession) {
      onStartShellSession();
    }
  };

  const handleOpenEditor = () => {
    if (activeTabPath) {
      setIsEditorOpen(true);
    }
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    // Mobile: close the active tab when closing the overlay
    if (responsive.isMobile && activeTabPath) {
      closeTab(activeTabPath);
    }
  };

  // Desktop mode (>= 1024px): Keep current layout unchanged
  // Tablet mode (768-1023px): Collapsible sidebar, Editor as slide-in overlay
  // Mobile mode (< 768px): Full-screen panels with bottom navigation
  const showDesktopLayout = responsive.isDesktop;
  const showTabletLayout = responsive.isTablet;
  const showMobileLayout = responsive.isMobile;

  return (
    <div className="h-screen w-screen max-w-screen flex bg-gray-100 dark:bg-gray-950 overflow-x-hidden overflow-y-hidden">
      {/* Sidebar */}
      <Sidebar
        machineName={machineName}
        machineOnline={machineOnline}
        projectPath={projectPath}
        session={session}
        machineId={machineId}
        sessionHistory={sessionHistory}
        isLoadingHistory={isLoadingHistory}
        fileTree={fileTree}
        isLoadingFiles={isLoadingFiles}
        currentFile={activeTabPath}
        onDisconnect={onDisconnect}
        onBack={onBack}
        onNewSession={onNewSession}
        onFetchHistory={onFetchHistory}
        onFetchFiles={onFetchFiles}
        onSelectHistorySession={onSelectHistorySession}
        onFileClick={onFileClick}
        onFileDoubleClick={onFileDoubleClick}
        isOpen={showDesktopLayout ? true : isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        width={showDesktopLayout ? sidebarResize.width : undefined}
      />

      {/* Sidebar resize handle - desktop only */}
      {showDesktopLayout && (
        <div
          {...sidebarResize.handleProps}
          className={`w-1 bg-transparent hover:bg-blue-400 dark:hover:bg-blue-500 cursor-col-resize transition-colors flex-shrink-0 ${
            sidebarResize.isResizing ? 'bg-blue-400 dark:bg-blue-500' : ''
          }`}
        />
      )}

      {/* Main Content Area */}
      <div className={`flex flex-col min-w-0 relative ${
        showDesktopLayout ? 'flex-1' : 'flex-1 w-full'
      }`}>
        {/* WorkspaceTabs - only show on desktop */}
        {showDesktopLayout && (
          <WorkspaceTabs activeTab={activeTab} onTabChange={handleTabChange} />
        )}

        {/* Content Area */}
        <div className={`flex overflow-hidden ${
          showDesktopLayout ? 'flex-1 flex' : 'flex-1'
        } ${!showDesktopLayout ? 'pb-16' : ''}`}>
          {/* Chat/Shell Panel */}
          <div className={`flex-1 flex flex-col min-w-0 overflow-hidden relative bg-white dark:bg-gray-900 ${
            showDesktopLayout ? 'border-r border-gray-200 dark:border-gray-700' : ''
          }`}>
            <div className={`absolute inset-0 ${activeTab === 'chat' ? '' : 'hidden'}`}>
              {chatContent}
            </div>
            <div className={`absolute inset-0 ${activeTab === 'shell' ? '' : 'hidden'}`}>
              {shellContent}
            </div>
          </div>

          {/* Editor Panel */}
          {showDesktopLayout ? (
            /* Desktop: Always visible as right panel with resize support */
            <>
              {/* Editor resize handle */}
              <div
                {...editorResize.handleProps}
                className={`w-1 bg-transparent hover:bg-blue-400 dark:hover:bg-blue-500 cursor-col-resize transition-colors flex-shrink-0 ${
                  editorResize.isResizing ? 'bg-blue-400 dark:bg-blue-500' : ''
                }`}
              />
              <div
                className="border-l border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden bg-white dark:bg-gray-900"
                style={{ width: `${editorResize.width}px` }}
              >
                <EditorPanel
                  machineId={machineId}
                  projectPath={projectPath}
                  isOpen={true}
                />
              </div>
            </>
          ) : (
            /* Tablet/Mobile: Full-screen overlay */
            <>
              {/* Backdrop for tablet editor */}
              {showTabletLayout && activeTabPath && (
                <div
                  className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 ${
                    isEditorOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                  onClick={handleCloseEditor}
                  aria-hidden="true"
                />
              )}
              {/* Editor overlay */}
              <div
                className={`fixed inset-y-0 right-0 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 z-40 transition-transform duration-300 ease-in-out ${
                  showMobileLayout ? 'w-full' : 'w-[450px] max-w-[80vw]'
                } ${isEditorOpen && activeTabPath ? 'translate-x-0' : 'translate-x-full'}`}
              >
                <EditorPanel
                  machineId={machineId}
                  projectPath={projectPath}
                  isOpen={isEditorOpen && !!activeTabPath}
                />
              </div>
            </>
          )}
        </div>

        {/* Mobile/Tablet Navigation */}
        {!showDesktopLayout && (
          <MobileNav
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            onOpenEditor={handleOpenEditor}
            isEditorAvailable={!!activeTabPath}
          />
        )}

        {/* Agent Disconnect Overlay */}
        <AgentDisconnectOverlay
          connectionState={agentConnectionState}
          disconnectReason={agentDisconnectReason}
          onBackToList={onBack}
        />
      </div>
    </div>
  );
};
