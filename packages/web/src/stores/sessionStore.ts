/**
 * 会话状态管理
 */

import { create } from 'zustand';
import type {
  SessionInfo,
  SessionOutputEvent,
  SessionEndEvent,
  SessionOptions,
  SessionHistoryItem,
  FileTreeItem,
  SlashCommandItem,
  FileContentResponse,
  ValidatePathResponse,
} from 'cc-remote-shared';
import { SocketEvents, AgentConnectionState } from 'cc-remote-shared';
import { socketManager } from '../lib/socket';
import { useChatStore } from './chatStore';
import i18n from '../i18n';

// 权限请求
export interface PermissionRequest {
  id: string;
  sessionId: string;
  message: string;
  timestamp: Date;
  pending: boolean;
}

// 编辑器标签页
export interface EditorTab {
  path: string;           // 文件路径
  content: string;        // 文件内容
  language: string;       // 语言类型
  isDirty: boolean;       // 是否有未保存的修改
  readonly: boolean;      // 是否只读
  isPreview: boolean;     // 是否为预览标签（斜体显示，会被下一个单击替换）
  isLoading: boolean;     // 是否正在加载
  scrollPosition?: number; // 滚动位置
}

const MAX_TABS = 10; // 最大标签页数量

interface SessionState {
  // 状态
  currentSession: SessionInfo | null;
  sessions: Map<string, SessionInfo>;
  outputBuffer: Map<string, string[]>; // sessionId -> output lines
  permissionRequests: PermissionRequest[];
  isLoading: boolean;
  error: string | null;
  inputHistory: string[];
  sessionHistory: SessionHistoryItem[];
  isLoadingHistory: boolean;
  isResumedSession: boolean;
  fileTree: FileTreeItem[];
  isLoadingFiles: boolean;
  loadingDirs: Set<string>; // 正在加载子目录的路径集合
  customCommands: SlashCommandItem[];
  pendingSessionRequestId: string | null; // 用于验证 SESSION_STARTED 是否是自己发起的

  // 会话分享状态
  isSharing: boolean;
  shareLink: string | null;
  viewersCount: number;

  // 多标签页编辑状态
  editorTabs: EditorTab[];
  activeTabPath: string | null;
  isSavingFile: boolean;  // 保存中状态（全局）

  // Agent 连接状态
  agentConnectionState: AgentConnectionState;
  agentDisconnectReason?: string;

  // 路径验证状态
  isValidatingPath: boolean;
  pathValidationError: string | null;
  validatedPath: string | null;

  // 操作
  startSession: (machineId: string, projectPath: string, mode?: 'chat' | 'shell', options?: SessionOptions) => void;
  joinSession: (sessionId: string, machineId: string) => void;
  leaveSession: () => void;
  sendInput: (input: string) => void;
  answerPermission: (requestId: string, approved: boolean, message?: string) => void;
  appendOutput: (sessionId: string, output: SessionOutputEvent) => void;
  setBuffer: (sessionId: string, lines: string[]) => void;
  addPermissionRequest: (request: PermissionRequest) => void;
  clearPermissionRequest: (requestId: string) => void;
  setCurrentSession: (session: SessionInfo | null) => void;
  fetchSessionHistory: (machineId: string, projectPath: string) => void;
  fetchFileTree: (machineId: string, projectPath: string) => void;
  expandDir: (machineId: string, projectPath: string, dirPath: string) => void;
  fetchCommands: (machineId: string, projectPath: string) => void;
  clearError: () => void;
  reset: () => void;

  // 会话分享操作
  startSharing: (sessionId: string) => void;
  stopSharing: (sessionId: string) => void;

  // 文件操作（多标签）
  openFilePreview: (machineId: string, projectPath: string, filePath: string) => void;
  openFileFixed: (machineId: string, projectPath: string, filePath: string) => void;
  closeTab: (filePath: string) => void;
  closeOtherTabs: (filePath: string) => void;
  closeAllTabs: () => void;
  switchTab: (filePath: string) => void;
  updateTabContent: (filePath: string, content: string) => void;
  saveFile: (machineId: string, projectPath: string) => void;
  setTabContent: (filePath: string, data: FileContentResponse) => void;
  setFileSaved: (success: boolean, error?: string) => void;

