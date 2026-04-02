/**
 * 用户认证模块
 * 包含JWT生成/验证、密码哈希/验证、Express认证中间件
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, ERROR_MESSAGES, ENV_VARS } from 'cc-remote-shared';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// JWT配置
const JWT_SECRET = process.env[ENV_VARS.JWT_SECRET];
const JWT_EXPIRES_IN = process.env[ENV_VARS.JWT_EXPIRES_IN] || '7d';

// 强制要求JWT_SECRET在生产环境设置
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL ERROR: JWT_SECRET environment variable must be set in production');
  } else {
    console.warn('WARNING: Using default JWT secret. This should NOT be used in production!');
  }
}

// JWT payload接口
export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// 扩展Express Request类型
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

/**
 * 生成JWT令牌
 */
export function generateToken(payload: JwtPayload): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  const expiresInSeconds = JWT_EXPIRES_IN.endsWith('d')
    ? parseInt(JWT_EXPIRES_IN) * 24 * 60 * 60
    : parseInt(JWT_EXPIRES_IN);
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: expiresInSeconds });
}

/**
 * 验证JWT令牌
 * @returns 解码后的payload或null（如果无效）
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }
    return jwt.verify(token, JWT_SECRET!) as JwtPayload;
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return null;
  }
}

/**
 * 哈希密码
 * @param plainPassword 明文密码
 * @returns 哈希后的密码
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(plainPassword, saltRounds);
}

/**
 * 验证密码
 * @param plainPassword 明文密码
 * @param hashedPassword 哈希后的密码
 * @returns 是否匹配
 */
export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * Express认证中间件
 * 验证请求头中的JWT令牌，并将用户信息附加到req.user
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: '请提供有效的Bearer令牌'
      });
      return;
    }

    const token = authHeader.substring(7); // 移除 "Bearer " 前缀
    const payload = verifyToken(token);

    if (!payload) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.INVALID_TOKEN,
        message: '令牌无效或已过期'
      });
      return;
    }

    // 验证用户是否仍然存在
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true }
    });

    if (!user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: '用户不存在'
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Middleware error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: '服务器错误',
      message: '认证过程发生错误'
    });
  }
}

/**
 * 可选的认证中间件
 * 如果提供了令牌则验证，但不强制要求
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // 没有提供令牌，继续但不设置用户
      next();
      return;
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (payload) {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true }
      });

      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    console.error('[Auth] Optional middleware error:', error);
    // 可选认证失败时继续，不阻止请求
    next();
  }
}

/**
 * 生成机器绑定令牌
 * 用于Agent首次绑定机器时使用
 */
export function generateMachineToken(): string {
  // 使用密码学安全的随机数生成器
  const crypto = require('crypto');
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `mkt_${randomBytes}`;
}

/**
 * 哈希机器令牌
 */
export async function hashMachineToken(token: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(token, saltRounds);
}

/**
 * 验证机器令牌
 */
export async function verifyMachineToken(
  plainToken: string,
  hashedToken: string
): Promise<boolean> {
  return bcrypt.compare(plainToken, hashedToken);
}
