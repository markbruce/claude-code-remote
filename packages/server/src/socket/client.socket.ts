/**
 * Client Socket处理器
 * 处理Client命名空间的连接和事件
 */

import { Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import {
  SocketEvents,
  SocketNamespaces,
  ERROR_MESSAGES,
  ScanProjectsRequest,
  StartSessionRequest,
  StartSessionResponse,
  SessionInputEvent,
  SessionPermissionAnswerEvent,
  JoinSessionRequest,
  Machine,
  ChatSendEvent,
  ChatPermissionAnswerEvent,
  SessionResizeEvent,
  ListSessionsRequest,
  GetSessionMessagesRequest,
  ListFilesRequest,
  ListCommandsRequest,
  ReadFileRequest,
  WriteFileRequest,
  ValidatePathRequest,
} from 'cc-remote-shared';
import { verifyToken, JwtPayload } from '../auth';
import { onlineMachines, sessions, sessionBuffers, getMachineSessions, getIoInstance } from './store';
import { isMachineOnline } from './agent.socket';

const prisma = new PrismaClient();

// 请求ID -> Socket ID 映射（用于精确定向响应）
const pendingRequests = new Map<string, string>();

// 生成唯一请求ID
function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// 导出给 agent.socket.ts 使用
export function getSocketIdByRequestId(requestId: string): string | undefined {
  return pendingRequests.get(requestId);
}

export function removePendingRequest(requestId: string): void {
  pendingRequests.delete(requestId);
}

// Client Socket认证接口
interface ClientAuthData {
  token: string;
}

// 扩展Socket类型
interface ClientSocket extends Socket {
  data: {
    userId: string;
    email: string;
    jwtPayload: JwtPayload;
  };
}

/**
 * Client认证中间件
 * 验证JWT令牌
 */
export async function clientAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  try {
    const auth = socket.handshake.auth as ClientAuthData;
    const { token } = auth;

    if (!token) {
      return next(new Error('缺少JWT令牌'));
    }

    // 验证JWT
    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('无效或过期的JWT令牌'));
    }

    // 验证用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user) {
      return next(new Error('用户不存在'));
    }

    // 将信息存储到socket.data
    socket.data = {
      userId: payload.userId,
      email: payload.email,
      jwtPayload: payload
    };

    console.log(`[Client] Authenticated: ${user.email}`);
    next();
  } catch (error) {
    console.error('[Client] Auth error:', error);
    next(new Error('认证失败'));
  }
}

/**
 * 发送机器列表给客户端
 */
async function sendMachinesList(socket: Socket, userId: string) {
  try {
    // 获取用户的所有机器
    const machines = await prisma.machine.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });

    // 获取在线机器信息
    const onlineInfo: { machineId: string; lastSeen: Date; socketId: string }[] = [];
    machines.forEach((machine: Machine) => {
      const info = onlineMachines.get(machine.id);
      if (info) {
        onlineInfo.push(info);
      }
    });

    socket.emit(SocketEvents.MACHINES_LIST, {
      machines,
      onlineInfo
    });
  } catch (error) {
    console.error('[Client] Send machines error:', error);
    socket.emit(SocketEvents.ERROR, {
      message: '获取机器列表失败'
    });
  }
}

/**
 * 跨命名空间发送消息给Agent
 */
function emitToAgent(machineId: string, event: string, data: unknown): boolean {
  const io = getIoInstance();
  if (!io) {
    console.error('[Client] IO instance not available');
    return false;
  }
  io.of(SocketNamespaces.AGENT).to(`machine:${machineId}`).emit(event, data);
  return true;
}

/**
 * 处理Client连接
 */
