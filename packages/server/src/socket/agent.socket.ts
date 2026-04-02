/**
 * Agent Socket处理器
 * 处理Agent命名空间的连接和事件
 */

import { Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import {
  SocketEvents,
  SocketNamespaces,
  HEARTBEAT_INTERVAL,
  ONLINE_THRESHOLD,
  ScanProjectsRequest,
  StartSessionRequest,
  StartSessionResponse,
  SessionInfo,
  ProjectInfo,
  ChatMessageEvent,
  ChatPermissionRequestEvent,
  SESSION_BUFFER_SIZE,
  ReadFileRequest,
  WriteFileRequest,
  FileContentResponse,
  AgentConnectionState,
} from 'cc-remote-shared';
import { verifyMachineToken } from '../auth';
import { onlineMachines, sessions, sessionBuffers, chatBuffers, getIoInstance, gitResponseEmitter } from './store';
import { getSocketIdByRequestId, removePendingRequest } from './client.socket';

const prisma = new PrismaClient();

// Agent Socket认证接口
interface AgentAuthData {
  machineId: string;
  machineToken: string;
}

// 扩展Socket类型
interface AgentSocket extends Socket {
  data: {
    machineId: string;
    userId: string;
  };
}

/**
 * Agent认证中间件
 * 验证machine_token并获取机器信息
 */
export async function agentAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  try {
    const auth = socket.handshake.auth as AgentAuthData;
    const { machineId, machineToken } = auth;

    if (!machineId || !machineToken) {
      return next(new Error('缺少machineId或machineToken'));
    }

    // 查找机器
    const machine = await prisma.machine.findUnique({
      where: { id: machineId },
      include: { user: true }
    });

    if (!machine) {
      return next(new Error('机器不存在'));
    }

    // 验证机器令牌
    const isValid = await verifyMachineToken(machineToken, machine.machine_token_hash);
    if (!isValid) {
      return next(new Error('无效的机器令牌'));
    }

    // 将信息存储到socket.data
    socket.data = {
      machineId: machine.id,
      userId: machine.user_id
    };

    console.log(`[Agent] Authenticated: ${machine.name} (${machine.hostname})`);
    next();
  } catch (error) {
    console.error('[Agent] Auth error:', error);
    next(new Error('认证失败'));
  }
}

/**
 * 仅按 request_id 精确定向发送给发起请求的那条连接，不回退到用户房间，避免同账号多端（多标签/多设备）互相收到对方的响应
 * @returns true 仅当成功发到对应 request_id 的 socket
 */
function emitToRequester(
  event: string,
  data: Record<string, unknown>,
  _userId: string,
): boolean {
  const io = getIoInstance();
  if (!io) return false;

  const requestId = data.request_id as string | undefined;
  if (requestId) {
    const socketId = getSocketIdByRequestId(requestId);
    if (socketId) {
      io.of(SocketNamespaces.CLIENT).to(socketId).emit(event, data);
      removePendingRequest(requestId);
      return true;
    }
  }
  return false;
}

/**
 * 处理Agent连接
 */
