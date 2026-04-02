/**
 * Jest测试环境设置
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DATABASE_URL = 'file:./test.db';
process.env.PORT = '3001';
process.env.CORS_ORIGIN = '*';

// Prisma客户端实例
let prisma: PrismaClient;
let app: express.Application;
let httpServer: any;
let io: Server;

// 测试数据库路径
const testDbPath = path.join(__dirname, '../../prisma/test.db');

/**
 * 初始化测试数据库
 */
async function setupTestDatabase(): Promise<void> {
  // 删除旧的测试数据库
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // 推送schema到测试数据库
  try {
    execSync('npx prisma db push --skip-generate', {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env },
      stdio: 'pipe',
    });
  } catch (error) {
    console.error('[Test Setup] Database push error:', error);
    throw error;
  }

  // 创建Prisma客户端
  prisma = new PrismaClient();
  await prisma.$connect();

  // 创建Express应用
  app = express();
  httpServer = createServer(app);

  // CORS配置
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }));

  // 解析JSON请求体
  app.use(express.json());

  // 创建Socket.io服务器
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  console.log('[Test] Database connected');
}

/**
 * 清空所有表数据
 */
async function clearDatabase(): Promise<void> {
  if (prisma) {
    await prisma.sessionLog.deleteMany();
    await prisma.project.deleteMany();
    await prisma.machine.deleteMany();
    await prisma.user.deleteMany();
  }
}

/**
 * 清理测试数据库
 */
async function teardownTestDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }

  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}

// 全局设置
beforeAll(async () => {
  await setupTestDatabase();
}, 30000);

// 每个测试前清空数据库
beforeEach(async () => {
  await clearDatabase();
});

// 全局清理
afterAll(async () => {
  await teardownTestDatabase();
});

// 导出Prisma客户端和 Express 应用实例供测试使用
export { prisma, app, httpServer, io };
