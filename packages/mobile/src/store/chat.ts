/**
 * CC Remote - Chat Store
 * Manages active chat sessions and messages
 */

import { create } from 'zustand';
import type {
  ChatMessageEvent,
  StartSessionRequest,
  StartSessionResponse,
  SessionOutputEvent,
  SessionEndEvent,
  SessionMessagesResponse,
} from 'cc-remote-shared';
import { SocketEvents } from 'cc-remote-shared';

interface ChatMessage {
  id: string;
  type: 'text' | 'text_delta' | 'tool_use' | 'tool_result' | 'error' | 'complete' | 'system';
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolId?: string;
  toolResult?: string;
  isError?: boolean;
  modelUsage?: { input: number; output: number };
  timestamp: number;
  isStreaming?: boolean;
}

interface ChatSession {
  sessionId: string;
  projectId: string;
  projectName: string;
  machineId: string;
  messages: ChatMessage[];
  isActive: boolean;
  isStreaming: boolean;
  exitCode?: number;
  endedAt?: number;
  error?: string;
}

interface ChatState {
  // Current active session
  currentSession: ChatSession | null;

  // Session history by project
  sessionsByProject: Record<string, ChatSession[]>;

  // UI state
  isLoading: boolean;
  isSending: boolean;
  error: string | null;

  // Actions
  startSession: (request: StartSessionRequest, projectName: string, socket: import('socket.io-client').Socket | null) => Promise<string>;
  joinSession: (sessionId: string, projectId: string, projectName: string, machineId: string, socket: import('socket.io-client').Socket | null) => void;
  sendMessage: (content: string, emit: (event: string, data: unknown) => void) => void;
  sendPermissionAnswer: (approved: boolean, message?: string, emit?: (event: string, data: unknown) => void) => void;
  endSession: (sessionId: string, emit?: (event: string, data: unknown) => void) => void;
  addMessage: (message: ChatMessage) => void;
  clearCurrentSession: (off: (event: string, callback?: (...args: unknown[]) => void) => void) => void;
  loadSessionHistory: (machineId: string, projectPath: string, sdkSessionId: string, socket: import('socket.io-client').Socket | null) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentSession: null,
  sessionsByProject: {},
  isLoading: false,
  isSending: false,
  error: null,

  startSession: async (request: StartSessionRequest, projectName: string, socket) => {
    set({ isLoading: true, error: null });

    return new Promise((resolve, reject) => {
      if (!socket) {
        set({ isLoading: false, error: 'Not connected to server' });
        reject(new Error('Not connected'));
        return;
      }

      // Set up one-time listener for session started
      const handleSessionStarted = (response: StartSessionResponse) => {
        if (response.request_id === request.request_id) {
          const session: ChatSession = {
            sessionId: response.session_id,
            projectId: request.project_path,
            projectName,
            machineId: request.machine_id,
            messages: [],
            isActive: true,
            isStreaming: false,
          };

          set({ currentSession: session, isLoading: false });
          socket.off(SocketEvents.SESSION_STARTED, handleSessionStarted);
          resolve(response.session_id);
        }
      };

      const handleError = (error: { request_id?: string; message: string }) => {
        if (error.request_id === request.request_id) {
          set({ isLoading: false, error: error.message });
          socket.off(SocketEvents.ERROR, handleError);
          socket.off(SocketEvents.SESSION_STARTED, handleSessionStarted);
          reject(new Error(error.message));
        }
      };

      socket.on(SocketEvents.SESSION_STARTED, handleSessionStarted);
      socket.on(SocketEvents.ERROR, handleError);

      // Emit start session request
      socket.emit(SocketEvents.START_SESSION, request);

      // Timeout after 30 seconds
      setTimeout(() => {
        socket.off(SocketEvents.SESSION_STARTED, handleSessionStarted);
        socket.off(SocketEvents.ERROR, handleError);
        if (get().isLoading) {
          set({ isLoading: false, error: 'Session start timeout' });
          reject(new Error('Timeout'));
        }
      }, 30000);
    });
  },

  joinSession: (sessionId: string, projectId: string, projectName: string, machineId: string, socket) => {
    if (!socket) return;

    // Emit join session event
    socket.emit(SocketEvents.JOIN_SESSION, {
      session_id: sessionId,
      machine_id: machineId,
    });

    // Set up session state
    const session: ChatSession = {
      sessionId,
      projectId,
      projectName,
      machineId,
      messages: [],
      isActive: true,
      isStreaming: false,
    };

    set({ currentSession: session });

    // Set up listeners for session events
    setupSessionListeners(socket, sessionId, set);
  },

  sendMessage: (content: string, emit) => {
    const { currentSession } = get();
    if (!currentSession) return;

    set({ isSending: true });

    // Add user message to local state
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      type: 'text',
      content,
      timestamp: Date.now(),
    };

    set((state) => ({
      currentSession: state.currentSession
        ? {
            ...state.currentSession,
            messages: [...state.currentSession.messages, userMessage],
          }
        : null,
    }));

    // Send to server
    emit(SocketEvents.SESSION_INPUT, {
      session_id: currentSession.sessionId,
      data: content,
    });

