/**
 * Client Socket处理器
 * 处理Client命名空间的连接和事件
 */

import { Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import {
  SocketEvents,
  SocketNamespaces,
  SESSION_BUFFER_SIZE,
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
  JoinSharedSessionRequest,
  SharedSessionViewersEvent,
  Role,
  ApprovalMode,
  InviteCreateEvent,
  ParticipantsListEvent,
  ParticipantInfo,
  ApprovalModeSetEvent,
} from 'cc-remote-shared';
import { verifyToken, JwtPayload } from '../auth';
import {
  onlineMachines,
  sessions,
  sessionBuffers,
  chatBuffers,
  getMachineSessions,
  getIoInstance,
  onlineParticipants,
} from './store';
import { isMachineOnline } from './agent.socket';
import { validateInvite, resolveDisplayName, canSend, canApprove } from '../session/policy';
import { decideJoin } from '../session/join';

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
  token?: string;
  shareToken?: string;
}

// 扩展Socket类型
interface ClientSocket extends Socket {
  data: {
    userId?: string;
    email?: string;
    username?: string | null;
    jwtPayload?: JwtPayload;
    isViewer?: boolean;
    shareToken?: string;
    role?: 'owner' | 'collaborator' | 'viewer';
    sessionId?: string;
    displayName?: string;
    viewerSessionId?: string;
  };
}

/**
 * Client认证中间件
 * 验证JWT令牌；若提供 shareToken 则标记为 viewer（匿名访客）
 */
