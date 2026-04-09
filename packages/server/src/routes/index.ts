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

export default router;
