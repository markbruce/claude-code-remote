/**
 * Git 操作路由
 * 处理 git status、log、stage、unstage、commit 等 API
 */

import { Router, Response, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  GitStatus,
  GitCommit,
  GitStatusRequest,
  GitLogRequest,
  GitStageRequest,
  GitUnstageRequest,
  GitCommitRequest,
  SocketEvents,
  SocketNamespaces,
} from 'cc-remote-shared';
import { authMiddleware } from '../auth';
import { getIoInstance, gitResponseEmitter } from '../socket/store';
import { isMachineOnline, getOnlineMachineInfo } from '../socket/agent.socket';

const router: Router = Router();
const prisma = new PrismaClient();

// 请求超时配置
const REQUEST_TIMEOUT = 10000; // 10秒

/**
 * 发送 socket 请求并等待响应
 */
function sendGitRequest<T>(
  machineId: string,
  eventName: string,
  requestData: Record<string, unknown>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const io = getIoInstance();
    if (!io) {
      reject(new Error('Socket.io 实例未初始化'));
      return;
    }

    const requestId = randomUUID();
    const responseEvent = eventName + '-response';
    const timeout = setTimeout(() => {
      gitResponseEmitter.off(responseEvent, handler);
      reject(new Error('请求超时'));
    }, REQUEST_TIMEOUT);

    // 监听响应（使用 EventEmitter）
    const handler = (data: { request_id: string; error?: string; [key: string]: unknown }) => {
      if (data.request_id === requestId) {
        clearTimeout(timeout);
        gitResponseEmitter.off(responseEvent, handler);
        if (data.error) {
          reject(new Error(data.error));
        } else {
          resolve(data as T);
        }
      }
    };

    gitResponseEmitter.on(responseEvent, handler);

    // 发送请求到 agent
    const machineInfo = getOnlineMachineInfo(machineId);
    if (!machineInfo) {
      clearTimeout(timeout);
      gitResponseEmitter.off(responseEvent, handler);
      reject(new Error(ERROR_MESSAGES.MACHINE_OFFLINE));
      return;
    }

    io.of(SocketNamespaces.AGENT).to(machineInfo.socketId).emit(eventName, {
      ...requestData,
      request_id: requestId,
    });
  });
}

/**
 * 验证机器归属
 */
async function validateMachineOwnership(machineId: string, userId: string) {
  const machine = await prisma.machine.findFirst({
    where: {
      id: machineId,
      user_id: userId,
    },
  });
  return machine;
}

/**
 * GET /api/machines/:id/git/status
 * 获取 git 状态
 */
