import { create } from 'zustand';
import { SocketEvents } from 'cc-remote-shared';
import type { ChatMessageEvent, ChatPermissionRequestEvent, HistoryMessage } from 'cc-remote-shared';
import { socketManager } from '../lib/socket';
import i18n from '../i18n';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'error';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolName?: string;
  toolInput?: string;
  toolId?: string;
  toolResult?: { content: string; isError: boolean };
}

export interface ChatPermission {
  requestId: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  pending: boolean;
  timestamp: Date;
}

interface ChatState {
  messages: ChatMessage[];
  isGenerating: boolean;
  modelUsage: { input: number; output: number } | null;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  } | null;
  permissions: ChatPermission[];
  isLoadingHistory: boolean;
  isLoadingMore: boolean;
  hasMoreHistory: boolean;
  historyTotal: number;
  historyOffset: number;
  historyLimit: number;
  currentSdkSessionId: string | null;
  currentMachineId: string | null;
  currentProjectPath: string | null;

  sendMessage: (sessionId: string, content: string) => void;
  handleChatEvent: (event: ChatMessageEvent) => void;
  answerPermission: (sessionId: string, requestId: string, approved: boolean, message?: string, updatedInput?: Record<string, unknown>) => void;
  loadHistoryMessages: (messages: HistoryMessage[]) => void;
  loadMoreHistory: (messages: HistoryMessage[], hasMore: boolean, offset: number) => void;
  fetchHistoryMessages: (machineId: string, projectPath: string, sdkSessionId: string) => void;
  loadMoreHistoryMessages: (machineId?: string, projectPath?: string, sdkSessionId?: string) => void;
  setActiveSession: (sdkSessionId: string | null, machineId?: string | null, projectPath?: string | null) => void;
  updateTokenUsage: (usage: { input: number; output: number; total: number }) => void;
  clearMessages: () => void;
  reset: () => void;
}

