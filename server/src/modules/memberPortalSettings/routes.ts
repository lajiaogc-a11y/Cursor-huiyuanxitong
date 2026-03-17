/**
 * 会员门户设置 API 路由
 * 使用 JWT 认证，绕过 Supabase auth.uid() 限制
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  createVersionController,
  getSettingsController,
  listVersionsController,
  rollbackVersionController,
} from './controller.js';

const router = Router();

router.get('/', authMiddleware, getSettingsController);
router.get('/versions', authMiddleware, listVersionsController);
router.post('/versions', authMiddleware, createVersionController);
router.post('/versions/:versionId/rollback', authMiddleware, rollbackVersionController);

export default router;