  // 兼容旧接口
  openFile: (machineId: string, projectPath: string, filePath: string) => void;
  closeFile: () => void;
  updateFileContent: (content: string) => void;

  // Agent 连接状态操作
  setAgentConnectionState: (state: AgentConnectionState, reason?: string) => void;

  // 路径验证操作
  validatePath: (machineId: string, path: string) => void;
  setPathValidationResult: (result: ValidatePathResponse) => void;
  clearPathValidationError: () => void;
}

const MAX_BUFFER_SIZE = 1000;
const MAX_HISTORY_SIZE = 100;

export const useSessionStore = create<SessionState>((set, get) => ({
  // 初始状态
  currentSession: null,
  sessions: new Map(),
  outputBuffer: new Map(),
  permissionRequests: [],
  isLoading: false,
  error: null,
  inputHistory: [],
  sessionHistory: [],
  isLoadingHistory: false,
  isResumedSession: false,
  fileTree: [],
  isLoadingFiles: false,
  loadingDirs: new Set(),
  customCommands: [],
  pendingSessionRequestId: null,

  // 会话分享
  isSharing: false,
  shareLink: null,
  viewersCount: 0,

  // 多标签页编辑初始状态
  editorTabs: [],
  activeTabPath: null,
  isSavingFile: false,

  // Agent 连接状态初始值
  agentConnectionState: 'connected',
  agentDisconnectReason: undefined,

  // 路径验证初始状态
  isValidatingPath: false,
  pathValidationError: null,
  validatedPath: null,

  // 启动会话
  startSession: (machineId: string, projectPath: string, mode: 'chat' | 'shell' = 'shell', options?: SessionOptions) => {
    set({ isLoading: true, error: null, isResumedSession: !!options?.resume });
    const requestId = socketManager.startSession(machineId, projectPath, mode, options);
    if (requestId) {
      set({ pendingSessionRequestId: requestId });
    }
  },

  // 加入会话
  joinSession: (sessionId: string, machineId: string) => {
    set({ isLoading: true, error: null });
    socketManager.joinSession(sessionId, machineId);
  },

  // 离开会话
  leaveSession: () => {
    const currentSession = get().currentSession;
    console.log('[SessionStore][Diag] leaveSession', {
      currentSessionId: currentSession?.sessionId ?? null,
      machineId: currentSession?.machineId ?? null,
    });
    if (currentSession) {
      socketManager.leaveSession(currentSession.sessionId);
    }
    useChatStore.getState().setActiveSession(null, null, null);
    set({
      currentSession: null,
      // 清理多标签页编辑器状态，避免切换会话后残留
      editorTabs: [],
      activeTabPath: null,
      isSavingFile: false,
    });
  },

  // 发送输入
  sendInput: (input: string) => {
    const session = get().currentSession;
    if (!session) return;

    socketManager.sendSessionInput(session.sessionId, input);

    // 添加到历史记录
    const history = get().inputHistory;
    const newHistory = [input, ...history.filter(h => h !== input)].slice(0, MAX_HISTORY_SIZE);
    set({ inputHistory: newHistory });
  },

  // 回答权限请求
  answerPermission: (requestId: string, approved: boolean, message?: string) => {
    const request = get().permissionRequests.find(r => r.id === requestId);
    if (!request) return;

    socketManager.answerPermission(request.sessionId, approved, message);
    get().clearPermissionRequest(requestId);
  },

  // 添加输出
  appendOutput: (sessionId: string, output: SessionOutputEvent) => {
    const bufferMap = new Map(get().outputBuffer);
    const buffer = bufferMap.get(sessionId) || [];

    // 格式化输出行
    const timestamp = new Date(output.timestamp).toLocaleTimeString();
    const prefix = output.type === 'stderr' ? '[ERR] ' :
                   output.type === 'tool_call' ? '[TOOL] ' :
                   output.type === 'permission_request' ? '[PERM] ' : '';
    const line = `[${timestamp}] ${prefix}${output.data}`;

    // 限制缓冲区大小
    const newBuffer = [...buffer, line].slice(-MAX_BUFFER_SIZE);
    bufferMap.set(sessionId, newBuffer);

    set({ outputBuffer: bufferMap });
  },

  // 设置缓冲区
  setBuffer: (sessionId: string, lines: string[]) => {
    const bufferMap = new Map(get().outputBuffer);
    bufferMap.set(sessionId, lines.slice(-MAX_BUFFER_SIZE));
    set({ outputBuffer: bufferMap });
  },

  // 添加权限请求
  addPermissionRequest: (request: PermissionRequest) => {
    set((state) => ({
      permissionRequests: [...state.permissionRequests, request],
    }));
  },

  // 清除权限请求
  clearPermissionRequest: (requestId: string) => {
    set((state) => ({
      permissionRequests: state.permissionRequests.filter(r => r.id !== requestId),
    }));
  },

  // 设置当前会话
  setCurrentSession: (session: SessionInfo | null) => {
    set({ currentSession: session, isLoading: false });
  },

  // 获取会话历史
  fetchSessionHistory: (machineId: string, projectPath: string) => {
    set({ isLoadingHistory: true });
    socketManager.listSessions(machineId, projectPath);
  },

  // 获取文件列表
  fetchFileTree: (machineId: string, projectPath: string) => {
    set({ isLoadingFiles: true });
    socketManager.listFiles(machineId, projectPath);
  },

  // 懒加载：展开指定子目录
  expandDir: (machineId: string, projectPath: string, dirPath: string) => {
    const { loadingDirs } = useSessionStore.getState();
    if (loadingDirs.has(dirPath)) return; // 防止重复请求
    set({ loadingDirs: new Set([...loadingDirs, dirPath]) });
    socketManager.listFiles(machineId, projectPath, dirPath);
  },

  // 获取斜杠命令列表
  fetchCommands: (machineId: string, projectPath: string) => {
    socketManager.listCommands(machineId, projectPath);
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },

  // 会话分享：发起分享
  startSharing: (sessionId: string) => {
    socketManager.shareSession(sessionId);
  },

  // 会话分享：停止分享
  stopSharing: (sessionId: string) => {
    socketManager.stopShare(sessionId);
    set({ isSharing: false, shareLink: null, viewersCount: 0 });
  },

  // 打开文件（预览模式）- 单击时调用
  openFilePreview: (machineId: string, projectPath: string, filePath: string) => {
    const { editorTabs } = get();

    // 检查文件是否已经打开
    const existingTab = editorTabs.find(t => t.path === filePath);
    if (existingTab) {
      // 如果已存在，激活该标签
      set({ activeTabPath: filePath });
      return;
    }

    // 找到当前的预览标签
    const previewTabIndex = editorTabs.findIndex(t => t.isPreview);
    let newTabs: EditorTab[];

    if (previewTabIndex >= 0) {
      // 替换现有的预览标签
      newTabs = [...editorTabs];
      newTabs[previewTabIndex] = {
        path: filePath,
        content: '',
        language: 'plaintext',
        isDirty: false,
        readonly: false,
        isPreview: true,
        isLoading: true,
      };
    } else {
      // 检查是否达到最大标签数
      if (editorTabs.length >= MAX_TABS) {
        set({ error: i18n.t('workspace.maxTabsWarning', { max: MAX_TABS }) });
        return;
      }
      // 添加新的预览标签
      newTabs = [...editorTabs, {
        path: filePath,
        content: '',
        language: 'plaintext',
        isDirty: false,
        readonly: false,
        isPreview: true,
        isLoading: true,
      }];
    }

    set({ editorTabs: newTabs, activeTabPath: filePath });
    socketManager.readFile(machineId, projectPath, filePath);
  },

  // 打开文件（固定模式）- 双击时调用
  openFileFixed: (machineId: string, projectPath: string, filePath: string) => {
    const { editorTabs } = get();

    // 检查文件是否已经打开
    const existingTab = editorTabs.find(t => t.path === filePath);
    if (existingTab) {
      // 如果已存在，将其转为固定标签并激活
      const newTabs = editorTabs.map(t =>
        t.path === filePath ? { ...t, isPreview: false } : t
      );
      set({ editorTabs: newTabs, activeTabPath: filePath });
      return;
    }

    // 检查是否达到最大标签数
    if (editorTabs.length >= MAX_TABS) {
      set({ error: i18n.t('workspace.maxTabsWarning', { max: MAX_TABS }) });
      return;
    }

    // 添加新的固定标签
    const newTabs = [...editorTabs, {
      path: filePath,
      content: '',
      language: 'plaintext',
      isDirty: false,
      readonly: false,
      isPreview: false,
      isLoading: true,
    }];

    set({ editorTabs: newTabs, activeTabPath: filePath });
    socketManager.readFile(machineId, projectPath, filePath);
  },

  // 兼容旧接口 - 默认为预览模式
  openFile: (machineId: string, projectPath: string, filePath: string) => {
    get().openFilePreview(machineId, projectPath, filePath);
  },

  // 关闭指定标签
  closeTab: (filePath: string) => {
    const { editorTabs, activeTabPath } = get();
    const newTabs = editorTabs.filter(t => t.path !== filePath);

    let newActiveTab = activeTabPath;
    if (activeTabPath === filePath) {
      // 如果关闭的是当前激活的标签，切换到前一个或后一个
      const closedIndex = editorTabs.findIndex(t => t.path === filePath);
      if (newTabs.length > 0) {
        newActiveTab = newTabs[Math.min(closedIndex, newTabs.length - 1)].path;
      } else {
        newActiveTab = null;
      }
    }

    set({ editorTabs: newTabs, activeTabPath: newActiveTab });
  },

  // 关闭其他标签
  closeOtherTabs: (filePath: string) => {
    const { editorTabs } = get();
    const targetTab = editorTabs.find(t => t.path === filePath);
    if (targetTab) {
      set({ editorTabs: [targetTab], activeTabPath: filePath });
    }
  },

  // 关闭所有标签
  closeAllTabs: () => {
    set({ editorTabs: [], activeTabPath: null });
  },

  // 切换标签
  switchTab: (filePath: string) => {
    set({ activeTabPath: filePath });
  },

  // 更新标签内容（用户编辑时）
  updateTabContent: (filePath: string, content: string) => {
    const { editorTabs } = get();
    const tab = editorTabs.find(t => t.path === filePath);
    if (!tab) return;

    if (content !== tab.content) {
      const newTabs = editorTabs.map(t =>
        t.path === filePath
          ? { ...t, content, isDirty: true, isPreview: false }  // 编辑时自动转为固定标签
          : t
      );
      set({ editorTabs: newTabs });
    }
  },

  // 兼容旧接口 - 更新当前激活标签的内容
  updateFileContent: (content: string) => {
    const { activeTabPath } = get();
    if (activeTabPath) {
      get().updateTabContent(activeTabPath, content);
    }
  },

  // 关闭文件（兼容旧接口）- 关闭当前激活的标签
  closeFile: () => {
    const { activeTabPath } = get();
    if (activeTabPath) {
      get().closeTab(activeTabPath);
    }
  },

  // 保存文件
  saveFile: (machineId: string, projectPath: string) => {
    const { editorTabs, activeTabPath } = get();
    if (!activeTabPath) return;

    const activeTab = editorTabs.find(t => t.path === activeTabPath);
    if (!activeTab) return;

    set({ isSavingFile: true });
    socketManager.writeFile(machineId, projectPath, activeTabPath, activeTab.content);
  },

  // 设置标签内容（从服务器接收）
  setTabContent: (filePath: string, data: FileContentResponse) => {
    const { editorTabs } = get();
    const newTabs = editorTabs.map(t =>
      t.path === filePath
        ? {
            ...t,
            content: data.content,
            language: data.language,
            isDirty: false,
            isLoading: false,
            readonly: data.readonly ?? false,
          }
        : t
    );
    set({ editorTabs: newTabs });
  },

  // 兼容旧接口
  setFileContent: (data: FileContentResponse) => {
    const { activeTabPath } = get();
    if (activeTabPath) {
      get().setTabContent(activeTabPath, data);
    }
  },

  // 文件保存结果
  setFileSaved: (success: boolean, error?: string) => {
    const { editorTabs, activeTabPath } = get();

    if (success && activeTabPath) {
      const newTabs = editorTabs.map(t =>
        t.path === activeTabPath ? { ...t, isDirty: false } : t
      );
      set({ editorTabs: newTabs, isSavingFile: false });
    } else {
      set({ isSavingFile: false, error: error || i18n.t('errors.saveFileFailed') });
    }
  },

  // 设置 Agent 连接状态
  setAgentConnectionState: (state: AgentConnectionState, reason?: string) => {
    set({ agentConnectionState: state, agentDisconnectReason: reason });
  },

  // 验证路径
  validatePath: (machineId: string, path: string) => {
    set({ isValidatingPath: true, pathValidationError: null, validatedPath: null });
    const requestId = socketManager.validatePath(machineId, path);
    if (!requestId) {
      set({ isValidatingPath: false, pathValidationError: i18n.t('errors.cannotConnectServer') });
    }
  },

  // 设置路径验证结果
  setPathValidationResult: (result: ValidatePathResponse) => {
    if (result.valid) {
      set({
        isValidatingPath: false,
        pathValidationError: null,
        validatedPath: result.path || null,
      });
    } else {
      set({
        isValidatingPath: false,
        pathValidationError: result.error || i18n.t('errors.invalidPath'),
        validatedPath: null,
      });
    }
  },

  // 清除路径验证错误
  clearPathValidationError: () => {
    set({ pathValidationError: null, validatedPath: null });
  },

  // 重置
  reset: () => {
    set({
      currentSession: null,
      sessions: new Map(),
      outputBuffer: new Map(),
      permissionRequests: [],
      isLoading: false,
      error: null,
      sessionHistory: [],
      isLoadingHistory: false,
      isResumedSession: false,
      fileTree: [],
      isLoadingFiles: false,
      customCommands: [],
      editorTabs: [],
      activeTabPath: null,
      isSavingFile: false,
      agentConnectionState: 'connected',
      agentDisconnectReason: undefined,
      isValidatingPath: false,
      pathValidationError: null,
      validatedPath: null,
    });
  },
}));