let msgCounter = 0;
const genId = () => `msg-${Date.now()}-${++msgCounter}`;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isGenerating: false,
  modelUsage: null,
  tokenUsage: null,
  permissions: [],
  isLoadingHistory: false,
  isLoadingMore: false,
  hasMoreHistory: false,
  historyTotal: 0,
  historyOffset: 0,
  historyLimit: 50,
  currentSdkSessionId: null,
  currentMachineId: null,
  currentProjectPath: null,

  sendMessage: (sessionId: string, content: string) => {
    const userMsg: ChatMessage = {
      id: genId(),
      type: 'user',
      content,
      timestamp: new Date(),
    };
    set((s) => ({ messages: [...s.messages, userMsg], isGenerating: true }));
    socketManager.sendChatMessage(sessionId, content);
  },

  handleChatEvent: (event: ChatMessageEvent) => {
    const state = get();

    if (state.currentSdkSessionId && event.session_id !== state.currentSdkSessionId) {
      return;
    }

    switch (event.type) {
      case 'text': {
        const msg: ChatMessage = {
          id: genId(),
          type: 'assistant',
          content: event.content ?? '',
          timestamp: new Date(event.timestamp),
          isStreaming: true,
        };
        set({ messages: [...state.messages, msg] });
        break;
      }

      case 'text_delta': {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.type === 'assistant' && last.isStreaming) {
          msgs[msgs.length - 1] = { ...last, content: last.content + (event.content ?? '') };
        } else {
          msgs.push({
            id: genId(),
            type: 'assistant',
            content: event.content ?? '',
            timestamp: new Date(event.timestamp),
            isStreaming: true,
          });
        }
        set({ messages: msgs });
        break;
      }

      case 'tool_use': {
        const msgs = [...state.messages];
        const lastAssistant = msgs[msgs.length - 1];
        if (lastAssistant && lastAssistant.type === 'assistant' && lastAssistant.isStreaming) {
          msgs[msgs.length - 1] = { ...lastAssistant, isStreaming: false };
        }
        // 检查是否已存在相同的 toolId 消息
        const toolMsgId = event.toolId ?? genId();
        if (msgs.some((m) => m.id === toolMsgId)) {
          // 已存在，跳过
          break;
        }
        msgs.push({
          id: toolMsgId,
          type: 'tool_use',
          content: '',
          toolName: event.toolName,
          toolInput: event.toolInput,
          toolId: event.toolId,
          timestamp: new Date(event.timestamp),
        });
        set({ messages: msgs });
        break;
      }

      case 'tool_result': {
        const msgs = state.messages.map((m) => {
          if (m.toolId === event.toolId) {
            return {
              ...m,
              toolResult: {
                content: event.toolResult ?? '',
                isError: event.isError ?? false,
              },
            };
          }
          return m;
        });
        set({ messages: msgs });
        break;
      }

      case 'error': {
        const msgs = [...state.messages];
        const lastAssistant = msgs[msgs.length - 1];
        if (lastAssistant && lastAssistant.type === 'assistant' && lastAssistant.isStreaming) {
          msgs[msgs.length - 1] = { ...lastAssistant, isStreaming: false };
        }
        msgs.push({
          id: genId(),
          type: 'error',
          content: event.content ?? i18n.t('errors.unknownError'),
          timestamp: new Date(event.timestamp),
        });
        set({ messages: msgs, isGenerating: false });
        break;
      }

      case 'complete': {
        const msgs = [...state.messages];
        const lastAssistant = msgs[msgs.length - 1];
        if (lastAssistant && lastAssistant.type === 'assistant' && lastAssistant.isStreaming) {
          msgs[msgs.length - 1] = { ...lastAssistant, isStreaming: false };
        }
        // 更新 tokenUsage，计算 total
        const newTokenUsage = event.modelUsage
          ? {
              input: event.modelUsage.input,
              output: event.modelUsage.output,
              total: event.modelUsage.input + event.modelUsage.output,
            }
          : null;
        set({
          messages: msgs,
          isGenerating: false,
          modelUsage: event.modelUsage ?? null,
          tokenUsage: newTokenUsage,
        });
        break;
      }
    }
  },

  answerPermission: (sessionId: string, requestId: string, approved: boolean, message?: string, updatedInput?: Record<string, unknown>) => {
    socketManager.answerChatPermission(sessionId, requestId, approved, message, updatedInput);
    set((s) => ({
      permissions: s.permissions.map((p) =>
        p.requestId === requestId ? { ...p, pending: false } : p,
      ),
    }));
  },

  loadHistoryMessages: (historyMsgs: HistoryMessage[]) => {
    // 服务端已保证消息顺序，前端只需按 (timestamp, order) 复合排序
    const sortedMsgs = [...historyMsgs].sort((a, b) => {
      const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (a.order ?? 0) - (b.order ?? 0);
    });

    const seenIds = new Set<string>();
    const msgs: ChatMessage[] = sortedMsgs
      .map((m) => {
        if (m.isToolUse) {
          const id = m.toolId ?? genId();
          if (seenIds.has(id)) return null;
          seenIds.add(id);
          return {
            id,
            type: 'tool_use' as const,
            content: '',
            toolName: m.toolName,
            toolInput: m.toolInput,
            toolId: m.toolId,
            toolResult: m.toolResult !== undefined ? { content: m.toolResult, isError: m.isError ?? false } : undefined,
            timestamp: new Date(m.timestamp),
          };
        }
        // 对于普通消息，用 role+timestamp+content 作为唯一标识
        const normalId = `${m.role}-${m.timestamp}-${m.content?.substring(0, 50)}`;
        if (seenIds.has(normalId)) return null;
        seenIds.add(normalId);
        return {
          id: genId(),
          type: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.timestamp),
        };
      })
      .filter(Boolean) as ChatMessage[];

    // 估算 token 数量（基于字符数，约 4 字符 = 1 token）
    let estimatedInputTokens = 0;
    let estimatedOutputTokens = 0;
    for (const msg of msgs) {
      const contentLength = msg.content?.length ?? 0;
      const toolInputLength = msg.toolInput?.length ?? 0;
      const toolResultLength = msg.toolResult?.content?.length ?? 0;
      const tokens = Math.ceil((contentLength + toolInputLength + toolResultLength) / 4);

      if (msg.type === 'user') {
        estimatedInputTokens += tokens;
      } else {
        estimatedOutputTokens += tokens;
      }
    }

    const estimatedTokenUsage = {
      input: estimatedInputTokens,
      output: estimatedOutputTokens,
      total: estimatedInputTokens + estimatedOutputTokens,
    };
    set({
      messages: msgs,
      isLoadingHistory: false,
      tokenUsage: estimatedTokenUsage,
    });
  },

  loadMoreHistory: (historyMsgs: HistoryMessage[], hasMore: boolean, offset: number) => {
    const sortedMsgs = [...historyMsgs].sort((a, b) => {
      const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (a.order ?? 0) - (b.order ?? 0);
    });

    const existingToolIds = new Set(
      get().messages.filter((m) => m.type === 'tool_use').map((m) => m.toolId)
    );

    const existingNormalKeys = new Set(
      get().messages
        .filter((m) => m.type !== 'tool_use')
        .map((m) => `${m.type}-${m.timestamp.getTime()}-${m.content?.substring(0, 50)}`)
    );

    const msgs: ChatMessage[] = sortedMsgs
      .map((m) => {
        if (m.isToolUse) {
          const id = m.toolId ?? genId();
          if (existingToolIds.has(m.toolId)) return null;
          return {
            id,
            type: 'tool_use' as const,
            content: '',
            toolName: m.toolName,
            toolInput: m.toolInput,
            toolId: m.toolId,
            toolResult: m.toolResult !== undefined ? { content: m.toolResult, isError: m.isError ?? false } : undefined,
            timestamp: new Date(m.timestamp),
          };
        }
        const normalKey = `${m.role}-${new Date(m.timestamp).getTime()}-${m.content?.substring(0, 50)}`;
        if (existingNormalKeys.has(normalKey)) return null;
        return {
          id: genId(),
          type: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.timestamp),
        };
      })
      .filter(Boolean) as ChatMessage[];

    const allMsgs = [...msgs, ...get().messages];

    // 重新估算所有消息的 token 数量
    let estimatedInputTokens = 0;
    let estimatedOutputTokens = 0;
    for (const msg of allMsgs) {
      const contentLength = msg.content?.length ?? 0;
      const toolInputLength = msg.toolInput?.length ?? 0;
      const toolResultLength = msg.toolResult?.content?.length ?? 0;
      const tokens = Math.ceil((contentLength + toolInputLength + toolResultLength) / 4);

      if (msg.type === 'user') {
        estimatedInputTokens += tokens;
      } else {
        estimatedOutputTokens += tokens;
      }
    }

    set({
      messages: allMsgs, // 预置到开头
      isLoadingMore: false,
      hasMoreHistory: hasMore,
      historyOffset: offset,
      tokenUsage: {
        input: estimatedInputTokens,
        output: estimatedOutputTokens,
        total: estimatedInputTokens + estimatedOutputTokens,
      },
    });
  },

  fetchHistoryMessages: (machineId: string, projectPath: string, sdkSessionId: string) => {
    set({
      isLoadingHistory: true,
      messages: [],
      hasMoreHistory: false,
      historyOffset: 0,
      currentSdkSessionId: sdkSessionId,
      currentMachineId: machineId,
      currentProjectPath: projectPath,
    });
    socketManager.getSessionMessages(machineId, projectPath, sdkSessionId);
  },

  setActiveSession: (sdkSessionId: string | null, machineId?: string | null, projectPath?: string | null) => {
    set({
      currentSdkSessionId: sdkSessionId,
      currentMachineId: machineId ?? null,
      currentProjectPath: projectPath ?? null,
    });
  },

  loadMoreHistoryMessages: (machineId?: string, projectPath?: string, sdkSessionId?: string) => {
    const state = get();
    if (state.isLoadingMore || !state.hasMoreHistory) return;

    // Use stored values if parameters not provided
    const mid = machineId ?? state.currentMachineId;
    const ppath = projectPath ?? state.currentProjectPath;
    const sdkId = sdkSessionId ?? state.currentSdkSessionId;

    if (!mid || !ppath || !sdkId) return;

    // SDK返回的消息是正序的（旧消息在前），所以加载更多时offset应该递减
    // offset=0 是最旧的消息，offset越大获取的消息越新
    // 初始加载使用 offset = total - limit 获取最新消息
    // 加载更多（更旧）时，offset 应该减小
    const newOffset = Math.max(0, state.historyOffset - state.historyLimit);
    if (newOffset === state.historyOffset && state.historyOffset === 0) return;

    set({ isLoadingMore: true });
    socketManager.getSessionMessages(
      mid,
      ppath,
      sdkId,
      state.historyLimit,
      newOffset
    );
  },

  updateTokenUsage: (usage: { input: number; output: number; total: number }) => set({ tokenUsage: usage }),

  clearMessages: () => set({ messages: [], isGenerating: false, modelUsage: null, tokenUsage: null, permissions: [], isLoadingHistory: false, currentSdkSessionId: null, currentMachineId: null, currentProjectPath: null }),

  reset: () => set({ messages: [], isGenerating: false, modelUsage: null, tokenUsage: null, permissions: [], isLoadingHistory: false, currentSdkSessionId: null, currentMachineId: null, currentProjectPath: null }),
}));

