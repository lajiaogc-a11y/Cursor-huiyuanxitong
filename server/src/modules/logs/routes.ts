/**
 * 日志 API - GET /api/logs/audit, GET /api/logs/login
 * 要求认证，按 tenant_id 过滤数据
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  getOperationLogsController,
  getLoginLogsController,
} from '../data/controller.js';

const router = Router();
router.use(authMiddleware);

router.get('/audit', (req, res, next) => {
  console.log('[API] HIT /api/logs/audit');
  return getOperationLogsController(req as any, res).catch(next);
});

router.get('/login', (req, res, next) => {
  console.log('[API] HIT /api/logs/login');
  return getLoginLogsController(req as any, res).catch(next);
});

export default router;
