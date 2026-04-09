/**
 * 认证路由
 * 包含注册和登录API
 */

import { Router, Response, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';
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
  verifyToken,
  hashPassword,
  verifyPassword,
  authMiddleware
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

/**
 * POST /api/auth/bind-telegram
 * 绑定Telegram账号到当前用户
 */
router.post('/bind-telegram', authMiddleware, async (req: Request, res: Response) => {
  try {
    // 验证请求体
    const bindSchema = z.object({
      token: z.string().min(1, '缺少bind token'),
      platform_user_id: z.string().min(1, '缺少platform_user_id'),
      chat_id: z.string().min(1, '缺少chat_id'),
    });
    const validationResult = bindSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.INVALID_INPUT,
        details: validationResult.error.errors,
      });
      return;
    }

    const { token, platform_user_id, chat_id } = validationResult.data;
    const userId = req.user!.id;

    // 验证bind token：调用Bot服务的verify接口
    const BOT_SERVICE_URL = process.env.BOT_SERVICE_URL || 'http://localhost:3001';
    try {
      const verifyRes = await fetch(
        `${BOT_SERVICE_URL}/api/bind/verify?token=${encodeURIComponent(token)}`
      );
      if (!verifyRes.ok) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: '绑定失败',
          message: 'Bind token验证失败',
        });
        return;
      }
    } catch (err) {
      // 开发模式下如果Bot服务不可达，跳过验证
      if (process.env.NODE_ENV === 'production') {
        console.error('[Auth] Bot service unreachable during bind verification:', err);
        res.status(HTTP_STATUS.INTERNAL_ERROR).json({
          error: '绑定失败',
          message: 'Bot服务不可达',
        });
        return;
      }
      console.warn('[Auth] Bot service unreachable, skipping bind token verification (dev mode)');
    }

    // 生成refresh_secret
    const refresh_secret = crypto.randomBytes(32).toString('hex');

    // Upsert BotBinding（唯一约束：platform + platform_user_id）
    await prisma.botBinding.upsert({
      where: {
        platform_platform_user_id: {
          platform: 'telegram',
          platform_user_id,
        },
      },
      update: {
        user_id: userId,
        chat_id,
        refresh_secret,
      },
      create: {
        user_id: userId,
        platform: 'telegram',
        platform_user_id,
        chat_id,
        refresh_secret,
      },
    });

    // 获取用户信息并生成JWT
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: '用户不存在',
      });
      return;
    }

    const jwt = generateToken({
      userId: user.id,
      email: user.email,
    });

    console.log(`[Auth] Telegram bound for user: ${user.email}, platform_user_id: ${platform_user_id}`);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      jwt,
      refresh_secret,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error('[Auth] Bind telegram error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '绑定失败',
      message: '服务器内部错误',
    });
  }
});

/**
 * POST /api/auth/bot-token
 * Bot服务刷新JWT（无需认证中间件）
 */
router.post('/bot-token', async (req: Request, res: Response) => {
  try {
    const { jwt, platform, platform_user_id, refresh_secret } = req.body as {
      jwt?: string;
      platform?: string;
      platform_user_id?: string;
      refresh_secret?: string;
    };

    // 路径1：提供有效的JWT，直接刷新
    if (jwt) {
      const payload = verifyToken(jwt);
      if (payload) {
        // 验证用户仍存在
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
        });
        if (!user) {
          res.status(HTTP_STATUS.UNAUTHORIZED).json({
            error: ERROR_MESSAGES.UNAUTHORIZED,
            message: '用户不存在',
          });
          return;
        }

        const newJwt = generateToken({
          userId: user.id,
          email: user.email,
        });

        res.status(HTTP_STATUS.OK).json({
          success: true,
          jwt: newJwt,
        });
        return;
      }

      // JWT无效/过期，但没提供refresh_secret，无法刷新
      if (!platform || !platform_user_id || !refresh_secret) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({
          error: ERROR_MESSAGES.INVALID_TOKEN,
          message: 'JWT已过期，请使用refresh_secret刷新',
        });
        return;
      }
    }

    // 路径2：通过refresh_secret刷新（JWT过期的情况）
    if (!platform || !platform_user_id || !refresh_secret) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_MESSAGES.INVALID_INPUT,
        message: '请提供jwt或(platform + platform_user_id + refresh_secret)',
      });
      return;
    }

    // 查找BotBinding
    const binding = await prisma.botBinding.findUnique({
      where: {
        platform_platform_user_id: {
          platform,
          platform_user_id,
        },
      },
    });

    if (!binding) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        error: '绑定不存在',
        message: '未找到对应的Bot绑定记录',
      });
      return;
    }

    // 验证refresh_secret
    if (binding.refresh_secret !== refresh_secret) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'refresh_secret不匹配',
      });
      return;
    }

    // 获取用户并生成新JWT
    const user = await prisma.user.findUnique({
      where: { id: binding.user_id },
    });

    if (!user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: '用户不存在',
      });
      return;
    }

    const newJwt = generateToken({
      userId: user.id,
      email: user.email,
    });

    console.log(`[Auth] Bot token refreshed for platform: ${platform}, platform_user_id: ${platform_user_id}`);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      jwt: newJwt,
    });
  } catch (error) {
    console.error('[Auth] Bot token error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '获取令牌失败',
      message: '服务器内部错误',
    });
  }
});

export default router;