export const subscribeToChatEvents = (): (() => void) => {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    socketManager.on(SocketEvents.CHAT_MESSAGE, (data: unknown) => {
      useChatStore.getState().handleChatEvent(data as ChatMessageEvent);
    }),
  );

  unsubs.push(
    socketManager.on(SocketEvents.CHAT_PERMISSION_REQUEST, (data: unknown) => {
      const evt = data as ChatPermissionRequestEvent;
      useChatStore.setState((s) => ({
        permissions: [
          ...s.permissions,
          {
            requestId: evt.requestId,
            sessionId: evt.session_id,
            toolName: evt.toolName,
            toolInput: evt.toolInput,
            pending: true,
            timestamp: new Date(),
          },
        ],
      }));
    }),
  );

  unsubs.push(
    socketManager.on(SocketEvents.SESSION_MESSAGES, (data: unknown) => {
      const typedData = data as {
        sdk_session_id: string;
        messages: HistoryMessage[];
        total?: number;
        hasMore?: boolean;
        offset?: number;
        limit?: number;
      };

      const state = useChatStore.getState();

      // 只处理当前会话的消息
      if (typedData.sdk_session_id !== state.currentSdkSessionId) {
        return;
      }

      // 首次加载替换消息，加载更多前置消息
      if (state.messages.length === 0) {
        // 首次加载
        useChatStore.setState({
          isLoadingHistory: false,
          hasMoreHistory: typedData.hasMore ?? (typedData.offset ?? 0) > 0,
          historyTotal: typedData.total ?? typedData.messages.length,
          historyOffset: typedData.offset ?? 0,
          historyLimit: typedData.limit ?? 50,
        });
        useChatStore.getState().loadHistoryMessages(typedData.messages || []);
      } else {
        // 加载更多
        useChatStore.getState().loadMoreHistory(
          typedData.messages || [],
          typedData.hasMore ?? false,
          typedData.offset ?? 0
        );
      }
    }),
  );

  return () => unsubs.forEach((fn) => fn());
};
