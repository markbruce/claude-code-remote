/**
 * 机器管理路由
 * 包含机器绑定和查询API
 */

import { Router, Response, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  BindMachineRequest,
  BindMachineResponse,
  Machine
} from 'cc-remote-shared';
import { authMiddleware } from '../auth';
import { hashMachineToken, generateMachineToken } from '../auth';

const router: Router = Router();
const prisma = new PrismaClient();

// 请求验证schema
const bindMachineSchema = z.object({
  name: z.string().min(1, '机器名称不能为空').max(50, '机器名称最多50个字符'),
  hostname: z.string().min(1, '主机名不能为空').max(100, '主机名最多100个字符'),
  machine_token: z.string().optional(), // 可选，如果不提供则自动生成
  force: z.boolean().optional(), // 强制重新绑定，覆盖同名主机
});

/**
 * 格式化机器响应
 */
function formatMachineResponse(machine: {
  id: string;
  user_id: string;
  name: string;
  hostname: string;
  last_seen: Date | null;
  created_at: Date;
}): Machine {
  return {
    id: machine.id,
    user_id: machine.user_id,
    name: machine.name,
    hostname: machine.hostname,
    last_seen: machine.last_seen,
    created_at: machine.created_at
  };
}

/**
 * POST /api/machines/bind
 * 绑定新机器
 * 需要JWT认证
 */
router.post('/bind', authMiddleware, async (req, res: Response) => {
  try {
    // 验证请求体
    const validationResult = bindMachineSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.INVALID_INPUT,
        details: validationResult.error.errors
      });
      return;
    }

    const { name, hostname, force } = validationResult.data as BindMachineRequest & { force?: boolean };
    const userId = req.user!.id;

    console.log(`[Machines] Bind request: name=${name}, hostname=${hostname}, force=${force}, userId=${userId}`);

    // 检查是否已有相同hostname的机器
    const existingMachine = await prisma.machine.findFirst({
      where: {
        user_id: userId,
        hostname
      }
    });

    console.log(`[Machines] Existing machine:`, existingMachine ? existingMachine.name : 'none');

    if (existingMachine) {
      // 如果 force=true，删除旧记录后重新绑定
      if (force) {
        console.log(`[Machines] Force rebind: deleting machine ${existingMachine.id}`);
        await prisma.machine.delete({
          where: { id: existingMachine.id }
        });
        console.log(`[Machines] Force rebind: deleted old machine ${existingMachine.name} (${hostname})`);
      } else {
        console.log(`[Machines] Rejecting bind: hostname already bound, force=${force}`);
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: '绑定失败',
          message: '该主机名已被绑定'
        });
        return;
      }
    }

    // 生成机器令牌
    const machineToken = generateMachineToken();
    const machineTokenHash = await hashMachineToken(machineToken);

    // 创建机器记录
    const machine = await prisma.machine.create({
      data: {
        user_id: userId,
        name,
        hostname,
        machine_token_hash: machineTokenHash
      }
    });

    console.log(`[Machines] Machine bound: ${name} (${hostname}) for user ${userId}`);

    const response: BindMachineResponse = {
      machine_id: machine.id,
      machine_token: machineToken // 只在绑定时返回一次明文token
    };

    res.status(HTTP_STATUS.CREATED).json(response);
  } catch (error) {
    console.error('[Machines] Bind error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '绑定失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * GET /api/machines
 * 获取当前用户的所有机器
 */
router.get('/', authMiddleware, async (req, res: Response) => {
  try {
    const userId = req.user!.id;

    const machines = await prisma.machine.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });

    res.status(HTTP_STATUS.OK).json(
      machines.map(formatMachineResponse)
    );
  } catch (error) {
    console.error('[Machines] List error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '获取机器列表失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * GET /api/machines/:id
 * 获取单个机器详情
 */
router.get('/:id', authMiddleware, async (req, res: Response) => {
  try {
    const userId = req.user!.id;
    const machineId = req.params.id;

    const machine = await prisma.machine.findFirst({
      where: {
        id: machineId,
        user_id: userId
      }
    });

    if (!machine) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.MACHINE_NOT_FOUND
      });
      return;
    }

    res.status(HTTP_STATUS.OK).json(formatMachineResponse(machine));
  } catch (error) {
    console.error('[Machines] Get error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '获取机器信息失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * DELETE /api/machines/:id
 * 解绑机器
 */
router.delete('/:id', authMiddleware, async (req, res: Response) => {
  try {
    const userId = req.user!.id;
    const machineId = req.params.id;

    // 检查机器是否存在且属于当前用户
    const machine = await prisma.machine.findFirst({
      where: {
        id: machineId,
        user_id: userId
      }
    });

    if (!machine) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.MACHINE_NOT_FOUND
      });
      return;
    }

    // 删除机器（会级联删除相关项目和会话记录）
    await prisma.machine.delete({
      where: { id: machineId }
    });

    console.log(`[Machines] Machine unbound: ${machine.name} (${machine.hostname})`);

    res.status(HTTP_STATUS.OK).json({
      message: '机器已解绑'
    });
  } catch (error) {
    console.error('[Machines] Delete error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '解绑失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * POST /api/machines/:id/regenerate-token
 * 重新生成机器令牌
 */
router.post('/:id/regenerate-token', authMiddleware, async (req, res: Response) => {
  try {
    const userId = req.user!.id;
    const machineId = req.params.id;

    // 检查机器是否存在且属于当前用户
    const machine = await prisma.machine.findFirst({
      where: {
        id: machineId,
        user_id: userId
      }
    });

    if (!machine) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_MESSAGES.MACHINE_NOT_FOUND
      });
      return;
    }

    // 生成新令牌
    const newToken = generateMachineToken();
    const newTokenHash = await hashMachineToken(newToken);

    // 更新机器记录
    await prisma.machine.update({
      where: { id: machineId },
      data: { machine_token_hash: newTokenHash }
    });

    console.log(`[Machines] Token regenerated for: ${machine.name}`);

    const response: BindMachineResponse = {
      machine_id: machineId,
      machine_token: newToken
    };

    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    console.error('[Machines] Regenerate token error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '重新生成令牌失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * GET /api/machines/projects/search?q=xxx
 * 全局搜索工程（跨机器）
 */
router.get('/projects/search', authMiddleware, async (req, res: Response) => {
  try {
    const userId = req.user!.id;
    const query = (req.query.q as string || '').trim();

    if (!query) {
      res.status(HTTP_STATUS.OK).json([]);
      return;
    }

    // 搜索工程名或路径包含查询词的工程
    const projects = await prisma.project.findMany({
      where: {
        machine: { user_id: userId },
        OR: [
          { name: { contains: query } },
          { path: { contains: query } }
        ]
      },
      include: {
        machine: {
          select: { id: true, name: true, hostname: true }
        }
      },
      orderBy: { last_accessed: 'desc' },
      take: 20
    });

    const results = projects.map(p => ({
      id: p.id,
      machineId: p.machine.id,
      machineName: p.machine.name,
      machineHostname: p.machine.hostname,
      name: p.name,
      path: p.path,
      lastAccessed: p.last_accessed
    }));

    res.status(HTTP_STATUS.OK).json(results);
  } catch (error) {
    console.error('[Machines] Project search error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '搜索失败',
      message: '服务器内部错误'
    });
  }
});

export default router;
