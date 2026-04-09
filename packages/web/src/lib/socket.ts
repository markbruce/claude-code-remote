/**
 * Socket.io 客户端集成
 * 处理与服务器 /client 命名空间的连接、认证和事件
 */

import { io, Socket } from 'socket.io-client';
import { SocketEvents, SocketNamespaces, SessionOptions, ValidatePathRequest } from 'cc-remote-shared';
import type { ChatSendEvent, ChatPermissionAnswerEvent, SessionResizeEvent } from 'cc-remote-shared';
import { useSocketStore } from '../stores/socketStore';

// Socket 配置类型
interface SocketConfig {
  url: string;
  token: string;
}

// 事件回调类型
type EventCallback<T = unknown> = (data: T) => void;

// Socket 管理器类
class SocketManager {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private cachedData: Map<string, unknown> = new Map();
  /** 极短时间内同一 session 的重复 join（多路 effect 叠加）合并为一次 emit */
  private lastJoinEmit: { sessionId: string; machineId: string; at: number } | null = null;
  private static readonly JOIN_DEDUPE_MS = 500;

  /**
   * 连接到服务器
   */
  connect(config: SocketConfig): Promise<Socket> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve(this.socket);
        return;
      }

      if (this.socket) {
        this.socket.auth = {
          token: config.token,
        };

        const existingSocket = this.socket;
        const handleConnect = () => {
          cleanup();
          resolve(existingSocket);
        };
        const handleConnectError = (error: Error) => {
          cleanup();
          reject(new Error(`连接失败: ${error.message}`));
        };
        const cleanup = () => {
          existingSocket.off('connect', handleConnect);
          existingSocket.off('connect_error', handleConnectError);
        };

        existingSocket.on('connect', handleConnect);
        existingSocket.on('connect_error', handleConnectError);

        // 已存在 socket 时，优先复用原连接或其自动重连流程，避免刷新/重连期间重复创建多个 socket。
        if (!existingSocket.active) {
          existingSocket.connect();
        }
        return;
      }

      // 构建命名空间URL
      const namespaceUrl = `${config.url}${SocketNamespaces.CLIENT}`;

      // 创建Socket连接
      this.socket = io(namespaceUrl, {
        auth: {
          token: config.token,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      // 连接成功
      this.socket.on('connect', () => {
        console.log('[Socket] 连接成功:', this.socket?.id);
        this.reconnectAttempts = 0;
        useSocketStore.setState({ isConnected: true, isConnecting: false, error: null });
        // 通知连接成功
        this.notifyListeners('client:connected', { message: '连接成功' });
        // 请求机器列表
        this.socket?.emit(SocketEvents.MACHINES_LIST);
        resolve(this.socket!);
      });

      // 连接错误
      this.socket.on('connect_error', (error: Error) => {
        console.error('[Socket] 连接错误:', error.message);
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error(`连接失败: ${error.message}`));
        }
      });

      // 断开连接
      this.socket.on('disconnect', (reason: Socket.DisconnectReason) => {
        console.log('[Socket] 断开连接:', reason);
        useSocketStore.setState({ isConnected: false, isConnecting: false });
        this.notifyListeners('disconnect', { reason });
      });

      // 注册所有事件监听
      this.registerEventHandlers();
    });
  }

  /**
   * 注册事件处理器
   */
  private registerEventHandlers(): void {
    if (!this.socket) return;

    // 错误事件
    this.socket.on(SocketEvents.ERROR, (error: { message: string; code?: string }) => {
      console.error('[Socket] 服务器错误:', error);
      this.notifyListeners(SocketEvents.ERROR, error);
    });

    // 客户端连接确认
    this.socket.on(SocketEvents.CLIENT_CONNECTED, (data: { userId: string; message: string }) => {
      console.log('[Socket] 客户端已连接:', data);
      this.notifyListeners(SocketEvents.CLIENT_CONNECTED, data);
    });

    // 机器列表更新
    this.socket.on(SocketEvents.MACHINES_LIST, (data: { machines: unknown[]; onlineInfo: unknown[] }) => {
      console.log('[Socket] 收到机器列表:', data.machines?.length);
      this.notifyListeners(SocketEvents.MACHINES_LIST, data);
    });

    // 工程列表
    this.socket.on(SocketEvents.PROJECTS_LIST, (data: { machineId: string; projects: unknown[] }) => {
      console.log('[Socket] 收到工程列表:', data);
      this.notifyListeners(SocketEvents.PROJECTS_LIST, data);
    });

    // 会话启动
    this.socket.on(SocketEvents.SESSION_STARTED, (data: { sessionId: string; projectPath: string }) => {
      console.log('[Socket] 会话已启动:', data);
      this.notifyListeners(SocketEvents.SESSION_STARTED, data);
    });

    // 会话输出
    this.socket.on(SocketEvents.SESSION_OUTPUT, (data: unknown) => {
      this.notifyListeners(SocketEvents.SESSION_OUTPUT, data);
    });

    // 会话输入
    this.socket.on(SocketEvents.SESSION_INPUT, (data: unknown) => {
      this.notifyListeners(SocketEvents.SESSION_INPUT, data);
    });

    // 会话结束
    this.socket.on(SocketEvents.SESSION_END, (data: unknown) => {
      console.log('[Socket] 会话已结束:', data);
      this.notifyListeners(SocketEvents.SESSION_END, data);
    });

    // 缓冲区
    this.socket.on(SocketEvents.SESSION_BUFFER, (data: unknown) => {
      this.notifyListeners(SocketEvents.SESSION_BUFFER, data);
    });

    // Chat 模式事件
    this.socket.on(SocketEvents.CHAT_MESSAGE, (data: unknown) => {
      this.notifyListeners(SocketEvents.CHAT_MESSAGE, data);
    });

    this.socket.on(SocketEvents.CHAT_PERMISSION_REQUEST, (data: unknown) => {
      this.notifyListeners(SocketEvents.CHAT_PERMISSION_REQUEST, data);
    });

    // 会话历史列表
    this.socket.on(SocketEvents.SESSIONS_LIST, (data: unknown) => {
      this.notifyListeners(SocketEvents.SESSIONS_LIST, data);
    });

    // 会话历史消息
    this.socket.on(SocketEvents.SESSION_MESSAGES, (data: unknown) => {
      this.notifyListeners(SocketEvents.SESSION_MESSAGES, data);
    });

    // 文件列表
    this.socket.on(SocketEvents.FILES_LIST, (data: unknown) => {
      this.notifyListeners(SocketEvents.FILES_LIST, data);
    });

    // 斜杠命令列表
    this.socket.on(SocketEvents.COMMANDS_LIST, (data: unknown) => {
      this.notifyListeners(SocketEvents.COMMANDS_LIST, data);
    });

    // 文件内容
    this.socket.on(SocketEvents.FILE_CONTENT, (data: unknown) => {
      this.notifyListeners(SocketEvents.FILE_CONTENT, data);
    });

    // 文件保存结果
    this.socket.on(SocketEvents.FILE_SAVED, (data: unknown) => {
      this.notifyListeners(SocketEvents.FILE_SAVED, data);
    });

    // Agent 状态变更
    this.socket.on(SocketEvents.AGENT_STATUS_CHANGED, (data: unknown) => {
      console.log('[Socket] Agent 状态变更:', data);
      this.notifyListeners(SocketEvents.AGENT_STATUS_CHANGED, data);
    });

    // 路径验证结果
    this.socket.on(SocketEvents.PATH_VALIDATED, (data: unknown) => {
      console.log('[Socket] 路径验证结果:', data);
      this.notifyListeners(SocketEvents.PATH_VALIDATED, data);
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.eventListeners.clear();
    this.cachedData.clear();
    this.lastJoinEmit = null;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * 添加事件监听器
   */
  on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as EventCallback);
    console.log(`[Socket] Added listener for: ${event}, total listeners: ${this.eventListeners.get(event)!.size}`);

    // 如果有缓存数据，立即回调
    if (this.cachedData.has(event)) {
      callback(this.cachedData.get(event) as T);
    }

    // 返回取消订阅函数
    return () => {
      this.eventListeners.get(event)?.delete(callback as EventCallback);
    };
  }

  /**
   * 移除事件监听器
   */
  off(event: string, callback?: EventCallback): void {
    if (callback) {
      this.eventListeners.get(event)?.delete(callback);
    } else {
      this.eventListeners.delete(event);
    }
  }

  /**
   * 发送事件
   */
  emit<T = unknown>(event: string, data?: T): void {
    if (!this.socket?.connected) {
      console.log(`[Socket] 未连接，无法发送事件: ${event}`);
      return;
    }
    this.socket.emit(event, data);
  }

  /**
   * 扫描工程
   */
  scanProjects(machineId: string, forceRefresh = false): void {
    if (!this.socket?.connected) {
      console.log('[Socket] 未连接，无法扫描工程');
      return;
    }
    console.log('[Socket] 发送扫描工程请求:', { machineId, forceRefresh });
    this.socket.emit(SocketEvents.SCAN_PROJECTS, {
      machine_id: machineId,
      force_refresh: forceRefresh,
    });
  }

  /**
   * 获取Socket ID
   */
  getId(): string | undefined {
    return this.socket?.id;
  }

  /**
   * 启动会话
   * @returns request_id 用于追踪响应
   */
  startSession(machineId: string, projectPath: string, mode: 'chat' | 'shell' = 'shell', options?: SessionOptions): string | null {
    if (!this.socket?.connected) {
      console.log('[Socket] 未连接，无法启动会话');
      return null;
    }
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.socket.emit(SocketEvents.START_SESSION, {
      machine_id: machineId,
      project_path: projectPath,
      mode,
      options,
      request_id: requestId,
    });
    return requestId;
  }

  /**
   * 加入会话
   */
  joinSession(sessionId: string, machineId: string): void {
    const now = Date.now();
    if (
      this.lastJoinEmit &&
      this.lastJoinEmit.sessionId === sessionId &&
      this.lastJoinEmit.machineId === machineId &&
      now - this.lastJoinEmit.at < SocketManager.JOIN_DEDUPE_MS
    ) {
      return;
    }
    this.lastJoinEmit = { sessionId, machineId, at: now };
    if (!this.socket?.connected) {
      console.log('[Socket] 未连接，无法加入会话');
      return;
    }
    this.socket.emit(SocketEvents.JOIN_SESSION, {
      session_id: sessionId,
      machine_id: machineId,
    });
  }

  /**
   * 离开会话
   */
  leaveSession(sessionId: string): void {
    if (this.lastJoinEmit?.sessionId === sessionId) {
      this.lastJoinEmit = null;
    }
    if (!this.socket?.connected) {
      console.log('[Socket] 未连接，无法离开会话');
      return;
    }
    this.socket.emit('leave-session', sessionId);
  }

  /**
   * 发送会话输入
   */
  sendSessionInput(sessionId: string, input: string): void {
    if (!this.socket?.connected) {
      console.log('[Socket] 未连接，无法发送输入');
      return;
    }
    this.socket.emit(SocketEvents.SESSION_INPUT, {
      session_id: sessionId,
      data: input,
    });
  }

  /**
   * 回答权限请求
   */
  answerPermission(sessionId: string, approved: boolean, message?: string): void {
    if (!this.socket?.connected) {
      console.log('[Socket] 未连接，无法回答权限请求');
      return;
    }
    this.socket.emit(SocketEvents.SESSION_PERMISSION_ANSWER, {
      session_id: sessionId,
      approved,
      message,
    });
  }

  /**
   * 请求会话历史列表
   */
  listSessions(machineId: string, projectPath: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit(SocketEvents.LIST_SESSIONS, {
      machine_id: machineId,
      project_path: projectPath,
    });
  }

  /**
   * 获取会话历史消息
   */
  getSessionMessages(
    machineId: string,
    projectPath: string,
    sdkSessionId: string,
    limit?: number,
    offset?: number
  ): void {
    if (!this.socket?.connected) return;
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.socket.emit(SocketEvents.GET_SESSION_MESSAGES, {
      machine_id: machineId,
      project_path: projectPath,
      sdk_session_id: sdkSessionId,
      limit,
      offset,
      request_id: requestId,
    });
  }

  /**
   * 获取项目文件列表
   */
  listFiles(machineId: string, projectPath: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit(SocketEvents.LIST_FILES, {
      machine_id: machineId,
      project_path: projectPath,
    });
  }

  /**
   * 获取斜杠命令列表
   */
  listCommands(machineId: string, projectPath: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit(SocketEvents.LIST_COMMANDS, {
      machine_id: machineId,
      project_path: projectPath,
    });
  }

  /**
   * 发送 Chat 消息
   */
  sendChatMessage(sessionId: string, content: string): void {
    if (!this.socket?.connected) return;
    const evt: ChatSendEvent = { session_id: sessionId, content };
    this.socket.emit(SocketEvents.CHAT_SEND, evt);
  }

  /**
   * 中断当前 Chat 查询
   */
  abortChat(sessionId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit(SocketEvents.CHAT_ABORT, { session_id: sessionId });
  }

  /**
   * 回答 Chat 权限请求
   */
  answerChatPermission(
    sessionId: string,
    requestId: string,
    approved: boolean,
    message?: string,
    updatedInput?: Record<string, unknown>
  ): void {
    if (!this.socket?.connected) return;
    const evt: ChatPermissionAnswerEvent = { session_id: sessionId, requestId, approved, message, updatedInput };
    this.socket.emit(SocketEvents.CHAT_PERMISSION_ANSWER, evt);
  }

  /**
   * 发送终端 resize
   */
  sendResize(sessionId: string, cols: number, rows: number): void {
    if (!this.socket?.connected) return;
    const evt: SessionResizeEvent = { session_id: sessionId, cols, rows };
    this.socket.emit(SocketEvents.SESSION_RESIZE, evt);
  }

  /**
   * 读取文件
   */
  readFile(machineId: string, projectPath: string, filePath: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit(SocketEvents.READ_FILE, {
      machine_id: machineId,
      project_path: projectPath,
      file_path: filePath,
    });
  }

  /**
   * 保存文件
   */
  writeFile(machineId: string, projectPath: string, filePath: string, content: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit(SocketEvents.WRITE_FILE, {
      machine_id: machineId,
      project_path: projectPath,
      file_path: filePath,
      content,
    });
  }

  /**
   * 验证路径
   * @returns request_id 用于追踪响应
   */
  validatePath(machineId: string, path: string): string | null {
    if (!this.socket?.connected) {
      console.log('[Socket] 未连接，无法验证路径');
      return null;
    }
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const data: ValidatePathRequest = {
      machine_id: machineId,
      path,
      request_id: requestId,
    };
    this.socket.emit(SocketEvents.VALIDATE_PATH, data);
    return requestId;
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(event: string, data: unknown): void {
    // 缓存数据
    this.cachedData.set(event, data);

    const listeners = this.eventListeners.get(event);
    console.log(`[Socket] notifyListeners: ${event}, listeners: ${listeners?.size || 0}`);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }
}

// 导出单例
export const socketManager = new SocketManager();
