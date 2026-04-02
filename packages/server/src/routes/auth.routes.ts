/**
 * 认证路由
 * 包含注册和登录API
 */

import { Router, Response, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  RegisterRequest,
  LoginRequest,
  LoginResponse,
  User
} from 'cc-remote-shared';
import {
  generateToken,
  hashPassword,
  verifyPassword
} from '../auth';

const router: Router = Router();
const prisma = new PrismaClient();

// 请求验证schema
const registerSchema = z.object({
  email: z.string().email('无效的邮箱地址'),
  password: z.string().min(6, '密码至少6个字符'),
  username: z.string().min(2, '用户名至少2个字符').optional()
});

const loginSchema = z.object({
  email: z.string().email('无效的邮箱地址'),
  password: z.string().min(1, '请输入密码')
});

/**
 * 格式化用户响应
 */
function formatUserResponse(user: {
  id: string;
  email: string;
  username: string | null;
  created_at: Date;
}): User {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    created_at: user.created_at
  };
}

/**
 * POST /api/auth/register
 * 用户注册
 */
router.post('/register', async (req, res: Response) => {
  try {
    // 验证请求体
    const validationResult = registerSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.INVALID_INPUT,
        details: validationResult.error.errors
      });
      return;
    }

    const { email, password, username } = validationResult.data as RegisterRequest;

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: '注册失败',
        message: '该邮箱已被注册'
      });
      return;
    }

    // 哈希密码
    const passwordHash = await hashPassword(password);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        username: username || null
      }
    });

    // 生成JWT
    const token = generateToken({
      userId: user.id,
      email: user.email
    });

    console.log(`[Auth] User registered: ${email}`);

    const response: LoginResponse = {
      token,
      user: formatUserResponse(user)
    };

    res.status(HTTP_STATUS.CREATED).json(response);
  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '注册失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/login', async (req, res: Response) => {
  try {
    // 验证请求体
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.INVALID_INPUT,
        details: validationResult.error.errors
      });
      return;
    }

    const { email, password } = validationResult.data as LoginRequest;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: '登录失败',
        message: '邮箱或密码错误'
      });
      return;
    }

    // 验证密码
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: '登录失败',
        message: '邮箱或密码错误'
      });
      return;
    }

    // 生成JWT
    const token = generateToken({
      userId: user.id,
      email: user.email
    });

    console.log(`[Auth] User logged in: ${email}`);

    const response: LoginResponse = {
      token,
      user: formatUserResponse(user)
    };

    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '登录失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * GET /api/auth/me
 * 获取当前用户信息
 */
router.get('/me', async (req, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: '请提供有效的Bearer令牌'
      });
      return;
    }

    const token = authHeader.substring(7);
    const { verifyToken } = await import('../auth');
    const payload = verifyToken(token);

    if (!payload) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.INVALID_TOKEN,
        message: '令牌无效或已过期'
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: '用户不存在'
      });
      return;
    }

    res.status(HTTP_STATUS.OK).json(formatUserResponse(user));
  } catch (error) {
    console.error('[Auth] Get user error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '获取用户信息失败',
      message: '服务器内部错误'
    });
  }
});

export default router;