// 订阅Socket事件
export const subscribeToSessionEvents = (): (() => void) => {
  const unsubscribers: (() => void)[] = [];

  // 会话启动
  unsubscribers.push(
    socketManager.on(SocketEvents.SESSION_STARTED, (data: unknown) => {
      const typedData = data as { sessionId: string; projectPath: string; machineId?: string; mode?: 'chat' | 'shell'; request_id?: string; isHistory?: boolean; fromExistingSession?: boolean };
      const store = useSessionStore.getState();

      console.log('[SessionStore] SESSION_STARTED received:', {
        sessionId: typedData.sessionId,
        projectPath: typedData.projectPath,
        machineId: typedData.machineId,
        mode: typedData.mode,
        isHistory: typedData.isHistory,
        fromExistingSession: typedData.fromExistingSession,
        request_id: typedData.request_id,
        pendingRequestId: store.pendingSessionRequestId,
        previousCurrentSessionId: store.currentSession?.sessionId ?? null,
      });

      // 仅当本端发起了启动会话（pendingSessionRequestId 非空）且 request_id 不匹配时忽略，避免多设备串响应；join 历史会话时 pending 为空，不忽略
      if (typedData.request_id != null && store.pendingSessionRequestId != null && typedData.request_id !== store.pendingSessionRequestId) {
        console.log('[SessionStore] 忽略其他客户端的 SESSION_STARTED 事件');
        return;
      }

      const session: SessionInfo = {
        sessionId: typedData.sessionId,
        machineId: typedData.machineId || '',
        projectPath: typedData.projectPath,
        startedAt: new Date(),
        clientsCount: 1,
        mode: typedData.mode ?? 'shell',
      };
      store.setCurrentSession(session);
      useSessionStore.setState({ pendingSessionRequestId: null, isLoading: false });
      useChatStore.getState().setActiveSession(
        typedData.sessionId,
        typedData.machineId ?? null,
        typedData.projectPath ?? null,
      );

      // 历史会话：拉取历史消息。
      // 注意：历史会话恢复会经历「探测历史会话」和「加入已有会话房间」两步，
      // 第二步会再次收到 fromExistingSession 的 SESSION_STARTED。若当前 tab 已在加载/持有同一会话历史，则跳过重复拉取。
      if (typedData.isHistory && typedData.machineId && typedData.projectPath) {
        const chatState = useChatStore.getState();
        const alreadyLoadingSameHistory =
          chatState.currentSdkSessionId === typedData.sessionId &&
          (chatState.isLoadingHistory || chatState.messages.length > 0);

        if (alreadyLoadingSameHistory) {
          console.log('[SessionStore] 跳过重复历史消息加载:', {
            sessionId: typedData.sessionId,
            fromExistingSession: typedData.fromExistingSession,
            isLoadingHistory: chatState.isLoadingHistory,
            messagesCount: chatState.messages.length,
          });
        } else {
        console.log('[SessionStore] 拉取历史消息:', {
          machineId: typedData.machineId,
          projectPath: typedData.projectPath,
          sessionId: typedData.sessionId,
          fromExistingSession: typedData.fromExistingSession
        });
        useChatStore.getState().fetchHistoryMessages(typedData.machineId, typedData.projectPath, typedData.sessionId);
        }
      } else {
        console.log('[SessionStore] 跳过历史消息加载:', {
          isHistory: typedData.isHistory,
          hasMachineId: !!typedData.machineId,
          hasProjectPath: !!typedData.projectPath
        });
      }
      // 多开：来自「加入已有会话」的 SESSION_STARTED 已由服务端 join 过，不再重复 join。
      // 重复 join 由 socket 层 500ms 去重 + 服务端 rooms.has(room) 双重防护。
      if (typedData.machineId && !typedData.fromExistingSession) {
        socketManager.joinSession(typedData.sessionId, typedData.machineId);
      }
    })
  );

  // 会话输出
  unsubscribers.push(
    socketManager.on(SocketEvents.SESSION_OUTPUT, (data: unknown) => {
      const output = data as SessionOutputEvent;
      const store = useSessionStore.getState();

      // 处理权限请求
      if (output.type === 'permission_request') {
        const request: PermissionRequest = {
          id: `${output.session_id}-${Date.now()}`,
          sessionId: output.session_id,
          message: output.data,
          timestamp: new Date(output.timestamp),
          pending: true,
        };
        store.addPermissionRequest(request);
      }

      store.appendOutput(output.session_id, output);
    })
  );

  // 会话缓冲区
  unsubscribers.push(
    socketManager.on(SocketEvents.SESSION_BUFFER, (data: unknown) => {
      const typedData = data as { sessionId: string; lines: string[] };
      useSessionStore.getState().setBuffer(typedData.sessionId, typedData.lines);
    })
  );

  // 会话结束
  unsubscribers.push(
    socketManager.on(SocketEvents.SESSION_END, (data: unknown) => {
      const endEvent = data as SessionEndEvent;
      const store = useSessionStore.getState();

      if (store.currentSession?.sessionId === endEvent.session_id) {
        store.setCurrentSession(null);
      }
    })
  );

  // 会话历史列表
  unsubscribers.push(
    socketManager.on(SocketEvents.SESSIONS_LIST, (data: unknown) => {
      const typedData = data as { machine_id: string; project_path: string; sessions: SessionHistoryItem[] };
      const store = useSessionStore.getState();
      // 只处理当前会话的数据
      if (store.currentSession?.machineId === typedData.machine_id &&
          store.currentSession?.projectPath === typedData.project_path) {
        useSessionStore.setState({
          sessionHistory: typedData.sessions || [],
          isLoadingHistory: false,
        });
      }
    })
  );

  // 文件列表
  unsubscribers.push(
    socketManager.on(SocketEvents.FILES_LIST, (data: unknown) => {
      const typedData = data as { machine_id: string; project_path: string; dir_path?: string; files: FileTreeItem[] };
      const store = useSessionStore.getState();
      // 只处理当前会话的数据
      if (store.currentSession?.machineId !== typedData.machine_id ||
          store.currentSession?.projectPath !== typedData.project_path) {
        return;
      }

      if (typedData.dir_path) {
        // 懒加载模式：更新指定目录的 children
        const updateChildren = (items: FileTreeItem[]): FileTreeItem[] =>
          items.map(item => {
            if (item.path === typedData.dir_path) {
              return { ...item, children: typedData.files || [] };
            }
            if (item.children) {
              return { ...item, children: updateChildren(item.children) };
            }
            return item;
          });

        const { loadingDirs } = store;
        const next = new Set(loadingDirs);
        next.delete(typedData.dir_path);

        useSessionStore.setState({
          fileTree: updateChildren(store.fileTree),
          loadingDirs: next,
        });
      } else {
        // 根目录模式：替换整个 fileTree
        useSessionStore.setState({
          fileTree: typedData.files || [],
          isLoadingFiles: false,
        });
      }
    })
  );

  // 斜杠命令列表
  unsubscribers.push(
    socketManager.on(SocketEvents.COMMANDS_LIST, (data: unknown) => {
      const typedData = data as { machine_id: string; project_path: string; commands: SlashCommandItem[] };
      const store = useSessionStore.getState();
      // 只处理当前会话的数据
      if (store.currentSession?.machineId === typedData.machine_id &&
          store.currentSession?.projectPath === typedData.project_path) {
        useSessionStore.setState({
          customCommands: typedData.commands || [],
        });
      }
    })
  );

  // 文件内容
  unsubscribers.push(
    socketManager.on(SocketEvents.FILE_CONTENT, (data: unknown) => {
      const typedData = data as FileContentResponse & { machine_id: string; project_path: string };
      const store = useSessionStore.getState();
      // 只处理当前会话的数据，查找对应的标签页
      if (store.currentSession?.machineId === typedData.machine_id &&
          store.currentSession?.projectPath === typedData.project_path) {
        // 查找是否有匹配的标签页正在加载
        const tab = store.editorTabs.find(t => t.path === typedData.path && t.isLoading);
        if (tab) {
          store.setTabContent(typedData.path, typedData);
        }
      }
    })
  );

  // 文件保存结果
  unsubscribers.push(
    socketManager.on(SocketEvents.FILE_SAVED, (data: unknown) => {
      const typedData = data as { machine_id: string; project_path: string; path: string; success: boolean; error?: string };
      const store = useSessionStore.getState();
      // 只处理当前会话且文件路径匹配的数据
      if (store.currentSession?.machineId === typedData.machine_id &&
          store.currentSession?.projectPath === typedData.project_path) {
        // 检查保存的文件是否是当前激活的标签
        if (store.activeTabPath === typedData.path) {
          store.setFileSaved(typedData.success, typedData.error);
        }
      }
    })
  );

  // 错误处理
  unsubscribers.push(
    socketManager.on(SocketEvents.ERROR, (error: unknown) => {
      const typedError = error as { message: string };
      useSessionStore.setState({ error: typedError.message, isLoading: false });
    })
  );

  // Agent 状态变更
  unsubscribers.push(
    socketManager.on(SocketEvents.AGENT_STATUS_CHANGED, (data: unknown) => {
      const statusEvent = data as {
        machineId: string;
        status: 'online' | 'offline';
        connectionState: AgentConnectionState;
        reason?: string;
      };
      const store = useSessionStore.getState();
      const currentMachineId = store.currentSession?.machineId;

      // 只处理当前会话相关的机器状态
      if (currentMachineId === statusEvent.machineId) {
        store.setAgentConnectionState(statusEvent.connectionState, statusEvent.reason);
        console.log(`[SessionStore] Agent status changed for current session: ${statusEvent.status} (${statusEvent.connectionState})`);
      }
    })
  );

  // 路径验证结果
  unsubscribers.push(
    socketManager.on(SocketEvents.PATH_VALIDATED, (data: unknown) => {
      const result = data as ValidatePathResponse;
      const store = useSessionStore.getState();
      store.setPathValidationResult(result);
    })
  );

  // 会话分享：收到 shareToken
  unsubscribers.push(
    socketManager.on(SocketEvents.SHARE_SESSION, (data: unknown) => {
      const typedData = data as { session_id: string; shareToken: string };
      const baseUrl = window.location.origin;
      const shareLink = `${baseUrl}/shared/${typedData.shareToken}`;
      useSessionStore.setState({
        isSharing: true,
        shareLink,
        viewersCount: 0,
      });
    })
  );

  // 会话分享：停止分享
  unsubscribers.push(
    socketManager.on(SocketEvents.STOP_SHARE, (_data: unknown) => {
      useSessionStore.setState({
        isSharing: false,
        shareLink: null,
        viewersCount: 0,
      });
    })
  );

  // 会话分享：观众数量更新
  unsubscribers.push(
    socketManager.on(SocketEvents.SHARED_SESSION_VIEWERS, (data: unknown) => {
      const typedData = data as { sessionId: string; viewersCount: number };
      useSessionStore.setState({ viewersCount: typedData.viewersCount });
    })
  );

  // 返回取消订阅函数
  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
};
