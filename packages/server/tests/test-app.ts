/**
 * 测试应用实例
 */

import express, { Express } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import routes from './routes';
import { initSocketServer } from './socket';

// 设置环境变量
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DATABASE_URL = 'file:./test.db';
process.env.PORT = '3002';

const prisma = new PrismaClient();
const app: Express = express();
const httpServer = createServer(app);

// CORS
app.use(cors({
  origin: '*',
  credentials: true
}));

// JSON解析
app.use(express.json());

// 路由
app.use('/api', routes);

// Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// 初始化Socket服务器
initSocketServer(io);

// 导出
export { app, httpServer, io, prisma };
