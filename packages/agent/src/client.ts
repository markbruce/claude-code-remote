/**
 * @cc-remote/agent - Socket.io客户端模块
 * 负责连接服务器，处理认证、心跳和事件转发
 */

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import {
  SocketEvents,
  SocketNamespaces,
  HEARTBEAT_INTERVAL,
  ProjectInfo,
  ScanProjectsRequest,
  StartSessionRequest,
  SessionOutputEvent,
  SessionInputEvent,
  SessionPermissionAnswerEvent,
  ChatMessageEvent,
  ChatSendEvent,
  ChatPermissionAnswerEvent,
  ChatPermissionRequestEvent,
  SessionResizeEvent,
  ListSessionsRequest,
  GetSessionMessagesRequest,
  ListFilesRequest,
  FileTreeItem,
  ListCommandsRequest,
  SlashCommandItem,
  ReadFileRequest,
  WriteFileRequest,
  FileContentResponse,
  GitStatusRequest,
  GitLogRequest,
  GitStageRequest,
  GitUnstageRequest,
  GitCommitRequest,
  ValidatePathRequest,
  AttachmentRef,
} from 'cc-remote-shared';
import {
  getGitStatus,
  getGitLog,
  stageFile,
  unstageFile,
  commitChanges,
} from './git';
import os from 'os';
import { promises as fs } from 'fs';
import path from 'path';
import { ConfigManager } from './config';
import { projectScanner } from './scanner';
import { sessionManager } from './session';
import { sdkSessionManager } from './sdk-session';
import { DownloadedAttachment } from './sdk-session';

/**
 * 客户端状态
 */
export enum ClientState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  AUTHENTICATING = 'authenticating',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

/**
 * 客户端配置
 */
export interface ClientConfig {
  /** 服务器URL */
  serverUrl: string;
  /** 自动重连 */
  autoReconnect?: boolean;
  /** 重连延迟（毫秒） */
  reconnectDelay?: number;
  /** 最大重连次数 */
  maxReconnectAttempts?: number;
}

/**
 * Socket客户端类
 */
export class AgentClient extends EventEmitter {
  private socket: Socket | null = null;
  private state: ClientState = ClientState.DISCONNECTED;
  private config: ClientConfig;
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private configManager: ConfigManager;

  constructor(config: ClientConfig, configManager: ConfigManager) {
    super();
    this.config = {
      autoReconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      ...config,
    };
    this.configManager = configManager;
  }

