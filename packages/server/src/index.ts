/**
 * Claude Code Remote Server
 * 主入口文件
 */

import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

import {
  DEFAULT_SERVER_PORT,
  ENV_VARS,
  SocketNamespaces
} from 'cc-remote-shared';

import routes from './routes';
import { initSocketServer } from './socket';

// 加载环境变量
dotenv.config();

// 初始化Prisma Client
const prisma = new PrismaClient();

// 创建Express应用
const app: Express = express();
const httpServer = createServer(app);

// Ensure upload temp directory exists
const uploadTempDir = process.env.UPLOAD_TEMP_DIR || '/tmp/ccr-upload';
if (!fs.existsSync(uploadTempDir)) {
  fs.mkdirSync(uploadTempDir, { recursive: true });
}

// CORS配置
// 开发环境和生产环境都允许所有来源（便于局域网访问和 Docker 部署）
// 如需限制，请设置 CORS_ORIGIN 环境变量
const corsOrigin = process.env[ENV_VARS.CORS_ORIGIN] || true;

app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

// 解析JSON请求体
app.use(express.json());

// 速率限制配置（生产环境强制启用）
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // 生产环境更严格
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health', // 健康检查不限速
});

// 对API路由应用速率限制
app.use('/api', limiter);

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// 健康检查端点 (仅用于非生产环境或 /health 路径)
if (process.env.NODE_ENV !== 'production') {
  app.get('/', (req, res) => {
    res.json({
      name: '@cc-remote/server',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString()
    });
  });
}

app.get('/health', async (req, res) => {
  try {
    // 测试数据库连接
    await prisma.$queryRaw`SELECT 1`;

    // 生产环境简化响应，避免信息泄露
    if (process.env.NODE_ENV === 'production') {
      res.json({ status: 'ok' });
    } else {
      res.json({
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[Health] Database check failed:', error);
    // 生产环境简化响应
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({ status: 'error' });
    } else {
      res.status(500).json({
        status: 'degraded',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }
  }
});

// 开发模式：将前端路由重定向到 Vite dev server
if (process.env.NODE_ENV !== 'production') {
  const webPort = process.env.VITE_PORT || '5173';
  app.get('/bind-*', (req, res) => {
    res.redirect(`http://localhost:${webPort}${req.originalUrl}`);
  });
}

// 生产模式：提供静态文件
if (process.env.NODE_ENV === 'production') {
  const webDistPath = path.join(__dirname, '..', 'web');

  // 检查 web 目录是否存在
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));

    // SPA fallback: 所有非 API、非 socket.io 路由返回 index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(webDistPath, 'index.html'));
    });

    console.log(`[Static] Serving web files from ${webDistPath}`);
  }
}

// API路由
app.use('/api', routes);

// 404处理
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `路由 ${req.method} ${req.path} 不存在`
  });
});

// 错误处理中间件
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误'
  });
});

// 初始化Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  },
  // 连接数限制和超时配置
  pingTimeout: 60000, // 60秒
  pingInterval: 25000, // 25秒
  connectTimeout: 45000, // 45秒
  maxHttpBufferSize: 1e6, // 1MB
});

// 初始化命名空间
initSocketServer(io);

// 获取端口
const PORT = parseInt(process.env[ENV_VARS.PORT] || String(DEFAULT_SERVER_PORT), 10);

// 开发模式：启动前强制释放被占用的端口
import { execSync } from 'child_process';
function killPortHolder(port: number): void {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
    if (pids) {
      const myPid = String(process.pid);
      const otherPids = pids.split('\n').filter((p) => p !== myPid);
      if (otherPids.length > 0) {
        console.log(`[Startup] Killing stale processes on port ${port}: ${otherPids.join(', ')}`);
        execSync(`kill -9 ${otherPids.join(' ')}`, { encoding: 'utf8' });
      }
    }
  } catch {
    // lsof returns exit 1 when no matches — safe to ignore
  }
}

function listenWithRetry(retries = 3, delayMs = 800): Promise<void> {
  return new Promise((resolve, reject) => {
    const onListen = () => {
      console.log('');
      console.log('=================================');
      console.log('  Claude Code Remote Server');
      console.log('=================================');
      console.log(`  HTTP Server: http://localhost:${PORT}`);
      console.log(`  Socket.io:   ws://localhost:${PORT}`);
      console.log(`  Agent NS:    ws://localhost:${PORT}${SocketNamespaces.AGENT}`);
      console.log(`  Client NS:   ws://localhost:${PORT}${SocketNamespaces.CLIENT}`);
      console.log('=================================');
      console.log('');
      resolve();
    };

    const tryListen = (attempt: number) => {
      httpServer.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempt < retries) {
          console.warn(`[Startup] Port ${PORT} in use, killing holder and retrying (${attempt + 1}/${retries})...`);
          killPortHolder(PORT);
          setTimeout(() => tryListen(attempt + 1), delayMs);
        } else {
          reject(err);
        }
      });
      httpServer.listen(PORT, () => {
        httpServer.removeAllListeners('error');
        onListen();
      });
    };

    tryListen(0);
  });
}

// 启动服务器
async function startServer() {
  try {
    await prisma.$connect();
    console.log('[Database] Connected successfully');

    // 开发模式先清理端口
    if (process.env.NODE_ENV !== 'production') {
      killPortHolder(PORT);
    }

    await listenWithRetry();
  } catch (error) {
    console.error('[Startup] Failed to start server:', error);
    process.exit(1);
  }
}

// 关闭处理：立即销毁连接 + 同步退出，确保端口瞬间释放
// ts-node-dev / tsx watch 在发送 SIGTERM 后会立即 fork 新子进程，
// 如果做 async 清理，新进程会在旧进程释放端口之前尝试 listen → EADDRINUSE。
// 因此这里必须 **同步** 退出：先销毁所有 TCP 连接释放端口，再 process.exit。
let isShuttingDown = false;
function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Shutdown] ${signal} — killing connections and exiting`);

  // 1. 立即销毁所有 TCP 连接（释放端口的关键）
  if (typeof httpServer.closeAllConnections === 'function') {
    httpServer.closeAllConnections();
  }

  // 2. 停止 accept 新连接（非阻塞，无需 await）
  httpServer.close();
  io.close();

  // 3. 同步退出。DB 连接由 OS 回收，开发模式不需要优雅断开
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// 启动服务器
startServer();

// 导出供测试使用
export { app, httpServer, io, prisma };