    set({ isSending: false });
  },

  sendPermissionAnswer: (approved: boolean, message?: string, emit) => {
    const { currentSession } = get();
    if (!currentSession || !emit) return;

    emit(SocketEvents.SESSION_PERMISSION_ANSWER, {
      session_id: currentSession.sessionId,
      approved,
      message,
    });
  },

  endSession: (sessionId: string, emit) => {
    if (!emit) return;

    emit(SocketEvents.SESSION_END, {
      session_id: sessionId,
    });

    set((state) => ({
      currentSession: state.currentSession?.sessionId === sessionId
        ? { ...state.currentSession, isActive: false, isStreaming: false }
        : state.currentSession,
    }));
  },

  addMessage: (message: ChatMessage) => {
    set((state) => ({
      currentSession: state.currentSession
        ? {
            ...state.currentSession,
            messages: [...state.currentSession.messages, message],
          }
        : null,
    }));
  },

  clearCurrentSession: (off) => {
    set({ currentSession: null });
    off(SocketEvents.SESSION_OUTPUT);
    off(SocketEvents.SESSION_END);
    off(SocketEvents.CHAT_MESSAGE);
    off(SocketEvents.CHAT_COMPLETE);
    off(SocketEvents.CHAT_ERROR);
  },

  loadSessionHistory: async (machineId: string, projectPath: string, sdkSessionId: string, socket) => {
    set({ isLoading: true, error: null });

    return new Promise((resolve, reject) => {
      if (!socket) {
        set({ isLoading: false, error: 'Not connected to server' });
        reject(new Error('Not connected'));
        return;
      }

      const requestId = `history_${Date.now()}`;

      const handleSessionMessages = (response: SessionMessagesResponse) => {
        if (response.request_id === requestId) {
          const messages: ChatMessage[] = response.messages.map((msg, idx) => ({
            id: `hist_${idx}`,
            type: msg.role === 'user' ? 'text' : 'tool_use' in msg ? 'tool_use' : 'text',
            content: msg.content,
            toolName: msg.toolName,
            toolInput: msg.toolInput,
            toolResult: msg.toolResult,
            isError: msg.isError,
            timestamp: msg.timestamp,
          }));

          resolve();
          socket.off(SocketEvents.SESSION_MESSAGES, handleSessionMessages);
        }
      };

      socket.on(SocketEvents.SESSION_MESSAGES, handleSessionMessages);

      const request = {
        machine_id: machineId,
        project_path: projectPath,
        sdk_session_id: sdkSessionId,
        limit: 100,
        offset: 0,
        request_id: requestId,
      };

      socket.emit(SocketEvents.GET_SESSION_MESSAGES, request);

      setTimeout(() => {
        socket.off(SocketEvents.SESSION_MESSAGES, handleSessionMessages);
        if (get().isLoading) {
          set({ isLoading: false, error: 'Load history timeout' });
          reject(new Error('Timeout'));
        }
      }, 30000);
    });
  },
}));

// Helper function to set up session event listeners
function setupSessionListeners(
  socket: import('socket.io-client').Socket,
  sessionId: string,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
) {
  const handleOutput = (event: SessionOutputEvent) => {
    if (event.session_id !== sessionId) return;

    if (event.type === 'stdout' || event.type === 'stderr') {
      const message = {
        id: `out_${Date.now()}`,
        type: 'text' as const,
        content: event.data,
        timestamp: event.timestamp.getTime(),
      };
      set((state) => ({
        currentSession: state.currentSession
          ? {
              ...state.currentSession,
              messages: [...state.currentSession.messages, message],
            }
          : null,
      }));
    } else if (event.type === 'tool_call') {
      try {
        const toolData = JSON.parse(event.data) as {
          toolName?: string;
          toolInput?: string;
          toolId?: string;
        };
        const message = {
          id: `tool_${Date.now()}`,
          type: 'tool_use' as const,
          toolName: toolData.toolName,
          toolInput: toolData.toolInput,
          toolId: toolData.toolId,
          timestamp: event.timestamp.getTime(),
        };
        set((state) => ({
          currentSession: state.currentSession
            ? {
                ...state.currentSession,
                messages: [...state.currentSession.messages, message],
              }
            : null,
        }));
      } catch {
        // Not JSON, ignore
      }
    }
  };

  const handleChatMessage = (event: ChatMessageEvent) => {
    if (event.session_id !== sessionId) return;

    const message = {
      id: `chat_${Date.now()}_${Math.random()}`,
      type: event.type,
      content: event.content,
      toolName: event.toolName,
      toolInput: event.toolInput,
      toolId: event.toolId,
      toolResult: event.toolResult,
      isError: event.isError,
      modelUsage: event.modelUsage,
      timestamp: event.timestamp.getTime(),
    } as ChatMessage;

    if (event.type === 'complete') {
      set((state) => ({
        currentSession: state.currentSession
          ? { ...state.currentSession, isStreaming: false }
          : null,
      }));
    } else if (event.type === 'error') {
      set((state) => ({
        currentSession: state.currentSession
          ? { ...state.currentSession, isStreaming: false, error: event.content }
          : null,
      }));
    } else {
      set((state) => ({
        currentSession: state.currentSession
          ? { ...state.currentSession, isStreaming: true }
          : null,
      }));
    }

    set((state) => ({
      currentSession: state.currentSession
        ? {
            ...state.currentSession,
            messages: [...state.currentSession.messages, message],
          }
        : null,
    }));
  };

  const handleSessionEnd = (event: SessionEndEvent) => {
    if (event.session_id !== sessionId) return;

    set((state) => ({
      currentSession: state.currentSession
        ? {
            ...state.currentSession,
            isActive: false,
            isStreaming: false,
            exitCode: event.exit_code,
            endedAt: event.ended_at.getTime(),
          }
        : null,
    }));
  };

  socket.on(SocketEvents.SESSION_OUTPUT, handleOutput);
  socket.on(SocketEvents.CHAT_MESSAGE, handleChatMessage);
  socket.on(SocketEvents.SESSION_END, handleSessionEnd);
}