  /**
   * 连接服务器
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      console.log('已经连接到服务器');
      return;
    }

    // 检查是否已绑定
    const authInfo = this.configManager.getAuthInfo();
    if (!authInfo) {
      throw new Error('机器未绑定，请先运行 cc-agent bind 命令');
    }

    this.state = ClientState.CONNECTING;
    console.log(`连接服务器: ${this.config.serverUrl}${SocketNamespaces.AGENT}`);

    // 创建Socket连接
    this.socket = io(`${this.config.serverUrl}${SocketNamespaces.AGENT}`, {
      transports: ['websocket', 'polling'],
      reconnection: this.config.autoReconnect,
      reconnectionDelay: this.config.reconnectDelay,
      reconnectionAttempts: this.config.maxReconnectAttempts,
      auth: {
        machineId: authInfo.machine_id,
        machineToken: authInfo.machine_token,
      },
    });

    this.setupEventHandlers();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('连接超时'));
      }, 30000);

      this.socket!.once('connect', () => {
        clearTimeout(timeout);
        this.state = ClientState.AUTHENTICATING;
        console.log('已连接到服务器，等待认证...');
        resolve();
      });

      this.socket!.once('connect_error', (error) => {
        clearTimeout(timeout);
        this.state = ClientState.DISCONNECTED;
        reject(error);
      });
    });
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // 连接成功
    this.socket.on('connect', () => {
      console.log('Socket已连接');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    });

    // 认证成功
    this.socket.on(SocketEvents.CLIENT_CONNECTED, (data) => {
      this.state = ClientState.CONNECTED;
      console.log('认证成功:', data);
      this.emit('connected', data);
    });

    // 认证失败/错误
    this.socket.on(SocketEvents.ERROR, (error) => {
      console.error('服务器错误:', error);
      this.emit('error', error);

      // 如果是认证错误，断开连接
      if (error.message?.includes('授权') || error.message?.includes('token')) {
        this.disconnect();
      }
    });

    // 心跳检测
    this.socket.on(SocketEvents.AGENT_PING, () => {
      this.handlePing();
    });

    // 扫描工程请求
    this.socket.on(SocketEvents.SCAN_PROJECTS, async (data: ScanProjectsRequest) => {
      await this.handleScanProjects(data);
    });

    // 启动会话请求
    this.socket.on(SocketEvents.START_SESSION, async (data: StartSessionRequest) => {
      await this.handleStartSession(data);
    });

    // 加入会话请求
    this.socket.on(SocketEvents.JOIN_SESSION, async (data) => {
      await this.handleJoinSession(data);
    });

    // 会话输入
    this.socket.on(SocketEvents.SESSION_INPUT, (data: SessionInputEvent) => {
      this.handleSessionInput(data);
    });

    // 权限回答
    this.socket.on(SocketEvents.SESSION_PERMISSION_ANSWER, (data: SessionPermissionAnswerEvent) => {
      this.handlePermissionAnswer(data);
    });

    // 结束会话
    this.socket.on(SocketEvents.SESSION_END, (data) => {
      this.handleSessionEnd(data);
    });

    // 请求发送缓冲区
    this.socket.on(SocketEvents.SEND_BUFFER, (data) => {
      this.handleSendBuffer(data.session_id);
    });

    // Chat 模式：用户发送消息
    this.socket.on(SocketEvents.CHAT_SEND, (data: ChatSendEvent) => {
      this.handleChatSend(data);
    });

    // Chat 模式：权限审批回答
    this.socket.on(SocketEvents.CHAT_PERMISSION_ANSWER, (data: ChatPermissionAnswerEvent) => {
      this.handleChatPermissionAnswer(data);
    });

    // Chat 模式：中断当前查询
    this.socket.on(SocketEvents.CHAT_ABORT, (data: { session_id: string }) => {
      const session = sdkSessionManager.getSession(data.session_id);
      if (session) {
        session.abort();
      }
    });

    // Shell 模式：终端 resize
    this.socket.on(SocketEvents.SESSION_RESIZE, (data: SessionResizeEvent) => {
      this.handleSessionResize(data);
    });

    // 会话历史列表请求
    this.socket.on(SocketEvents.LIST_SESSIONS, (data: ListSessionsRequest) => {
      this.handleListSessions(data);
    });

    // 获取会话历史消息
    this.socket.on(SocketEvents.GET_SESSION_MESSAGES, (data: GetSessionMessagesRequest) => {
      this.handleGetSessionMessages(data);
    });

    // 获取文件列表
    this.socket.on(SocketEvents.LIST_FILES, (data: ListFilesRequest) => {
      this.handleListFiles(data);
    });

    // 获取斜杠命令列表
    this.socket.on(SocketEvents.LIST_COMMANDS, (data: ListCommandsRequest) => {
      this.handleListCommands(data);
    });

    // 读取文件
    this.socket.on(SocketEvents.READ_FILE, (data: ReadFileRequest) => {
      this.handleReadFile(data);
    });

    // 保存文件
    this.socket.on(SocketEvents.WRITE_FILE, (data: WriteFileRequest) => {
      this.handleWriteFile(data);
    });

    // Git 操作
    this.socket.on(SocketEvents.GIT_STATUS, (data: GitStatusRequest) => {
      this.handleGitStatus(data);
    });

    this.socket.on(SocketEvents.GIT_LOG, (data: GitLogRequest) => {
      this.handleGitLog(data);
    });

    this.socket.on(SocketEvents.GIT_STAGE, (data: GitStageRequest) => {
      this.handleGitStage(data);
    });

    this.socket.on(SocketEvents.GIT_UNSTAGE, (data: GitUnstageRequest) => {
      this.handleGitUnstage(data);
    });

    this.socket.on(SocketEvents.GIT_COMMIT, (data: GitCommitRequest) => {
      this.handleGitCommit(data);
    });

    // 路径验证
    this.socket.on(SocketEvents.VALIDATE_PATH, async (data: ValidatePathRequest) => {
      await this.handleValidatePath(data);
    });

    // 断开连接
    this.socket.on('disconnect', (reason) => {
      console.log('连接断开:', reason);
      this.state = ClientState.DISCONNECTED;
      this.stopHeartbeat();
      this.emit('disconnected', reason);

      // 如果不是主动断开，尝试重连
      if (reason === 'io server disconnect') {
        console.log('服务器主动断开连接');
      } else if (this.config.autoReconnect) {
        this.state = ClientState.RECONNECTING;
        console.log('将尝试重连...');
      }
    });

    // 重连尝试
    this.socket.on('reconnect_attempt', (attempt) => {
      this.reconnectAttempts = attempt;
      console.log(`重连尝试 ${attempt}/${this.config.maxReconnectAttempts}`);
      this.emit('reconnecting', attempt);
    });

    // 重连成功
    this.socket.on('reconnect', () => {
      console.log('重连成功');
      this.state = ClientState.CONNECTED;
    });

    // 重连失败
    this.socket.on('reconnect_failed', () => {
      console.log('重连失败');
      this.state = ClientState.DISCONNECTED;
      this.emit('reconnect_failed');
    });
  }

  /**
   * 处理心跳
   */
  private handlePing(): void {
    if (this.socket) {
      this.socket.emit(SocketEvents.AGENT_PONG, {
        machine_id: this.configManager.getAuthInfo()?.machine_id,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 开始心跳定时器
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        // 定期发送状态更新
        this.socket.emit('agent:status', {
          machine_id: this.configManager.getAuthInfo()?.machine_id,
          sessions_count: sessionManager.getSessionCount() + sdkSessionManager.getSessionCount(),
          timestamp: new Date().toISOString(),
        });
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * 停止心跳定时器
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 处理扫描工程请求
   */
  private async handleScanProjects(data: ScanProjectsRequest): Promise<void> {
    try {
      console.log(`扫描工程 (force_refresh: ${data.force_refresh})`);
      const projects = await projectScanner.scanProjects({ forceRefresh: data.force_refresh });

      this.socket?.emit(SocketEvents.PROJECTS_LIST, {
        machine_id: this.configManager.getAuthInfo()?.machine_id,
        projects,
        request_id: data.request_id,
      });
    } catch (error) {
      console.error('扫描工程失败:', error);
      this.socket?.emit(SocketEvents.ERROR, {
        message: '扫描工程失败',
        error: String(error),
      });
    }
  }

  /**
   * 处理启动会话请求（根据 mode 分发 Chat / Shell）
   */
  private async handleStartSession(data: StartSessionRequest): Promise<void> {
    const mode = data.mode ?? 'shell';
    // 如果是恢复历史会话，使用 SDK 会话 ID 作为 session ID
    const sessionId = data.options?.resume ? data.options.resume : this.generateSessionId();
    const isHistory = !!data.options?.resume;

    try {
      console.log(`启动会话请求 [${mode}]${isHistory ? ' (历史会话)' : ''}:`, data);

      if (mode === 'chat') {
        await this.startChatSession(sessionId, data);
      } else {
        await this.startShellSession(sessionId, data);
      }

      this.socket?.emit(SocketEvents.SESSION_STARTED, {
        session_id: sessionId,
        project_path: data.project_path,
        mode,
        request_id: data.request_id, // 透传 request_id 用于精确定向响应
        isHistory, // 标记是否为历史会话恢复
      });
    } catch (error) {
      console.error('启动会话失败:', error);
      this.socket?.emit(SocketEvents.ERROR, {
        message: '启动会话失败',
        error: String(error),
      });
    }
  }

  private async startShellSession(sessionId: string, data: StartSessionRequest): Promise<void> {
    console.log('[Agent][Diag] startShellSession begin', {
      sessionId,
      outputListeners: sessionManager.listenerCount('output'),
      endListeners: sessionManager.listenerCount('end'),
    });
    const session = await sessionManager.createSession({
      sessionId,
      projectPath: data.project_path,
      options: data.options,
    });

    const outputHandler = (event: SessionOutputEvent) => {
      if (event.session_id === session.getInfo().sessionId) {
        this.socket?.emit(SocketEvents.SESSION_OUTPUT, event);
      }
    };

    session.on('output', outputHandler);

    const shellEndHandler = (event: { session_id: string }) => {
      session.off('output', outputHandler);
      session.off('end', shellEndHandler);
      this.socket?.emit(SocketEvents.SESSION_END, event);
    };

    session.on('end', shellEndHandler);
    console.log('[Agent][Diag] startShellSession listeners attached', {
      sessionId,
      sessionOutputListeners: session.listenerCount('output'),
      sessionEndListeners: session.listenerCount('end'),
    });
  }

  private async startChatSession(sessionId: string, data: StartSessionRequest): Promise<void> {
    // 若同 sessionId 已有会话（例如重复发起 START_SESSION、双 tab 或快速连点），先结束旧会话，
    // 否则会为同一会话注册多组 chat-message 监听，导致每条消息被多次转发、前端出现「我们我们我们」式重复
    const existing = sdkSessionManager.getSession(sessionId);
    if (existing) {
      console.log(`[Agent] 结束已存在的同 session 会话后再创建: ${sessionId}`);
      await sdkSessionManager.endSession(sessionId);
    }

    console.log('[Agent][Diag] startChatSession begin', {
      sessionId,
      chatMessageListeners: sdkSessionManager.listenerCount('chat-message'),
      permissionListeners: sdkSessionManager.listenerCount('chat-permission-request'),
      endListeners: sdkSessionManager.listenerCount('end'),
      sessionCount: sdkSessionManager.getSessionCount(),
    });

    const session = await sdkSessionManager.createSession({
      sessionId,
      projectPath: data.project_path,
      options: data.options,
      resumeSdkSessionId: data.options?.resume,
    });

    const chatMessageHandler = (event: ChatMessageEvent) => {
      if (event.session_id === sessionId) {
        this.socket?.emit(SocketEvents.CHAT_MESSAGE, event);
      }
    };

    const permissionHandler = (event: ChatPermissionRequestEvent) => {
      if (event.session_id === sessionId) {
        this.socket?.emit(SocketEvents.CHAT_PERMISSION_REQUEST, event);
      }
    };

    session.on('chat-message', chatMessageHandler);
    session.on('chat-permission-request', permissionHandler);

    const chatEndHandler = (event: { session_id: string }) => {
      session.off('chat-message', chatMessageHandler);
      session.off('chat-permission-request', permissionHandler);
      session.off('end', chatEndHandler);
      this.socket?.emit(SocketEvents.SESSION_END, event);
    };

    session.on('end', chatEndHandler);
    console.log('[Agent][Diag] startChatSession listeners attached', {
      sessionId,
      sessionChatMessageListeners: session.listenerCount('chat-message'),
      sessionPermissionListeners: session.listenerCount('chat-permission-request'),
      sessionEndListeners: session.listenerCount('end'),
      sessionCount: sdkSessionManager.getSessionCount(),
    });
  }

  /**
   * 处理加入会话请求
   */
  private async handleJoinSession(data: { session_id: string; machine_id?: string }): Promise<void> {
    try {
      console.log(`[JoinSession] 收到加入请求: session_id=${data.session_id}, machine_id=${data.machine_id}`);
      
      const shellSession = sessionManager.getSession(data.session_id);
      if (shellSession) {
        console.log(`[JoinSession] 找到 Shell 会话: ${data.session_id}`);
        this.socket?.emit(SocketEvents.SESSION_BUFFER, {
          session_id: data.session_id,
          lines: shellSession.getOutputBuffer(),
        });
        return;
      }

      const chatSession = sdkSessionManager.getSession(data.session_id);
      if (chatSession) {
        console.log(`[JoinSession] 找到 Chat 会话: ${data.session_id}`);
        console.log('[Agent][Diag] join existing chat session', {
          sessionId: data.session_id,
          sessionCount: sdkSessionManager.getSessionCount(),
          chatMessageListeners: sdkSessionManager.listenerCount('chat-message'),
          permissionListeners: sdkSessionManager.listenerCount('chat-permission-request'),
          endListeners: sdkSessionManager.listenerCount('end'),
        });
        // Chat 模式的 buffer 由 server 端 chatBuffers 管理
        return;
      }

      // 会话不在内存中,检查是否是历史会话
      console.log(`[JoinSession] 会话 ${data.session_id} 不在内存中,检查是否是历史会话...`);
      
      // 尝试从 SDK 获取历史会话信息
      const historySession = await sdkSessionManager.getHistorySession(data.session_id);
      if (historySession) {
        console.log(`[JoinSession] 找到历史会话: ${data.session_id}, projectPath: ${historySession.cwd}`);
        this.socket?.emit(SocketEvents.SESSION_STARTED, {
          session_id: data.session_id,
          project_path: historySession.cwd,
          mode: 'chat',
          isHistory: true,
          request_id: (data as { request_id?: string }).request_id,
        });
        return;
      }

      console.log(`[JoinSession] 未找到历史会话: ${data.session_id}`);
      this.socket?.emit(SocketEvents.ERROR, {
        message: '会话不存在',
        request_id: (data as { request_id?: string }).request_id,
      });
    } catch (error) {
      console.error('[JoinSession] 加入会话失败:', error);
      this.socket?.emit(SocketEvents.ERROR, {
        message: '加入会话失败',
      });
    }
  }

  /**
   * 处理会话输入
   */
  private handleSessionInput(data: SessionInputEvent): void {
    try {
      const session = sessionManager.getSession(data.session_id);
      if (session && session.isRunning()) {
        session.sendInput(data.data);
      }
    } catch (error) {
      console.error('处理会话输入失败:', error);
    }
  }

  /**
   * 处理权限回答
   */
  private handlePermissionAnswer(data: SessionPermissionAnswerEvent): void {
    try {
      const session = sessionManager.getSession(data.session_id);
      if (session) {
        session.answerPermission(data.approved, data.message);
      }
    } catch (error) {
      console.error('处理权限回答失败:', error);
    }
  }

  /**
   * 处理发送缓冲区请求
   */
  private handleSendBuffer(sessionId: string): void {
    const session = sessionManager.getSession(sessionId);
    if (session) {
      this.socket?.emit(SocketEvents.SESSION_BUFFER, {
        session_id: sessionId,
        lines: session.getOutputBuffer(),
      });
    }
  }

  /**
   * Chat 模式：处理用户发送消息
   */
  private async handleChatSend(data: ChatSendEvent): Promise<void> {
    try {
      const session = sdkSessionManager.getSession(data.session_id);
      if (!session || !session.isRunning()) {
        console.warn(`Chat 会话不存在或未运行: ${data.session_id}`);
        return;
      }

      // Download attachments if present
      const downloadedAttachments: DownloadedAttachment[] = [];
      if (data.attachments?.length) {
        const projectPath = session.getInfo().projectPath;
        for (const att of data.attachments) {
          try {
            const localPath = await this.downloadAttachment(att, projectPath);
            const fileBuffer = await fs.readFile(localPath);
            downloadedAttachments.push({
              fileId: att.fileId,
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size,
              localPath,
              data: fileBuffer,
            });
          } catch (err) {
            console.error(`[Agent] Failed to download attachment ${att.fileId}:`, err);
            // Emit error but continue with other attachments
            this.socket?.emit(SocketEvents.CHAT_MESSAGE, {
              session_id: data.session_id,
              type: 'assistant' as const,
              content: `Failed to load attachment: ${att.filename}`,
              timestamp: new Date(),
            });
          }
        }
      }

      session.sendMessage(data.content, downloadedAttachments);
    } catch (error) {
      console.error('处理 Chat 消息失败:', error);
    }
  }

  private async downloadAttachment(att: AttachmentRef, projectPath: string): Promise<string> {
    const safeFilename = path.basename(att.filename).replace(/\.\./g, '');
    const uploadDir = path.join(projectPath, '.claude', 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    // Place .gitignore in uploads dir
    const gitignorePath = path.join(uploadDir, '.gitignore');
    try {
      await fs.access(gitignorePath);
    } catch {
      await fs.writeFile(gitignorePath, '*\n!.gitignore\n');
    }

    const localPath = path.join(uploadDir, `${att.fileId}_${safeFilename}`);

    // Deduplicate: skip download if file already exists
    try {
      await fs.access(localPath);
      return localPath;
    } catch {}

    // signedUrl is relative (e.g. /api/upload/xxx?token=...), resolve against server URL
    const downloadUrl = att.signedUrl.startsWith('http')
      ? att.signedUrl
      : `${this.config.serverUrl}${att.signedUrl}`;
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(localPath, buffer);
    return localPath;
  }

  /**
   * Chat 模式：处理权限审批回答
   */
  private handleChatPermissionAnswer(data: ChatPermissionAnswerEvent): void {
    try {
      const session = sdkSessionManager.getSession(data.session_id);
      if (session) {
        session.answerPermission(data.requestId, data.approved, data.message, data.updatedInput);
      }
    } catch (error) {
      console.error('处理 Chat 权限回答失败:', error);
    }
  }

  /**
   * Shell 模式：处理终端 resize
   */
  private handleSessionResize(data: SessionResizeEvent): void {
    try {
      const session = sessionManager.getSession(data.session_id);
      if (session && session.isRunning()) {
        session.resize(data.cols, data.rows);
      }
    } catch (error) {
      console.error('处理终端 resize 失败:', error);
    }
  }

  /**
   * 处理会话历史列表请求
   */
  private async handleListSessions(data: ListSessionsRequest): Promise<void> {
    try {
      console.log(`[ListSessions] 查询工程历史会话: ${data.project_path}`);
      const sessions = await sdkSessionManager.listProjectSessions(data.project_path);
      this.socket?.emit(SocketEvents.SESSIONS_LIST, {
        machine_id: data.machine_id,
        project_path: data.project_path,
        sessions,
        request_id: data.request_id,
      });
    } catch (error) {
      console.error('[ListSessions] 查询失败:', error);
      this.socket?.emit(SocketEvents.SESSIONS_LIST, {
        machine_id: data.machine_id,
        project_path: data.project_path,
        sessions: [],
        request_id: data.request_id,
      });
    }
  }

  /**
   * 获取会话历史消息（支持分页）
   */
   private async handleGetSessionMessages(data: GetSessionMessagesRequest): Promise<void> {
    try {
      console.log(`[GetSessionMessages] ${data.sdk_session_id} in ${data.project_path}, offset=${data.offset}`);
      const result = await sdkSessionManager.getSessionMessages(
        data.sdk_session_id,
        data.project_path,
        {
          limit: data.limit ?? 50,
          offset: data.offset,
          fromEnd: data.offset === undefined, // 首次加载从末尾开始
        },
      );

      const responseData = {
        machine_id: data.machine_id,
        sdk_session_id: data.sdk_session_id,
        messages: result.messages,
        total: result.total,
        hasMore: result.hasMore,
        offset: result.offset,
        limit: result.limit,
        request_id: data.request_id, // 透传 request_id 用于精确定向响应
      };

      console.log(`[GetSessionMessages] Emitting SESSION_MESSAGES:`, {
        messagesCount: result.messages.length,
        total: result.total,
        hasMore: result.hasMore,
        request_id: data.request_id,
        firstMessage: result.messages[0],
        lastMessage: result.messages[result.messages.length - 1]
      });

      this.socket?.emit(SocketEvents.SESSION_MESSAGES, responseData);
    } catch (error) {
      console.error('[GetSessionMessages] 失败:', error);
      this.socket?.emit(SocketEvents.SESSION_MESSAGES, {
        machine_id: data.machine_id,
        sdk_session_id: data.sdk_session_id,
        messages: [],
        total: 0,
        hasMore: false,
        offset: 0,
        limit: data.limit ?? 50,
        request_id: data.request_id, // 透传 request_id
      });
    }
  }

  /**
   * 获取项目文件列表（浅层扫描，忽略 node_modules/.git 等）
   */
  private async handleListFiles(data: ListFilesRequest): Promise<void> {
    const IGNORED = new Set([
      'node_modules', '.git', '.next', 'dist', 'build', '.turbo',
      '__pycache__', '.venv', 'venv', '.DS_Store', 'coverage',
    ]);

    const scanSingleLevel = async (dir: string): Promise<FileTreeItem[]> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const items: FileTreeItem[] = [];
        for (const entry of entries) {
          if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            items.push({ name: entry.name, path: fullPath, type: 'directory' });
          } else {
            items.push({ name: entry.name, path: fullPath, type: 'file' });
          }
        }
        items.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        return items;
      } catch {
        return [];
      }
    };

    const targetDir = data.dir_path || data.project_path;

    try {
      const items = await scanSingleLevel(targetDir);
      this.socket?.emit(SocketEvents.FILES_LIST, {
        machine_id: data.machine_id,
        project_path: data.project_path,
        dir_path: data.dir_path,
        files: items,
        request_id: data.request_id,
      });
    } catch (error) {
      console.error('[ListFiles] 失败:', error);
      this.socket?.emit(SocketEvents.FILES_LIST, {
        machine_id: data.machine_id,
        project_path: data.project_path,
        dir_path: data.dir_path,
        files: [],
        request_id: data.request_id,
      });
    }
  }

  /**
   * 解析 YAML frontmatter（简易实现，不引入额外依赖）
   */
  private parseFrontmatter(raw: string): { name?: string; description?: string } {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return {};
    const yml = match[1];
    const get = (key: string): string | undefined => {
      const m = yml.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?`, 'm'));
      return m?.[1]?.trim();
    };
    return { name: get('name'), description: get('description') };
  }

  // 扫描所有斜杠命令来源：
  // 1. {project}/.claude/commands/<name>.md  — 项目级命令
  // 2. ~/.claude/commands/<name>.md          — 用户级命令
  // 3. ~/.claude/skills/<name>/SKILL.md      — 用户安装的 Skills
  // 4. ~/.claude/plugins/.../commands/<n>.md  — Plugin 命令
  private async handleListCommands(data: ListCommandsRequest): Promise<void> {
    const scanCommandDir = async (dir: string, namespace: 'project' | 'user'): Promise<SlashCommandItem[]> => {
      const commands: SlashCommandItem[] = [];
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
          const fullPath = path.join(dir, entry.name);
          const raw = await fs.readFile(fullPath, 'utf8');
          const fm = this.parseFrontmatter(raw);
          const name = '/' + entry.name.replace(/\.md$/, '');
          const description = fm.description || raw.trim().split('\n')[0]?.replace(/^#+\s*/, '').trim() || name;
          commands.push({ name, description, namespace, path: fullPath });
        }
      } catch { /* dir doesn't exist */ }
      return commands;
    };

    const scanSkillsDir = async (dir: string): Promise<SlashCommandItem[]> => {
      const commands: SlashCommandItem[] = [];
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillFile = path.join(dir, entry.name, 'SKILL.md');
          try {
            const raw = await fs.readFile(skillFile, 'utf8');
            const fm = this.parseFrontmatter(raw);
            const name = '/' + (fm.name || entry.name);
            const description = fm.description || entry.name;
            commands.push({ name, description, namespace: 'user', path: skillFile });
          } catch { /* no SKILL.md */ }
        }
      } catch { /* dir doesn't exist */ }
      return commands;
    };

    const scanPluginCommands = async (baseDir: string): Promise<SlashCommandItem[]> => {
      const commands: SlashCommandItem[] = [];
      try {
        const marketplaces = await fs.readdir(baseDir, { withFileTypes: true });
        for (const mp of marketplaces) {
          if (!mp.isDirectory()) continue;
          const mpPath = path.join(baseDir, mp.name);
          for (const subDir of ['plugins', 'external_plugins']) {
            const pluginsDir = path.join(mpPath, subDir);
            try {
              const plugins = await fs.readdir(pluginsDir, { withFileTypes: true });
              for (const plugin of plugins) {
                if (!plugin.isDirectory()) continue;
                const cmdsDir = path.join(pluginsDir, plugin.name, 'commands');
                try {
                  const cmdFiles = await fs.readdir(cmdsDir, { withFileTypes: true });
                  for (const f of cmdFiles) {
                    if (!f.isFile() || !f.name.endsWith('.md')) continue;
                    const fullPath = path.join(cmdsDir, f.name);
                    const raw = await fs.readFile(fullPath, 'utf8');
                    const fm = this.parseFrontmatter(raw);
                    const name = '/' + f.name.replace(/\.md$/, '');
                    const description = fm.description || raw.trim().split('\n')[0]?.replace(/^#+\s*/, '').trim() || name;
                    commands.push({ name, description, namespace: 'user', path: fullPath });
                  }
                } catch { /* no commands dir */ }
              }
            } catch { /* no plugins/external_plugins dir */ }
          }
        }
      } catch { /* no marketplaces dir */ }
      return commands;
    };

    try {
      const home = os.homedir();
      const [projectCmds, userCmds, skills, pluginCmds] = await Promise.all([
        scanCommandDir(path.join(data.project_path, '.claude', 'commands'), 'project'),
        scanCommandDir(path.join(home, '.claude', 'commands'), 'user'),
        scanSkillsDir(path.join(home, '.claude', 'skills')),
        scanPluginCommands(path.join(home, '.claude', 'plugins', 'marketplaces')),
      ]);

      const seen = new Set<string>();
      const deduped = [...projectCmds, ...userCmds, ...skills, ...pluginCmds].filter((c) => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
        return true;
      });

      console.log(`[ListCommands] 找到 ${deduped.length} 个命令/技能`);
      this.socket?.emit(SocketEvents.COMMANDS_LIST, {
        machine_id: data.machine_id,
        project_path: data.project_path,
        commands: deduped,
        request_id: data.request_id,
      });
    } catch (error) {
      console.error('[ListCommands] 失败:', error);
      this.socket?.emit(SocketEvents.COMMANDS_LIST, {
        machine_id: data.machine_id,
        project_path: data.project_path,
        commands: [],
        request_id: data.request_id,
      });
    }
  }

  /**
   * 获取文件语言类型
   */
  private getFileLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      mjs: 'javascript',
      cjs: 'javascript',
      json: 'json',
      css: 'css',
      scss: 'scss',
      sass: 'scss',
      less: 'less',
      html: 'html',
      htm: 'html',
      md: 'markdown',
      mdx: 'markdown',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      kt: 'kotlin',
      swift: 'swift',
      c: 'c',
      cpp: 'cpp',
      cc: 'cpp',
      cxx: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      vue: 'vue',
      svelte: 'svelte',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      sql: 'sql',
      sh: 'shell',
      bash: 'shell',
      zsh: 'shell',
      dockerfile: 'dockerfile',
      makefile: 'makefile',
      toml: 'toml',
      ini: 'ini',
      env: 'plaintext',
      txt: 'plaintext',
      log: 'plaintext',
    };
    // 特殊文件名处理
    const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? '';
    if (fileName === 'dockerfile') return 'dockerfile';
    if (fileName === 'makefile') return 'makefile';
    if (fileName.startsWith('.env')) return 'plaintext';

    return languageMap[ext] || 'plaintext';
  }

  /**
   * 检查是否为二进制文件
   */
  private isBinaryFile(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const binaryExtensions = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'zip', 'tar', 'gz', 'rar', '7z', 'bz2',
      'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'flv',
      'exe', 'dll', 'so', 'dylib', 'a', 'o', 'obj',
      'ttf', 'otf', 'woff', 'woff2', 'eot',
      'sqlite', 'db', 'sqlite3',
      'node_modules', 'lock', 'pem', 'key', 'crt',
    ]);
    return binaryExtensions.has(ext);
  }

  /**
   * 图片文件扩展名
   */
  private isImageFile(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg'].includes(ext);
  }

  // 最大文件大小 1MB
  private static readonly MAX_FILE_SIZE = 1024 * 1024;

  /**
   * 读取文件内容
   */
  private async handleReadFile(data: ReadFileRequest): Promise<void> {
    try {
      console.log(`[ReadFile] 读取文件: ${data.file_path}`);

      // 检查是否为二进制文件
      if (this.isBinaryFile(data.file_path)) {
        const response: FileContentResponse = {
          path: data.file_path,
          content: '',
          language: 'plaintext',
          size: 0,
          readonly: true,
        };

        // 图片文件特殊处理 - 返回 base64
        if (this.isImageFile(data.file_path)) {
          try {
            const buffer = await fs.readFile(data.file_path);
            const base64 = buffer.toString('base64');
            const ext = data.file_path.split('.').pop()?.toLowerCase() ?? 'png';
            const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
            response.content = `data:${mimeType};base64,${base64}`;
            response.size = buffer.length;
            response.language = 'image';
          } catch {
            response.content = '[无法读取图片文件]';
          }
        } else {
          response.content = '[二进制文件，无法显示]';
        }

        this.socket?.emit(SocketEvents.FILE_CONTENT, {
          machine_id: data.machine_id,
          project_path: data.project_path,
          request_id: data.request_id,
          ...response,
        });
        return;
      }

      // 检查文件大小
      const stats = await fs.stat(data.file_path);
      if (stats.size > AgentClient.MAX_FILE_SIZE) {
        this.socket?.emit(SocketEvents.FILE_CONTENT, {
          machine_id: data.machine_id,
          project_path: data.project_path,
          request_id: data.request_id,
          path: data.file_path,
          content: `[文件过大 (${(stats.size / 1024 / 1024).toFixed(2)}MB)，超过 1MB 限制]`,
          language: 'plaintext',
          size: stats.size,
          readonly: true,
        });
        return;
      }

      // 读取文件内容
      const content = await fs.readFile(data.file_path, 'utf8');
      const language = this.getFileLanguage(data.file_path);

      this.socket?.emit(SocketEvents.FILE_CONTENT, {
        machine_id: data.machine_id,
        project_path: data.project_path,
        request_id: data.request_id,
        path: data.file_path,
        content,
        language,
        size: stats.size,
        readonly: false,
      });
    } catch (error) {
      console.error('[ReadFile] 失败:', error);
      this.socket?.emit(SocketEvents.FILE_CONTENT, {
        machine_id: data.machine_id,
        project_path: data.project_path,
        request_id: data.request_id,
        path: data.file_path,
        content: `[读取文件失败: ${error}]`,
        language: 'plaintext',
        size: 0,
        readonly: true,
      });
    }
  }

  /**
   * 保存文件内容
   */
  private async handleWriteFile(data: WriteFileRequest): Promise<void> {
    try {
      console.log(`[WriteFile] 保存文件: ${data.file_path}`);

      // 确保目录存在
      const dir = path.dirname(data.file_path);
      await fs.mkdir(dir, { recursive: true });

      // 写入文件
      await fs.writeFile(data.file_path, data.content, 'utf8');

      this.socket?.emit(SocketEvents.FILE_SAVED, {
        machine_id: data.machine_id,
        project_path: data.project_path,
        path: data.file_path,
        success: true,
        request_id: data.request_id,
      });
    } catch (error) {
      console.error('[WriteFile] 失败:', error);
      this.socket?.emit(SocketEvents.FILE_SAVED, {
        machine_id: data.machine_id,
        project_path: data.project_path,
        path: data.file_path,
        success: false,
        error: String(error),
        request_id: data.request_id,
      });
    }
  }

  // ==================== Git 操作处理 ====================

  /**
   * 处理 Git 状态请求
   */
  private async handleGitStatus(data: GitStatusRequest): Promise<void> {
    console.log(`[Git] Status request: ${data.project_path}`);
    try {
      const response = await getGitStatus(data);
      this.socket?.emit(SocketEvents.GIT_STATUS_RESPONSE, response);
    } catch (error) {
      console.error('[Git] handleGitStatus error:', error);
      this.socket?.emit(SocketEvents.GIT_STATUS_RESPONSE, {
        request_id: data.request_id,
        success: false,
        error: error instanceof Error ? error.message : '处理 Git 状态请求失败',
      });
    }
  }

  /**
   * 处理 Git 日志请求
   */
  private async handleGitLog(data: GitLogRequest): Promise<void> {
    console.log(`[Git] Log request: ${data.project_path}`);
    try {
      const response = await getGitLog(data);
      this.socket?.emit(SocketEvents.GIT_LOG_RESPONSE, response);
    } catch (error) {
      console.error('[Git] handleGitLog error:', error);
      this.socket?.emit(SocketEvents.GIT_LOG_RESPONSE, {
        request_id: data.request_id,
        success: false,
        error: error instanceof Error ? error.message : '处理 Git 日志请求失败',
      });
    }
  }

  /**
   * 处理 Git 暂存请求
   */
  private async handleGitStage(data: GitStageRequest): Promise<void> {
    console.log(`[Git] Stage request: ${data.file}`);
    try {
      const response = await stageFile(data);
      this.socket?.emit(SocketEvents.GIT_STAGE_RESPONSE, response);
    } catch (error) {
      console.error('[Git] handleGitStage error:', error);
      this.socket?.emit(SocketEvents.GIT_STAGE_RESPONSE, {
        request_id: data.request_id,
        success: false,
        error: error instanceof Error ? error.message : '暂存文件失败',
      });
    }
  }

  /**
   * 处理 Git 取消暂存请求
   */
  private async handleGitUnstage(data: GitUnstageRequest): Promise<void> {
    console.log(`[Git] Unstage request: ${data.file}`);
    try {
      const response = await unstageFile(data);
      this.socket?.emit(SocketEvents.GIT_UNSTAGE_RESPONSE, response);
    } catch (error) {
      console.error('[Git] handleGitUnstage error:', error);
      this.socket?.emit(SocketEvents.GIT_UNSTAGE_RESPONSE, {
        request_id: data.request_id,
        success: false,
        error: error instanceof Error ? error.message : '取消暂存失败',
      });
    }
  }

  /**
   * 处理 Git 提交请求
   */
  private async handleGitCommit(data: GitCommitRequest): Promise<void> {
    console.log(`[Git] Commit request: ${data.message}`);
    try {
      const response = await commitChanges(data);
      this.socket?.emit(SocketEvents.GIT_COMMIT_RESPONSE, response);
    } catch (error) {
      console.error('[Git] handleGitCommit error:', error);
      this.socket?.emit(SocketEvents.GIT_COMMIT_RESPONSE, {
        request_id: data.request_id,
        success: false,
        error: error instanceof Error ? error.message : '提交失败',
      });
    }
  }

  /**
   * 处理路径验证请求
   */
  private async handleValidatePath(data: ValidatePathRequest): Promise<void> {
    console.log(`[Agent] Validate path request: ${data.path}`);

    try {
      // 检查路径是否存在
      const stats = await fs.stat(data.path).catch(() => null);

      if (!stats) {
        this.socket?.emit(SocketEvents.PATH_VALIDATED, {
          request_id: data.request_id,
          valid: false,
          exists: false,
          isDirectory: false,
          error: '路径不存在',
        });
        return;
      }

      // 检查是否是目录
      if (!stats.isDirectory()) {
        this.socket?.emit(SocketEvents.PATH_VALIDATED, {
          request_id: data.request_id,
          valid: false,
          exists: true,
          isDirectory: false,
          error: '路径不是目录',
        });
        return;
      }

      // 路径有效
      this.socket?.emit(SocketEvents.PATH_VALIDATED, {
        request_id: data.request_id,
        valid: true,
        exists: true,
        isDirectory: true,
        path: data.path,
      });
    } catch (error) {
      console.error('[Agent] Validate path error:', error);
      this.socket?.emit(SocketEvents.PATH_VALIDATED, {
        request_id: data.request_id,
        valid: false,
        exists: false,
        isDirectory: false,
        error: '路径验证失败',
      });
    }
  }

  // ==================== 会话管理 ====================

  /**
   * 处理会话结束请求（支持两种模式）
   */
  private handleSessionEnd(data: { session_id: string; reason?: string }): void {
    const shellSession = sessionManager.getSession(data.session_id);
    if (shellSession) {
      sessionManager.endSession(data.session_id, data.reason);
      return;
    }

    const chatSession = sdkSessionManager.getSession(data.session_id);
    if (chatSession) {
      sdkSessionManager.endSession(data.session_id, data.reason);
    }
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    const machineId = this.configManager.getAuthInfo()?.machine_id || 'unknown';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${machineId}-${timestamp}-${random}`;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    console.log('断开服务器连接...');

    this.stopHeartbeat();

    // 结束所有会话
    await Promise.all([
      sessionManager.endAllSessions(),
      sdkSessionManager.endAllSessions(),
    ]);

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.state = ClientState.DISCONNECTED;
    this.emit('disconnected', 'manual');
  }

  /**
   * 获取连接状态
   */
  getState(): ClientState {
    return this.state;
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.state === ClientState.CONNECTED && this.socket?.connected === true;
  }

  /**
   * 获取Socket ID
   */
  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

// 导出工厂函数
export function createAgentClient(serverUrl: string, configManager: ConfigManager): AgentClient {
  return new AgentClient({ serverUrl }, configManager);
}
