/**
 * 日志 API - GET /api/logs/audit, GET /api/logs/login
 * 要求认证，按 tenant_id 过滤数据
 */
import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  getOperationLogsController,
  getLoginLogsController,
} from '../data/controller.js';
import { resolveLocationsController } from './controller.js';

const router = Router();
router.use(authMiddleware);

router.get('/audit', (req, res, next) => {
  console.log('[API] HIT /api/logs/audit');
  return getOperationLogsController(req as AuthenticatedRequest, res).catch(next);
});

router.get('/login', (req, res, next) => {
  console.log('[API] HIT /api/logs/login');
  return getLoginLogsController(req as AuthenticatedRequest, res).catch(next);
});

router.post('/login/resolve-locations', (req, res) => resolveLocationsController(req as import('../../middlewares/auth.js').AuthenticatedRequest, res));

export default router;
