/**
 * CC Remote - Socket.IO Client Setup
 * Manages Socket.IO connection and provides event handling utilities
 */

import { io, type Socket } from 'socket.io-client';
import { SocketNamespaces, SocketEvents } from 'cc-remote-shared';
import type { ChatMessageEvent, ChatPermissionRequestEvent } from 'cc-remote-shared';

/**
 * Socket connection options
 */
export interface SocketConnectOptions {
  token: string;
  serverUrl: string;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  timeout?: number;
}

/**
 * Socket event handlers interface
 */
export interface SocketEventHandlers {
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onConnectError?: (error: Error) => void;
  onChatMessage?: (data: ChatMessageEvent) => void;
  onChatPermissionRequest?: (data: ChatPermissionRequestEvent) => void;
  onSessionStarted?: (data: { session_id: string; project_path: string }) => void;
  onAgentStatusChanged?: (data: { machineId: string; status: 'online' | 'offline' }) => void;
  onError?: (error: { message: string }) => void;
}

/**
 * Creates and configures a Socket.IO client connection
 * @param options - Connection options
 * @returns Configured Socket instance
 */
export function createSocket(options: SocketConnectOptions): Socket {
  const { token, serverUrl, reconnection = true, reconnectionDelay = 1000, reconnectionDelayMax = 5000, timeout = 10000 } = options;

  // Parse URL to get WebSocket address
  const wsUrl = serverUrl.replace(/^https?:\/\//, '').replace(/\/api$/, '');
  const protocol = serverUrl.startsWith('https') ? 'wss' : 'ws';
  const socketUrl = `${protocol}://${wsUrl}`;

  const socket = io(`${socketUrl}${SocketNamespaces.CLIENT}`, {
    auth: { token },
    reconnection,
    reconnectionDelay,
    reconnectionDelayMax,
    timeout,
  });

  return socket;
}

/**
 * Sets up event handlers on a socket instance
 * @param socket - Socket instance
 * @param handlers - Event handler functions
 * @returns Cleanup function to remove all handlers
 */
export function setupSocketHandlers(socket: Socket, handlers: SocketEventHandlers): () => void {
  const {
    onConnect,
    onDisconnect,
    onConnectError,
    onChatMessage,
    onChatPermissionRequest,
    onSessionStarted,
    onAgentStatusChanged,
    onError,
  } = handlers;

  // Connection events
  if (onConnect) {
    socket.on('connect', onConnect);
  }

  if (onDisconnect) {
    socket.on('disconnect', onDisconnect);
  }

  if (onConnectError) {
    socket.on('connect_error', onConnectError);
  }

  // Chat events
  if (onChatMessage) {
    socket.on(SocketEvents.CHAT_MESSAGE, onChatMessage);
  }

  if (onChatPermissionRequest) {
    socket.on(SocketEvents.CHAT_PERMISSION_REQUEST, onChatPermissionRequest);
  }

  // Session events
  if (onSessionStarted) {
    socket.on(SocketEvents.SESSION_STARTED, onSessionStarted);
  }

  // Agent status events
  if (onAgentStatusChanged) {
    socket.on(SocketEvents.AGENT_STATUS_CHANGED, onAgentStatusChanged);
  }

  // Error events
  if (onError) {
    socket.on(SocketEvents.ERROR, onError);
  }

  // Return cleanup function
  return () => {
    if (onConnect) socket.off('connect', onConnect);
    if (onDisconnect) socket.off('disconnect', onDisconnect);
    if (onConnectError) socket.off('connect_error', onConnectError);
    if (onChatMessage) socket.off(SocketEvents.CHAT_MESSAGE, onChatMessage);
    if (onChatPermissionRequest) socket.off(SocketEvents.CHAT_PERMISSION_REQUEST, onChatPermissionRequest);
    if (onSessionStarted) socket.off(SocketEvents.SESSION_STARTED, onSessionStarted);
    if (onAgentStatusChanged) socket.off(SocketEvents.AGENT_STATUS_CHANGED, onAgentStatusChanged);
    if (onError) socket.off(SocketEvents.ERROR, onError);
  };
}

/**
 * Connects to the Socket.IO server
 * @param options - Connection options
 * @param handlers - Event handler functions
 * @returns Object containing socket instance and cleanup function
 */
export function connectSocket(
  options: SocketConnectOptions,
  handlers: SocketEventHandlers = {},
): { socket: Socket; disconnect: () => void; cleanup: () => void } {
  const socket = createSocket(options);
  const cleanup = setupSocketHandlers(socket, handlers);

  const disconnect = () => {
    cleanup();
    socket.disconnect();
  };

  return { socket, disconnect, cleanup };
}

/**
 * Emits a chat message event
 * @param socket - Socket instance
 * @param sessionId - Session ID
 * @param content - Message content
 */
export function sendChatMessage(socket: Socket, sessionId: string, content: string): void {
  socket.emit(SocketEvents.CHAT_SEND, {
    session_id: sessionId,
    content,
  });
}

/**
 * Emits a chat permission answer event
 * @param socket - Socket instance
 * @param sessionId - Session ID
 * @param requestId - Request ID from permission request
 * @param approved - Whether to approve the permission
 * @param message - Optional message
 */
export function answerChatPermission(
  socket: Socket,
  sessionId: string,
  requestId: string,
  approved: boolean,
  message?: string,
): void {
  socket.emit(SocketEvents.CHAT_PERMISSION_ANSWER, {
    session_id: sessionId,
    requestId,
    approved,
    message,
  });
}

/**
 * Emits a session start event
 * @param socket - Socket instance
 * @param machineId - Machine ID
 * @param projectPath - Project path
 * @param mode - Session mode ('chat' or 'shell')
 * @param requestId - Optional request ID for response routing
 */
export function startSession(
  socket: Socket,
  machineId: string,
  projectPath: string,
  mode: 'chat' | 'shell' = 'chat',
  requestId?: string,
): void {
  socket.emit(SocketEvents.START_SESSION, {
    machine_id: machineId,
    project_path: projectPath,
    mode,
    request_id: requestId,
  });
}

/**
 * Emits a join session event
 * @param socket - Socket instance
 * @param sessionId - Session ID to join
 * @param machineId - Machine ID
 */
export function joinSession(socket: Socket, sessionId: string, machineId: string): void {
  socket.emit(SocketEvents.JOIN_SESSION, {
    session_id: sessionId,
    machine_id: machineId,
  });
}

/**
 * Emits a list sessions event
 * @param socket - Socket instance
 * @param machineId - Machine ID
 * @param projectPath - Project path
 * @param requestId - Optional request ID for response routing
 */
export function listSessions(socket: Socket, machineId: string, projectPath: string, requestId?: string): void {
  socket.emit(SocketEvents.LIST_SESSIONS, {
    machine_id: machineId,
    project_path: projectPath,
    request_id: requestId,
  });
}

/**
 * Emits a scan projects event
 * @param socket - Socket instance
 * @param machineId - Machine ID
 * @param forceRefresh - Whether to force refresh
 * @param requestId - Optional request ID for response routing
 */
export function scanProjects(socket: Socket, machineId: string, forceRefresh = false, requestId?: string): void {
  socket.emit(SocketEvents.SCAN_PROJECTS, {
    machine_id: machineId,
    force_refresh: forceRefresh,
    request_id: requestId,
  });
}
