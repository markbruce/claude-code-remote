/**
 * Socket.IO client — per-user connections to server /client namespace
 */

import { io, Socket } from 'socket.io-client';
import { SocketEvents, SocketNamespaces } from 'cc-remote-shared';

export interface SocketEventHandlers {
  onConnected?: (userId: string) => void;
  onMachinesList?: (data: { machines: unknown[]; onlineInfo: unknown[] }) => void;
  onProjectsList?: (data: { projects: unknown[]; request_id: string }) => void;
  onSessionsList?: (data: { sessions: unknown[]; request_id: string }) => void;
  onSessionStarted?: (data: { sessionId: string; projectPath: string; mode: string; request_id?: string }) => void;
  onChatMessage?: (data: { session_id: string; type: string; content?: string }) => void;
  onChatToolUse?: (data: { session_id: string; toolName?: string; toolInput?: string }) => void;
  onChatToolResult?: (data: { session_id: string; toolResult?: string }) => void;
  onChatPermissionRequest?: (data: { session_id: string; requestId: string; toolName: string; toolInput: Record<string, unknown> }) => void;
  onChatComplete?: (data: { session_id: string }) => void;
  onChatError?: (data: { session_id: string; content?: string }) => void;
  onSessionEnd?: (data: { session_id: string }) => void;
  onError?: (data: { message: string }) => void;
}

export class SocketClientManager {
  private connections = new Map<string, Socket>();  // platformUserId → Socket
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * Connect a user to the server's /client namespace.
   */
  connect(platformUserId: string, jwt: string, handlers: SocketEventHandlers): Socket {
    // Disconnect existing connection
    this.disconnect(platformUserId);

    const socket = io(`${this.serverUrl}${SocketNamespaces.CLIENT}`, {
      auth: { token: jwt },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socket.on('connect', () => {
      console.log(`[Socket] Connected for user ${platformUserId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected for user ${platformUserId}: ${reason}`);
    });

    // Register event handlers
    socket.on(SocketEvents.CLIENT_CONNECTED, () => handlers.onConnected?.(platformUserId));
    socket.on(SocketEvents.MACHINES_LIST, (data) => handlers.onMachinesList?.(data));
    socket.on(SocketEvents.PROJECTS_LIST, (data) => handlers.onProjectsList?.(data));
    socket.on(SocketEvents.SESSIONS_LIST, (data) => handlers.onSessionsList?.(data));
    socket.on(SocketEvents.SESSION_STARTED, (data) => handlers.onSessionStarted?.(data));
    socket.on(SocketEvents.CHAT_MESSAGE, (data) => handlers.onChatMessage?.(data));
    socket.on(SocketEvents.CHAT_TOOL_USE, (data) => handlers.onChatToolUse?.(data));
    socket.on(SocketEvents.CHAT_TOOL_RESULT, (data) => handlers.onChatToolResult?.(data));
    socket.on(SocketEvents.CHAT_PERMISSION_REQUEST, (data) => handlers.onChatPermissionRequest?.(data));
    socket.on(SocketEvents.CHAT_COMPLETE, (data) => handlers.onChatComplete?.(data));
    socket.on(SocketEvents.CHAT_ERROR, (data) => handlers.onChatError?.(data));
    socket.on(SocketEvents.SESSION_END, (data) => handlers.onSessionEnd?.(data));
    socket.on(SocketEvents.ERROR, (data) => handlers.onError?.(data));

    this.connections.set(platformUserId, socket);
    return socket;
  }

  /** Get socket for a user */
  getSocket(platformUserId: string): Socket | undefined {
    return this.connections.get(platformUserId);
  }

  /** Disconnect a user */
  disconnect(platformUserId: string): void {
    const socket = this.connections.get(platformUserId);
    if (socket) {
      socket.disconnect();
      this.connections.delete(platformUserId);
    }
  }

  /** Disconnect all users */
  disconnectAll(): void {
    for (const [userId] of this.connections) {
      this.disconnect(userId);
    }
  }

  /**
   * Emit an event for a user's connection.
   * Returns false if user is not connected.
   */
  emit(platformUserId: string, event: string, data: unknown): boolean {
    const socket = this.connections.get(platformUserId);
    if (!socket || !socket.connected) return false;
    socket.emit(event, data);
    return true;
  }
}
