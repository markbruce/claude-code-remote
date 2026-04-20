/**
 * 路由入口文件
 * 导出所有API路由
 */

import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import machinesRoutes from './machines.routes';
import gitRoutes from './git.routes';
import uploadRoutes from './upload.routes';

const router: Router = Router();

// 挂载路由
router.use('/auth', authRoutes);
router.use('/machines', machinesRoutes);
router.use('/machines', gitRoutes);
router.use('/', uploadRoutes);

/**
 * Proxy /api/bind/* to Bot service.
 * In Docker, bot runs in an internal network — browser cannot reach it directly.
 * Server proxies bind verify/callback requests to the bot container.
 */
const BOT_SERVICE_URL = process.env.BOT_SERVICE_URL || 'http://localhost:3001';

// GET /api/bind/verify → Bot service
router.get('/bind/verify', async (req: Request, res: Response) => {
  try {
    const botRes = await fetch(`${BOT_SERVICE_URL}/api/bind/verify${req.url.replace('/api/bind/verify', '')}`);
    const data = await botRes.json();
    res.status(botRes.status).json(data);
  } catch (err) {
    console.error('[Proxy] Bot service unreachable for bind/verify:', err);
    res.status(502).json({ error: 'Bot service unreachable' });
  }
});

// POST /api/bind/callback → Bot service
router.post('/bind/callback', async (req: Request, res: Response) => {
  try {
    const botRes = await fetch(`${BOT_SERVICE_URL}/api/bind/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await botRes.json();
    res.status(botRes.status).json(data);
  } catch (err) {
    console.error('[Proxy] Bot service unreachable for bind/callback:', err);
    res.status(502).json({ error: 'Bot service unreachable' });
  }
});

export default router;