export async function clientAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  try {
    const auth = socket.handshake.auth as ClientAuthData;
    const { token, shareToken } = auth;

    // 访客模式：通过 shareToken 加入（Phase 2：校验 DB invite）
    if (!token && shareToken) {
      const invite = await prisma.sessionInvite.findUnique({ where: { token: shareToken } });
      if (!invite) {
        return next(new Error('无效的分享链接'));
      }
      socket.data = { isViewer: true, shareToken };
      console.log(`[Client] Viewer connected via shareToken`);
      return next();
    }

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
  const isViewer = socket.data.isViewer;

  // Viewer 模式：不需要发送机器列表等
  if (isViewer) {
    console.log(`[Client] Viewer connected: ${socket.id}`);
    return;
  }

  if (!userId) {
    socket.disconnect(true);
    return;
  }

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
    if (socket.data.isViewer) {
      socket.emit(SocketEvents.ERROR, { message: '访客无法发送输入' });
      return;
    }
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
    if (socket.data.isViewer) {
      socket.emit(SocketEvents.ERROR, { message: '访客无法审批权限' });
      return;
    }
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
    const online = onlineParticipants.get(socket.id);
    const role: Role = online?.role ?? 'viewer';
    if (!canSend(role)) return;
    const sessionInfo = sessions.get(data.session_id);
    if (!sessionInfo) return;
    const enriched = {
      ...data,
      sender_id: online?.userId,
      sender_name: online?.displayName ?? resolveDisplayName({ username: socket.data.username ?? null, email: socket.data.email ?? '' }),
    };
    emitToAgent(sessionInfo.machineId, SocketEvents.CHAT_SEND, enriched);

    // Broadcast the user's message to the room with attribution. The agent does
    // not echo user turns, so the server is the source of truth for display.
    // Buffer it so collaborators/viewers joining later see it on replay.
    const userMessage = {
      session_id: data.session_id,
      type: 'user' as const,
      content: data.content,
      timestamp: new Date(),
      sender_id: online?.userId,
      sender_name: online?.displayName ?? resolveDisplayName({ username: socket.data.username ?? null, email: socket.data.email ?? '' }),
    };
    const room = `session:${data.session_id}`;
    const buffer = chatBuffers.get(data.session_id);
    if (buffer) {
      buffer.push(userMessage);
      if (buffer.length > SESSION_BUFFER_SIZE) buffer.shift();
    }
    getIoInstance()?.of(SocketNamespaces.CLIENT).to(room).emit(SocketEvents.CHAT_MESSAGE, userMessage);
  });

  // Chat 模式：转发权限审批回答（Client -> Agent），first-approval-wins + 通知其他接收者清空 banner
  socket.on(SocketEvents.CHAT_PERMISSION_ANSWER, (data: ChatPermissionAnswerEvent) => {
    const online = onlineParticipants.get(socket.id);
    const role: Role = online?.role ?? 'viewer';
    const sessionInfo = sessions.get(data.session_id);
    const mode: ApprovalMode = sessionInfo?.approvalMode ?? 'owner';
    if (!canApprove(role, mode)) return;
    if (!sessionInfo?.pendingPermissions?.tryResolve(data.requestId)) return; // 别人已先审批

    // 转发胜出的回答给 Agent
    emitToAgent(sessionInfo.machineId, SocketEvents.CHAT_PERMISSION_ANSWER, data);

    // 通知其他收到该请求的客户端清空权限 banner
    const io = getIoInstance();
    if (io) {
      io.of(SocketNamespaces.CLIENT)
        .to(`session:${data.session_id}`)
        .except(socket.id)
        .emit(SocketEvents.CHAT_PERMISSION_RESOLVED, { request_id: data.requestId, approved: data.approved });
    }
  });

  // Chat 模式：转发中断请求（Client -> Agent）
  socket.on(SocketEvents.CHAT_ABORT, (data: { session_id: string }) => {
    if (socket.data.isViewer) {
      socket.emit(SocketEvents.ERROR, { message: '访客无法中断会话' });
      return;
    }
    const sessionInfo = sessions.get(data.session_id);
    if (!sessionInfo) {
      socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.SESSION_NOT_FOUND });
      return;
    }
    emitToAgent(sessionInfo.machineId, SocketEvents.CHAT_ABORT, data);
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

  // ==================== 会话分享事件 ====================

  // Owner 发起分享（Phase 2：创建 DB viewer 邀请，返回 token）
  socket.on(SocketEvents.SHARE_SESSION, async (data: { session_id: string }) => {
    const requesterRole = onlineParticipants.get(socket.id)?.role;
    if (requesterRole !== 'owner') {
      // 不再静默失败——记录为何拒绝，便于排查 owner overlay 未设置的路径（见 #27 Bug 1）
      console.warn(`[Client] SHARE_SESSION rejected: socket ${socket.id} role=${requesterRole ?? 'none'} (expected owner) for session ${data.session_id}`);
      return;
    }
    const sessionId = data.session_id;

    try {
      // Check if SessionLog exists (may be missing for history sessions restored from agent)
      let sessionLog = await prisma.sessionLog.findUnique({ where: { id: sessionId } });
      if (!sessionLog) {
        // Get session info from memory to create SessionLog
        const sessionInfo = sessions.get(sessionId);
        if (sessionInfo) {
          sessionLog = await prisma.sessionLog.create({
            data: {
              id: sessionId,
              machine_id: sessionInfo.machineId,
              started_at: new Date(),
            },
          });
          console.log(`[Client] SHARE_SESSION: created missing SessionLog for session ${sessionId}`);
        }
      }

      if (!sessionLog) {
        console.warn(`[Client] SHARE_SESSION: session ${sessionId} not found in DB or memory`);
        return;
      }

      const invite = await prisma.sessionInvite.create({
        data: {
          session_id: sessionId,
          token: crypto.randomUUID(),
          role: 'viewer',
          created_by: socket.data.userId!,
        },
      });
      socket.emit(SocketEvents.SHARE_SESSION, {
        session_id: sessionId,
        shareToken: invite.token,
      });
      console.log(`[Client] Share enabled (DB invite) for session ${sessionId}`);
    } catch (error) {
      console.error(`[Client] SHARE_SESSION error for session ${sessionId}:`, error);
    }
  });

  // Owner 停止分享（删除 viewer 邀请并踢出在线 viewer）
  socket.on(SocketEvents.STOP_SHARE, async (data: { session_id: string }) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    await prisma.sessionInvite.deleteMany({ where: { session_id: data.session_id, role: 'viewer' } }).catch(() => {});
    const io = getIoInstance();
    if (io) {
      for (const [sid, o] of onlineParticipants) {
        if (o.role === 'viewer') {
          const s = io.of(SocketNamespaces.CLIENT).sockets.get(sid);
          if (s) {
            onlineParticipants.delete(sid);
            s.emit(SocketEvents.STOP_SHARE, { session_id: data.session_id });
            s.disconnect(true);
          }
        }
      }
    }
    socket.emit(SocketEvents.STOP_SHARE, { session_id: data.session_id });
    socket.emit(SocketEvents.SHARED_SESSION_VIEWERS, { sessionId: data.session_id, viewersCount: 0 });
    console.log(`[Client] Session sharing stopped: ${data.session_id}`);
  });

  // ==================== Phase 2：邀请 / 参与者 / 审批模式管理（owner-only） ====================

  // 创建协作邀请
  socket.on(SocketEvents.INVITE_CREATE, async (data: InviteCreateEvent) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    const token = crypto.randomUUID();
    const invite = await prisma.sessionInvite.create({
      data: {
        session_id: data.session_id,
        token,
        role: data.role,
        created_by: socket.data.userId!,
        expires_at: data.expiresAt ? new Date(data.expiresAt) : null,
        max_uses: data.maxUses ?? null,
      },
    });
    socket.emit(SocketEvents.INVITE_CREATED, {
      session_id: data.session_id,
      token: invite.token,
      role: invite.role,
      link: `${process.env.PUBLIC_URL ?? ''}/shared/${invite.token}`,
    });
  });

  // 撤销邀请
  socket.on(SocketEvents.INVITE_REVOKE, async (data: { session_id: string; token: string }) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    await prisma.sessionInvite.delete({ where: { token: data.token } }).catch(() => {});
  });

  // 列出参与者
  socket.on(SocketEvents.PARTICIPANTS_LIST, async (data: ParticipantsListEvent) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    const rows = await prisma.sessionParticipant.findMany({
      where: { session_id: data.session_id },
      include: { user: true },
    });
    const onlineValues = [...onlineParticipants.values()];
    const participants: ParticipantInfo[] = rows.map((r) => ({
      userId: r.user_id,
      displayName: resolveDisplayName({ username: r.user.username, email: r.user.email }),
      role: r.role as Role,
      online: onlineValues.some((o) => o.userId === r.user_id),
    }));
    const viewerCount = onlineValues.filter((o) => o.role === 'viewer').length;
    socket.emit(SocketEvents.PARTICIPANTS, { session_id: data.session_id, participants, viewerCount });
  });

  // 移除参与者（删除记录 + 踢出在线 socket + 广播）
  socket.on(SocketEvents.PARTICIPANT_REMOVED, async (data: { session_id: string; userId: string }) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    await prisma.sessionParticipant.deleteMany({ where: { session_id: data.session_id, user_id: data.userId } });
    const io = getIoInstance();
    if (io) {
      for (const [sid, o] of onlineParticipants) {
        if (o.userId === data.userId) {
          const s = io.of(SocketNamespaces.CLIENT).sockets.get(sid);
          if (s) {
            onlineParticipants.delete(sid);
            s.disconnect(true);
          }
        }
      }
      io.of(SocketNamespaces.CLIENT)
        .to(`session:${data.session_id}`)
        .emit(SocketEvents.PARTICIPANT_REMOVED, { userId: data.userId });
    }
  });

  // 设置审批模式
  socket.on(SocketEvents.APPROVAL_MODE_SET, async (data: ApprovalModeSetEvent) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    await prisma.sessionLog.update({ where: { id: data.session_id }, data: { approval_mode: data.mode } }).catch(() => {});
    const sessionInfo = sessions.get(data.session_id);
    if (sessionInfo) sessionInfo.approvalMode = data.mode;
    getIoInstance()
      ?.of(SocketNamespaces.CLIENT)
      .to(`session:${data.session_id}`)
      .emit(SocketEvents.APPROVAL_MODE_CHANGED, data);
  });

  // 访客/协作者通过 invite token 加入
  socket.on(SocketEvents.JOIN_SHARED_SESSION, async (data: JoinSharedSessionRequest) => {
    try {
      const invite = await prisma.sessionInvite.findUnique({ where: { token: data.shareToken } });
      if (!invite) {
        socket.emit(SocketEvents.ERROR, { message: '邀请链接无效' });
        return;
      }

      const status = validateInvite(
        { role: invite.role, expiresAt: invite.expires_at, maxUses: invite.max_uses, usedCount: invite.used_count },
        new Date(),
      );
      if (status !== 'ok') {
        socket.emit(SocketEvents.ERROR, { message: status === 'expired' ? '邀请链接已过期' : '邀请名额已满' });
        return;
      }

      const decision = decideJoin({ inviteRole: invite.role as 'viewer' | 'collaborator', hasJwt: !!socket.data.userId });
      if (!decision) {
        socket.emit(SocketEvents.ERROR, { message: '该协作邀请需要先登录' });
        return;
      }

      // 单次邀请原子核销（collaborator 且 maxUses 有限）
      if (decision.requiresParticipantRow && invite.max_uses !== null) {
        const r = await prisma.sessionInvite.updateMany({
          where: { id: invite.id, used_count: { lt: invite.max_uses } },
          data: { used_count: { increment: 1 } },
        });
        if (r.count === 0) {
          socket.emit(SocketEvents.ERROR, { message: '邀请名额已满' });
          return;
        }
      }

      const sessionId = invite.session_id;
      const sessionInfo = sessions.get(sessionId);
      if (!sessionInfo) {
        socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.SESSION_NOT_FOUND });
        return;
      }

      // 协作者 upsert SessionParticipant 行
      let displayName: string | undefined;
      if (decision.requiresParticipantRow) {
        await prisma.sessionParticipant.upsert({
          where: { session_id_user_id: { session_id: sessionId, user_id: socket.data.userId! } },
          create: { session_id: sessionId, user_id: socket.data.userId!, role: 'collaborator', invited_by: invite.created_by },
          update: { role: 'collaborator' },
        });
        const user = await prisma.user.findUnique({ where: { id: socket.data.userId! } });
        displayName = user ? resolveDisplayName({ username: user.username, email: user.email }) : undefined;
      }

      // 设置 socket.data
      socket.data.role = decision.role;
      socket.data.sessionId = sessionId;
      if (decision.requiresParticipantRow) {
        socket.data.displayName = displayName;
      } else {
        // viewer 维持 Phase 1 isViewer 标记，便于既有访客流判断
        socket.data.isViewer = true;
        socket.data.viewerSessionId = sessionId;
      }
      onlineParticipants.set(socket.id, {
        role: decision.role,
        userId: decision.requiresParticipantRow ? socket.data.userId : undefined,
        displayName,
      });

      const room = `session:${sessionId}`;
      socket.join(room);
      sessionInfo.clientsCount++;

      // 回放 chatBuffer 给访客/协作者
      const buffer = chatBuffers.get(sessionId);
      // [诊断 #27 Bug 2] join 时该会话的缓冲消息数；为 0 说明 owner 还没发过消息或缓冲未填充
      console.log(`[Client] Shared join ${sessionId}: chatBuffer has ${buffer?.length ?? 0} msgs to replay`);
      
      // [诊断 #27 Bug 2] 记录房间成员
      const debugIo = getIoInstance();
      if (debugIo) {
        const clientNs = debugIo.of(SocketNamespaces.CLIENT);
        const roomMembers = clientNs.adapter.rooms.get(room);
        console.log(`[Client] Room ${room} members: ${roomMembers?.size ?? 0} sockets`, roomMembers ? Array.from(roomMembers) : []);
      }
      
      if (buffer && buffer.length > 0) {
        for (const msg of buffer) {
          socket.emit(SocketEvents.CHAT_MESSAGE, msg);
        }
      }

      // 广播观众数量给 room 内所有人（使用 onlineParticipants Map，与 disconnect 事件保持一致）
      const io = getIoInstance();
      const viewersCount = [...onlineParticipants.values()].filter(
        (o) => o.role === 'viewer',
      ).length;
      io?.to(room).emit(SocketEvents.SHARED_SESSION_VIEWERS, {
        sessionId,
        viewersCount,
      } as SharedSessionViewersEvent);

      socket.emit(SocketEvents.SESSION_STARTED, {
        sessionId,
        projectPath: sessionInfo.projectPath ?? '',
        machineId: sessionInfo.machineId,
        mode: sessionInfo.mode,
        isHistory: true,
        fromExistingSession: true,
        role: decision.role,
      });

      console.log(`[Client] Joined shared session: ${sessionId} (role: ${decision.role}, viewers: ${viewersCount})`);
    } catch (error) {
      console.error('[Client] Join shared session error:', error);
      socket.emit(SocketEvents.ERROR, { message: '加入共享会话失败' });
    }
  });

  // ==================== 会话历史 ====================

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

        // 如果是 viewer 断开，广播更新后的观众数（基于 onlineParticipants 覆盖层）
        const disconnectingEntry = onlineParticipants.get(socket.id);
        if (disconnectingEntry?.role === 'viewer') {
          onlineParticipants.delete(socket.id);
          const io = getIoInstance();
          if (io) {
            const viewersCount = [...onlineParticipants.values()].filter(
              (o) => o.role === 'viewer',
            ).length;
            io.to(room).emit(SocketEvents.SHARED_SESSION_VIEWERS, {
              sessionId,
              viewersCount,
            } as SharedSessionViewersEvent);
          }
        } else if (disconnectingEntry) {
          onlineParticipants.delete(socket.id);
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