export function handleClientConnection(socket: ClientSocket) {
  const userId = socket.data.userId;

  console.log(`[Client] Connected: ${socket.id} for user ${userId}`);

  // 加入用户房间，便于服务端向该用户的所有客户端广播（如 PROJECTS_LIST）
  socket.join(`user:${userId}`);

  // 发送连接确认
  socket.emit(SocketEvents.CLIENT_CONNECTED, {
    message: '连接成功',
    userId
  });

  // 自动发送机器列表
  sendMachinesList(socket, userId);

  // 处理获取机器列表（手动刷新）
  socket.on(SocketEvents.MACHINES_LIST, async () => {
    await sendMachinesList(socket, userId);
  });

  // 处理扫描项目请求
  socket.on(SocketEvents.SCAN_PROJECTS, async (data: ScanProjectsRequest) => {
    try {
      // 验证机器所有权
      const machine = await prisma.machine.findFirst({
        where: {
          id: data.machine_id,
          user_id: userId
        }
      });

      if (!machine) {
        socket.emit(SocketEvents.ERROR, {
          message: ERROR_MESSAGES.MACHINE_NOT_FOUND
        });
        return;
      }

      // 检查机器是否在线
      const machineInfo = onlineMachines.get(data.machine_id);
      if (!machineInfo) {
        socket.emit(SocketEvents.ERROR, {
          message: ERROR_MESSAGES.MACHINE_OFFLINE
        });
        return;
      }

      const requestId = generateRequestId();
      pendingRequests.set(requestId, socket.id);

      // 转发请求给Agent（跨命名空间）
      if (!emitToAgent(data.machine_id, SocketEvents.SCAN_PROJECTS, {
        ...data,
        request_id: requestId,
      })) {
        pendingRequests.delete(requestId);
        socket.emit(SocketEvents.ERROR, {
          message: '服务器配置错误'
        });
        return;
      }
    } catch (error) {
      console.error('[Client] Scan projects error:', error);
      socket.emit(SocketEvents.ERROR, {
        message: '扫描项目失败'
      });
    }
  });

  // 处理启动会话请求
  socket.on(SocketEvents.START_SESSION, async (data: StartSessionRequest) => {
    try {
      // 验证机器所有权
      const machine = await prisma.machine.findFirst({
        where: {
          id: data.machine_id,
          user_id: userId
        }
      });

      if (!machine) {
        socket.emit(SocketEvents.ERROR, {
          message: ERROR_MESSAGES.MACHINE_NOT_FOUND
        });
        return;
      }

      // 检查机器是否在线
      const machineInfo = onlineMachines.get(data.machine_id);
      if (!machineInfo) {
        socket.emit(SocketEvents.ERROR, {
          message: ERROR_MESSAGES.MACHINE_OFFLINE
        });
        return;
      }

      // 生成请求ID并保存映射（用于精确定向响应）
      const requestId = data.request_id || generateRequestId();
      pendingRequests.set(requestId, socket.id);

      // 转发请求给Agent（跨命名空间）
      if (!emitToAgent(data.machine_id, SocketEvents.START_SESSION, {
        ...data,
        request_id: requestId,
      })) {
        socket.emit(SocketEvents.ERROR, {
          message: '服务器配置错误'
        });
        return;
      }
    } catch (error) {
      console.error('[Client] Start session error:', error);
      socket.emit(SocketEvents.ERROR, {
        message: '启动会话失败'
      });
    }
  });

  // 处理路径验证请求
  socket.on(SocketEvents.VALIDATE_PATH, async (data: ValidatePathRequest) => {
    try {
      // 验证机器所有权
      const machine = await prisma.machine.findFirst({
        where: {
          id: data.machine_id,
          user_id: userId
        }
      });

      if (!machine) {
        socket.emit(SocketEvents.PATH_VALIDATED, {
          request_id: data.request_id,
          valid: false,
          exists: false,
          isDirectory: false,
          error: ERROR_MESSAGES.MACHINE_NOT_FOUND
        });
        return;
      }

      // 检查机器是否在线
      const machineInfo = onlineMachines.get(data.machine_id);
      if (!machineInfo) {
        socket.emit(SocketEvents.PATH_VALIDATED, {
          request_id: data.request_id,
          valid: false,
          exists: false,
          isDirectory: false,
          error: ERROR_MESSAGES.MACHINE_OFFLINE
        });
        return;
      }

      // 保存请求映射
      const requestId = data.request_id || generateRequestId();
      pendingRequests.set(requestId, socket.id);

      // 转发请求给Agent（跨命名空间）
      if (!emitToAgent(data.machine_id, SocketEvents.VALIDATE_PATH, {
        ...data,
        request_id: requestId,
      })) {
        socket.emit(SocketEvents.PATH_VALIDATED, {
          request_id: requestId,
          valid: false,
          exists: false,
          isDirectory: false,
          error: '服务器配置错误'
        });
        return;
      }
    } catch (error) {
      console.error('[Client] Validate path error:', error);
      socket.emit(SocketEvents.PATH_VALIDATED, {
        request_id: data.request_id,
        valid: false,
        exists: false,
        isDirectory: false,
        error: '路径验证失败'
      });
    }
  });

  // 处理加入会话
  socket.on(SocketEvents.JOIN_SESSION, async (data: JoinSessionRequest) => {
    try {
      // 验证机器所有权
      const machine = await prisma.machine.findFirst({
        where: {
          id: data.machine_id,
          user_id: userId
        }
      });

      if (!machine) {
        socket.emit(SocketEvents.ERROR, {
          message: ERROR_MESSAGES.MACHINE_NOT_FOUND
        });
        return;
      }

      // 检查会话是否已在内存
      const sessionInfo = sessions.get(data.session_id);
      if (!sessionInfo || sessionInfo.machineId !== data.machine_id) {
        // 会话不在内存：转发给 Agent 尝试解析历史会话（带 request_id 以便回包定向）
        const requestId = generateRequestId();
        pendingRequests.set(requestId, socket.id);
        if (!emitToAgent(data.machine_id, SocketEvents.JOIN_SESSION, {
          ...data,
          request_id: requestId,
        })) {
          pendingRequests.delete(requestId);
          socket.emit(SocketEvents.ERROR, {
            message: ERROR_MESSAGES.SESSION_NOT_FOUND
          });
        }
        return;
      }

      const room = `session:${data.session_id}`;
      // 防死循环：同一 socket 重复 JOIN_SESSION 时只做一次（已在该房间则不再发 SESSION_STARTED，避免前端反复 fetchHistoryMessages）
      if (socket.rooms.has(room)) {
        console.log('[Client][Diag] skip duplicate join', {
          socketId: socket.id,
          sessionId: data.session_id,
          room,
          rooms: Array.from(socket.rooms),
        });
        return;
      }
      socket.join(room);

      // 更新客户端计数
      sessionInfo.clientsCount++;

      console.log(`[Client] Joined session: ${data.session_id} [${sessionInfo.mode}] (existing)`, {
        socketId: socket.id,
        room,
        rooms: Array.from(socket.rooms),
        clientsCount: sessionInfo.clientsCount,
      });

      // 多开修复：第二个/多 tab 加入已有会话时未收 SESSION_STARTED 会一直停在「加载历史消息…」。
      // 向本 socket 发送 SESSION_STARTED，让前端设置 currentSession 并拉取历史；标记 fromExistingSession 避免前端再次 join。
      socket.emit(SocketEvents.SESSION_STARTED, {
        sessionId: data.session_id,
        projectPath: sessionInfo.projectPath ?? '',
        machineId: data.machine_id,
        mode: sessionInfo.mode,
        isHistory: true,
        fromExistingSession: true,
      });

      if (sessionInfo.mode !== 'chat') {
        // Shell 模式：发送终端输出缓冲区
        const buffer = sessionBuffers.get(data.session_id);
        if (buffer && buffer.length > 0) {
          socket.emit(SocketEvents.SESSION_BUFFER, {
            session_id: data.session_id,
            lines: buffer
          });
        }

        // 通知Agent发送当前缓冲区（跨命名空间）
        emitToAgent(data.machine_id, SocketEvents.SEND_BUFFER, {
          session_id: data.session_id
        });
      }
    } catch (error) {
      console.error('[Client] Join session error:', error);
      socket.emit(SocketEvents.ERROR, {
        message: '加入会话失败'
      });
    }
  });

  // 处理会话输入
  socket.on(SocketEvents.SESSION_INPUT, (data: SessionInputEvent) => {
    const sessionInfo = sessions.get(data.session_id);
    if (!sessionInfo) {
      socket.emit(SocketEvents.ERROR, {
        message: ERROR_MESSAGES.SESSION_NOT_FOUND
      });
      return;
    }

    // 转发给Agent（跨命名空间）
    emitToAgent(sessionInfo.machineId, SocketEvents.SESSION_INPUT, data);
  });

  // 处理权限回答（Shell 模式）
  socket.on(SocketEvents.SESSION_PERMISSION_ANSWER, (data: SessionPermissionAnswerEvent) => {
    const sessionInfo = sessions.get(data.session_id);
    if (!sessionInfo) {
      socket.emit(SocketEvents.ERROR, {
        message: ERROR_MESSAGES.SESSION_NOT_FOUND
      });
      return;
    }

    emitToAgent(sessionInfo.machineId, SocketEvents.SESSION_PERMISSION_ANSWER, data);
  });

  // Chat 模式：转发用户消息（Client -> Agent）
  socket.on(SocketEvents.CHAT_SEND, (data: ChatSendEvent) => {
    const sessionInfo = sessions.get(data.session_id);
    if (!sessionInfo) {
      socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.SESSION_NOT_FOUND });
      return;
    }
    emitToAgent(sessionInfo.machineId, SocketEvents.CHAT_SEND, data);
  });

  // Chat 模式：转发权限审批回答（Client -> Agent）
  socket.on(SocketEvents.CHAT_PERMISSION_ANSWER, (data: ChatPermissionAnswerEvent) => {
    const sessionInfo = sessions.get(data.session_id);
    if (!sessionInfo) {
      socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.SESSION_NOT_FOUND });
      return;
    }
    emitToAgent(sessionInfo.machineId, SocketEvents.CHAT_PERMISSION_ANSWER, data);
  });

  // Shell 模式：转发终端 resize（Client -> Agent）
  socket.on(SocketEvents.SESSION_RESIZE, (data: SessionResizeEvent) => {
    const sessionInfo = sessions.get(data.session_id);
    if (!sessionInfo) {
      socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.SESSION_NOT_FOUND });
      return;
    }
    emitToAgent(sessionInfo.machineId, SocketEvents.SESSION_RESIZE, data);
  });

  // 会话历史列表：转发到 Agent
  socket.on(SocketEvents.LIST_SESSIONS, async (data: ListSessionsRequest) => {
    try {
      const machine = await prisma.machine.findFirst({
        where: { id: data.machine_id, user_id: userId },
      });
      if (!machine) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_NOT_FOUND });
        return;
      }
      if (!onlineMachines.get(data.machine_id)) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_OFFLINE });
        return;
      }
      const requestId = generateRequestId();
      pendingRequests.set(requestId, socket.id);
      emitToAgent(data.machine_id, SocketEvents.LIST_SESSIONS, {
        ...data,
        request_id: requestId,
      });
    } catch (error) {
      console.error('[Client] List sessions error:', error);
      socket.emit(SocketEvents.ERROR, { message: '获取会话列表失败' });
    }
  });

  // 获取会话历史消息：转发到 Agent
  socket.on(SocketEvents.GET_SESSION_MESSAGES, async (data: GetSessionMessagesRequest) => {
    try {
      const machine = await prisma.machine.findFirst({
        where: { id: data.machine_id, user_id: userId },
      });
      if (!machine) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_NOT_FOUND });
        return;
      }
      if (!onlineMachines.get(data.machine_id)) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_OFFLINE });
        return;
      }

      // 生成请求ID并保存映射（用于精确定向响应）
      const requestId = data.request_id || generateRequestId();
      pendingRequests.set(requestId, socket.id);

      emitToAgent(data.machine_id, SocketEvents.GET_SESSION_MESSAGES, {
        ...data,
        request_id: requestId,
      });
    } catch (error) {
      console.error('[Client] Get session messages error:', error);
      socket.emit(SocketEvents.ERROR, { message: '获取会话消息失败' });
    }
  });

  // 获取文件列表：转发到 Agent
  socket.on(SocketEvents.LIST_FILES, async (data: ListFilesRequest) => {
    try {
      const machine = await prisma.machine.findFirst({
        where: { id: data.machine_id, user_id: userId },
      });
      if (!machine) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_NOT_FOUND });
        return;
      }
      if (!onlineMachines.get(data.machine_id)) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_OFFLINE });
        return;
      }
      const requestId = generateRequestId();
      pendingRequests.set(requestId, socket.id);
      emitToAgent(data.machine_id, SocketEvents.LIST_FILES, {
        ...data,
        request_id: requestId,
      });
    } catch (error) {
      console.error('[Client] List files error:', error);
      socket.emit(SocketEvents.ERROR, { message: '获取文件列表失败' });
    }
  });

  // 获取斜杠命令列表：转发到 Agent
  socket.on(SocketEvents.LIST_COMMANDS, async (data: ListCommandsRequest) => {
    try {
      const machine = await prisma.machine.findFirst({
        where: { id: data.machine_id, user_id: userId },
      });
      if (!machine) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_NOT_FOUND });
        return;
      }
      if (!onlineMachines.get(data.machine_id)) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_OFFLINE });
        return;
      }
      const requestId = generateRequestId();
      pendingRequests.set(requestId, socket.id);
      emitToAgent(data.machine_id, SocketEvents.LIST_COMMANDS, {
        ...data,
        request_id: requestId,
      });
    } catch (error) {
      console.error('[Client] List commands error:', error);
      socket.emit(SocketEvents.ERROR, { message: '获取命令列表失败' });
    }
  });

  // 读取文件：转发到 Agent
  socket.on(SocketEvents.READ_FILE, async (data: ReadFileRequest) => {
    try {
      const machine = await prisma.machine.findFirst({
        where: { id: data.machine_id, user_id: userId },
      });
      if (!machine) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_NOT_FOUND });
        return;
      }
      if (!onlineMachines.get(data.machine_id)) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_OFFLINE });
        return;
      }
      const requestId = generateRequestId();
      pendingRequests.set(requestId, socket.id);
      emitToAgent(data.machine_id, SocketEvents.READ_FILE, {
        ...data,
        request_id: requestId,
      });
    } catch (error) {
      console.error('[Client] Read file error:', error);
      socket.emit(SocketEvents.ERROR, { message: '读取文件失败' });
    }
  });

  // 保存文件：转发到 Agent
  socket.on(SocketEvents.WRITE_FILE, async (data: WriteFileRequest) => {
    try {
      const machine = await prisma.machine.findFirst({
        where: { id: data.machine_id, user_id: userId },
      });
      if (!machine) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_NOT_FOUND });
        return;
      }
      if (!onlineMachines.get(data.machine_id)) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.MACHINE_OFFLINE });
        return;
      }
      const requestId = generateRequestId();
      pendingRequests.set(requestId, socket.id);
      emitToAgent(data.machine_id, SocketEvents.WRITE_FILE, {
        ...data,
        request_id: requestId,
      });
    } catch (error) {
      console.error('[Client] Write file error:', error);
      socket.emit(SocketEvents.ERROR, { message: '保存文件失败' });
    }
  });

  // 处理离开会话
  socket.on('leave-session', (sessionId: string) => {
    socket.leave(`session:${sessionId}`);

    const sessionInfo = sessions.get(sessionId);
    if (sessionInfo && sessionInfo.clientsCount > 0) {
      sessionInfo.clientsCount--;
    }

    console.log(`[Client] Left session: ${sessionId}`, {
      socketId: socket.id,
      rooms: Array.from(socket.rooms),
      clientsCount: sessionInfo?.clientsCount ?? null,
    });
  });

  // 处理断开连接
  socket.on('disconnect', (reason) => {
    console.log(`[Client] Disconnected: ${socket.id}, reason: ${reason}`);

    // 清理该客户端加入的所有会话
    const rooms = Array.from(socket.rooms);
    rooms.forEach(room => {
      if (room.startsWith('session:')) {
        const sessionId = room.substring(8);
        const sessionInfo = sessions.get(sessionId);
        if (sessionInfo && sessionInfo.clientsCount > 0) {
          sessionInfo.clientsCount--;
        }
      }
    });

    // 清理该 socket 的所有待处理请求
    for (const [reqId, sockId] of pendingRequests.entries()) {
      if (sockId === socket.id) {
        pendingRequests.delete(reqId);
      }
    }
  });

  // 错误处理
  socket.on('error', (error) => {
    console.error(`[Client] Socket error: ${socket.id}`, error);
  });
}

/**
 * 向指定会话的所有客户端广播事件
 */
export function broadcastToSession(
  sessionId: string,
  event: string,
  data: unknown
) {
  const sessionInfo = sessions.get(sessionId);
  if (sessionInfo) {
    // 使用io实例广播到session房间
    // 这个函数将在index.ts中通过io实例实现
  }
}

/**
 * 向指定机器的所有客户端广播事件
 */
export function broadcastToMachine(
  machineId: string,
  event: string,
  data: unknown
) {
  // 使用io实例广播到machine房间
  // 这个函数将在index.ts中通过io实例实现
}