export function handleAgentConnection(socket: AgentSocket) {
  const machineId = socket.data.machineId;
  const userId = socket.data.userId;

  console.log(`[Agent] Connected: ${socket.id} for machine ${machineId}`);

  // 加入machine房间
  socket.join(`machine:${machineId}`);

  // 更新在线状态
  onlineMachines.set(machineId, {
    machineId,
    lastSeen: new Date(),
    socketId: socket.id
  });

  // 广播 Agent 上线给所有客户端
  broadcastAgentStatus(machineId, 'online', 'connected');

  // 启动心跳机制
  const heartbeatInterval = setInterval(() => {
    socket.emit(SocketEvents.AGENT_PING, { timestamp: Date.now() });
  }, HEARTBEAT_INTERVAL);

  // 处理pong响应
  socket.on(SocketEvents.AGENT_PONG, () => {
    const info = onlineMachines.get(machineId);
    if (info) {
      info.lastSeen = new Date();
    }
  });

  // 处理项目列表响应
  socket.on(SocketEvents.PROJECTS_LIST, async (data: { machine_id: string; projects: ProjectInfo[]; request_id?: string }) => {
    const projects = data.projects || [];
    console.log(`[Agent] Projects list received: ${projects.length} projects`);

    // 更新或创建项目记录
    for (const project of projects) {
      await prisma.project.upsert({
        where: {
          machine_id_path: {
            machine_id: machineId,
            path: project.path
          }
        },
        create: {
          machine_id: machineId,
          path: project.path,
          name: project.name,
          last_accessed: project.last_accessed
        },
        update: {
          name: project.name,
          last_accessed: project.last_accessed,
          last_scanned: new Date()
        }
      });
    }

    emitToRequester(SocketEvents.PROJECTS_LIST, {
      machineId,
      projects,
      request_id: data.request_id,
    }, userId);
  });

  // 处理会话启动响应（Agent 新会话用 session_id/project_path，join 历史会话可能用 sessionId/projectPath，统一归一化）
  socket.on(SocketEvents.SESSION_STARTED, async (data: StartSessionResponse & { request_id?: string; isHistory?: boolean; sessionId?: string; projectPath?: string }) => {
    const session_id = data.session_id ?? data.sessionId;
    const project_path = data.project_path ?? data.projectPath;
    const isHistory = data.isHistory === true;

    if (!session_id) {
      console.warn('[Agent] SESSION_STARTED missing session id');
      return;
    }

    console.log(`[Agent] Session started: ${session_id}${isHistory ? ' (history)' : ''}`);

    // 仅新会话写入 SessionLog；历史会话 join 时库中已有记录，避免 P2002 唯一约束
    if (!isHistory) {
      await prisma.sessionLog.create({
        data: {
          id: session_id,
          machine_id: machineId,
          started_at: new Date()
        }
      });
    }

    // 查找对应的项目
    const project = project_path
      ? await prisma.project.findFirst({
          where: {
            machine_id: machineId,
            path: project_path
          }
        })
      : null;

    const mode = (data as StartSessionResponse & { mode?: string }).mode === 'chat' ? 'chat' as const : 'shell' as const;

    // 存储会话信息
    sessions.set(session_id, {
      sessionId: session_id,
      machineId,
      projectId: project?.id,
      projectPath: project_path ?? undefined,
      startedAt: new Date(),
      clientsCount: 0,
      mode,
    });

    // 初始化缓冲区（历史会话 join 时也需有 buffer 占位，否则后续 OUTPUT 会丢）
    if (mode === 'chat') {
      if (!chatBuffers.has(session_id)) chatBuffers.set(session_id, []);
    } else {
      if (!sessionBuffers.has(session_id)) sessionBuffers.set(session_id, []);
    }

    // 在发送 SESSION_STARTED 前先加入房间，避免前端收到后再次 JOIN_SESSION 触发重复 SESSION_STARTED
    const requesterSocketId = data.request_id ? getSocketIdByRequestId(data.request_id) : undefined;
    if (requesterSocketId) {
      const io = getIoInstance();
      const clientSocket = io?.of(SocketNamespaces.CLIENT).sockets.get(requesterSocketId);
      const room = `session:${session_id}`;
      if (clientSocket && !clientSocket.rooms.has(room)) {
        clientSocket.join(room);
        const stored = sessions.get(session_id);
        if (stored) stored.clientsCount++;
        console.log(`[Agent] Pre-join client ${requesterSocketId} to room ${room} (history resolve)`);
      }
    }

    emitToRequester(SocketEvents.SESSION_STARTED, {
      sessionId: session_id,
      projectPath: project_path ?? '',
      machineId,
      mode,
      request_id: data.request_id,
      isHistory,
    }, userId);
  });

  // Agent 返回错误且带 request_id 时，精确定向转发给发起请求的客户端（如 JOIN_SESSION 历史会话不存在）
  socket.on(SocketEvents.ERROR, (data: { message?: string; request_id?: string }) => {
    if (data.request_id) {
      emitToRequester(SocketEvents.ERROR, data as Record<string, unknown>, userId);
    }
  });

  // 处理会话输出
  socket.on(SocketEvents.SESSION_OUTPUT, (data) => {
    const sessionInfo = sessions.get(data.session_id);
    if (sessionInfo) {
      // 添加到缓冲区
      const buffer = sessionBuffers.get(data.session_id);
      if (buffer) {
        buffer.push(data);
        // 限制缓冲区大小
        if (buffer.length > 200) {
          buffer.shift();
        }
      }
    }

    // 转发给 Client 命名空间的 session 房间
    const io = getIoInstance();
    if (io) {
      io.of(SocketNamespaces.CLIENT).to(`session:${data.session_id}`).emit(SocketEvents.SESSION_OUTPUT, data);
    }
  });

  // 处理会话结束
  socket.on(SocketEvents.SESSION_END, async (data) => {
    console.log(`[Agent] Session ended: ${data.session_id}`);

    // 更新会话记录
    await prisma.sessionLog.update({
      where: { id: data.session_id },
      data: {
        ended_at: data.ended_at,
        duration_seconds: data.ended_at
          ? Math.floor((new Date(data.ended_at).getTime() - (sessions.get(data.session_id)?.startedAt?.getTime() || 0)) / 1000)
          : null
      }
    }).catch(console.error);

    // 转发给 Client 命名空间的 session 房间
    const io = getIoInstance();
    if (io) {
      io.of(SocketNamespaces.CLIENT).to(`session:${data.session_id}`).emit(SocketEvents.SESSION_END, data);
    }

    // 清理会话
    sessions.delete(data.session_id);
    sessionBuffers.delete(data.session_id);
    chatBuffers.delete(data.session_id);
  });

  // Chat 模式：转发消息（Agent -> Client）
  socket.on(SocketEvents.CHAT_MESSAGE, (data: ChatMessageEvent) => {
    const sessionInfo = sessions.get(data.session_id);
    if (sessionInfo) {
      const buffer = chatBuffers.get(data.session_id);
      if (buffer) {
        buffer.push(data);
        if (buffer.length > SESSION_BUFFER_SIZE) {
          buffer.shift();
        }
      }
    }

    const io = getIoInstance();
    if (io) {
      io.of(SocketNamespaces.CLIENT).to(`session:${data.session_id}`).emit(SocketEvents.CHAT_MESSAGE, data);
    }
  });

  // Chat 模式：转发权限请求（Agent -> Client）
  socket.on(SocketEvents.CHAT_PERMISSION_REQUEST, (data: ChatPermissionRequestEvent) => {
    const io = getIoInstance();
    if (io) {
      io.of(SocketNamespaces.CLIENT).to(`session:${data.session_id}`).emit(SocketEvents.CHAT_PERMISSION_REQUEST, data);
    }
  });

  // 会话历史列表响应：转发给 Client
  socket.on(SocketEvents.SESSIONS_LIST, (data: { machine_id: string; project_path: string; sessions: unknown[]; request_id?: string }) => {
    emitToRequester(SocketEvents.SESSIONS_LIST, data as Record<string, unknown>, userId);
  });

  // 会话历史消息响应：精确定向发送给请求者
  socket.on(SocketEvents.SESSION_MESSAGES, (data: { machine_id: string; sdk_session_id: string; messages: unknown[]; request_id?: string; total?: number; hasMore?: boolean; offset?: number; limit?: number }) => {
    emitToRequester(SocketEvents.SESSION_MESSAGES, data as Record<string, unknown>, userId);
  });

  // 文件列表响应：转发给 Client
  socket.on(SocketEvents.FILES_LIST, (data: { machine_id: string; project_path: string; files: unknown[]; request_id?: string }) => {
    emitToRequester(SocketEvents.FILES_LIST, data as Record<string, unknown>, userId);
  });

  // 斜杠命令列表响应：转发给 Client
  socket.on(SocketEvents.COMMANDS_LIST, (data: { machine_id: string; project_path: string; commands: unknown[]; request_id?: string }) => {
    emitToRequester(SocketEvents.COMMANDS_LIST, data as Record<string, unknown>, userId);
  });

  // 文件内容响应：转发给 Client
  socket.on(SocketEvents.FILE_CONTENT, (data: FileContentResponse & { machine_id: string; project_path: string; request_id?: string }) => {
    emitToRequester(SocketEvents.FILE_CONTENT, data as unknown as Record<string, unknown>, userId);
  });

  // 文件保存响应：转发给 Client
  socket.on(SocketEvents.FILE_SAVED, (data: { machine_id: string; project_path: string; path: string; success: boolean; error?: string; request_id?: string }) => {
    emitToRequester(SocketEvents.FILE_SAVED, data as Record<string, unknown>, userId);
  });

  // 路径验证响应：转发给 Client
  socket.on(SocketEvents.PATH_VALIDATED, (data: { request_id?: string; valid: boolean; exists: boolean; isDirectory: boolean; path?: string; error?: string }) => {
    emitToRequester(SocketEvents.PATH_VALIDATED, data as Record<string, unknown>, userId);
  });

  // 处理发送缓冲区请求
  socket.on(SocketEvents.SEND_BUFFER, (data: { session_id: string }) => {
    const buffer = sessionBuffers.get(data.session_id);
    if (buffer && buffer.length > 0) {
      socket.emit(SocketEvents.SESSION_BUFFER, {
        session_id: data.session_id,
        lines: buffer
      });
    }
  });

  // Git 响应事件：转发给等待的请求
  socket.on(SocketEvents.GIT_STATUS_RESPONSE, (data) => {
    gitResponseEmitter.emit('git:status-response', data);
  });

  socket.on(SocketEvents.GIT_LOG_RESPONSE, (data) => {
    gitResponseEmitter.emit('git:log-response', data);
  });

  socket.on(SocketEvents.GIT_STAGE_RESPONSE, (data) => {
    gitResponseEmitter.emit('git:stage-response', data);
  });

  socket.on(SocketEvents.GIT_UNSTAGE_RESPONSE, (data) => {
    gitResponseEmitter.emit('git:unstage-response', data);
  });

  socket.on(SocketEvents.GIT_COMMIT_RESPONSE, (data) => {
    gitResponseEmitter.emit('git:commit-response', data);
  });

  // 处理断开连接
  socket.on('disconnect', (reason) => {
    console.log(`[Agent] Disconnected: ${socket.id}, reason: ${reason}`);

    // 清理心跳
    clearInterval(heartbeatInterval);

    // 移除在线状态
    onlineMachines.delete(machineId);

    // 离开房间
    socket.leave(`machine:${machineId}`);

    // 广播 Agent 下线给所有客户端
    broadcastAgentStatus(machineId, 'offline', 'disconnected', reason);
  });

  // 错误处理
  socket.on('error', (error) => {
    console.error(`[Agent] Socket error: ${socket.id}`, error);
  });
}

/**
 * 检查机器是否在线
 */
export function isMachineOnline(machineId: string): boolean {
  const info = onlineMachines.get(machineId);
  if (!info) return false;

  const now = Date.now();
  const lastSeen = info.lastSeen.getTime();
  return (now - lastSeen) < ONLINE_THRESHOLD;
}

/**
 * 获取在线机器信息
 */
export function getOnlineMachineInfo(machineId: string) {
  return onlineMachines.get(machineId);
}

/**
 * 获取所有在线机器ID
 */
export function getOnlineMachineIds(): string[] {
  return Array.from(onlineMachines.keys());
}

/**
 * 广播 Agent 状态变更给所有客户端
 */
function broadcastAgentStatus(
  machineId: string,
  status: 'online' | 'offline',
  connectionState: AgentConnectionState,
  reason?: string
) {
  const io = getIoInstance();
  if (!io) return;

  io.of(SocketNamespaces.CLIENT).emit(SocketEvents.AGENT_STATUS_CHANGED, {
    machineId,
    status,
    connectionState,
    reason,
    timestamp: Date.now(),
  });
}