router.get('/:id/git/status', authMiddleware, async (req, res: Response) => {
  try {
    const userId = req.user!.id;
    const machineId = req.params.id;
    const projectPath = req.query.path as string;

    if (!projectPath) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: '缺少项目路径参数',
      });
      return;
    }

    // 验证机器归属
    const machine = await validateMachineOwnership(machineId, userId);
    if (!machine) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.MACHINE_NOT_FOUND,
      });
      return;
    }

    // 检查机器是否在线
    if (!isMachineOnline(machineId)) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.MACHINE_OFFLINE,
      });
      return;
    }

    // 发送请求并等待响应
    const response = await sendGitRequest<{ status: GitStatus; error?: string }>(
      machineId,
      SocketEvents.GIT_STATUS,
      {
        machine_id: machineId,
        project_path: projectPath,
      }
    );

    res.status(HTTP_STATUS.OK).json(response.status);
  } catch (error) {
    console.error('[Git] Status error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '获取 Git 状态失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * GET /api/machines/:id/git/log
 * 获取 git 提交历史
 */
router.get('/:id/git/log', authMiddleware, async (req, res: Response) => {
  try {
    const userId = req.user!.id;
    const machineId = req.params.id;
    const projectPath = req.query.path as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!projectPath) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: '缺少项目路径参数',
      });
      return;
    }

    // 验证机器归属
    const machine = await validateMachineOwnership(machineId, userId);
    if (!machine) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.MACHINE_NOT_FOUND,
      });
      return;
    }

    // 检查机器是否在线
    if (!isMachineOnline(machineId)) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.MACHINE_OFFLINE,
      });
      return;
    }

    // 发送请求并等待响应
    const response = await sendGitRequest<{ commits: GitCommit[]; error?: string }>(
      machineId,
      SocketEvents.GIT_LOG,
      {
        machine_id: machineId,
        project_path: projectPath,
        limit,
      }
    );

    res.status(HTTP_STATUS.OK).json(response.commits);
  } catch (error) {
    console.error('[Git] Log error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '获取 Git 日志失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * POST /api/machines/:id/git/stage
 * 暂存文件
 */
router.post('/:id/git/stage', authMiddleware, async (req, res: Response) => {
  try {
    const userId = req.user!.id;
    const machineId = req.params.id;
    const { path: projectPath, file } = req.body;

    if (!projectPath || !file) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: '缺少项目路径或文件参数',
      });
      return;
    }

    // 验证机器归属
    const machine = await validateMachineOwnership(machineId, userId);
    if (!machine) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.MACHINE_NOT_FOUND,
      });
      return;
    }

    // 检查机器是否在线
    if (!isMachineOnline(machineId)) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.MACHINE_OFFLINE,
      });
      return;
    }

    // 发送请求并等待响应
    await sendGitRequest<{ success: boolean; error?: string }>(
      machineId,
      SocketEvents.GIT_STAGE,
      {
        machine_id: machineId,
        project_path: projectPath,
        file,
      }
    );

    res.status(HTTP_STATUS.OK).json({ success: true });
  } catch (error) {
    console.error('[Git] Stage error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '暂存失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * POST /api/machines/:id/git/unstage
 * 取消暂存文件
 */
router.post('/:id/git/unstage', authMiddleware, async (req, res: Response) => {
  try {
    const userId = req.user!.id;
    const machineId = req.params.id;
    const { path: projectPath, file } = req.body;

    if (!projectPath || !file) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: '缺少项目路径或文件参数',
      });
      return;
    }

    // 验证机器归属
    const machine = await validateMachineOwnership(machineId, userId);
    if (!machine) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.MACHINE_NOT_FOUND,
      });
      return;
    }

    // 检查机器是否在线
    if (!isMachineOnline(machineId)) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.MACHINE_OFFLINE,
      });
      return;
    }

    // 发送请求并等待响应
    await sendGitRequest<{ success: boolean; error?: string }>(
      machineId,
      SocketEvents.GIT_UNSTAGE,
      {
        machine_id: machineId,
        project_path: projectPath,
        file,
      }
    );

    res.status(HTTP_STATUS.OK).json({ success: true });
  } catch (error) {
    console.error('[Git] Unstage error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '取消暂存失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * POST /api/machines/:id/git/commit
 * 提交更改
 */
router.post('/:id/git/commit', authMiddleware, async (req, res: Response) => {
  try {
    const userId = req.user!.id;
    const machineId = req.params.id;
    const { path: projectPath, message } = req.body;

    if (!projectPath || !message) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: '缺少项目路径或提交信息',
      });
      return;
    }

    // 验证机器归属
    const machine = await validateMachineOwnership(machineId, userId);
    if (!machine) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.MACHINE_NOT_FOUND,
      });
      return;
    }

    // 检查机器是否在线
    if (!isMachineOnline(machineId)) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.MACHINE_OFFLINE,
      });
      return;
    }

    // 发送请求并等待响应
    await sendGitRequest<{ success: boolean; error?: string }>(
      machineId,
      SocketEvents.GIT_COMMIT,
      {
        machine_id: machineId,
        project_path: projectPath,
        message,
      }
    );

    res.status(HTTP_STATUS.OK).json({ success: true });
  } catch (error) {
    console.error('[Git] Commit error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '提交失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
});

export default router;
