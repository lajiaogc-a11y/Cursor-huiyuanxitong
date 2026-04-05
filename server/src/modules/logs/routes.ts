/**
 * 日志 API - GET /api/logs/audit, GET /api/logs/login
 * 要求认证，按 tenant_id 过滤数据
 */
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  getOperationLogsController,
  getLoginLogsController,
} from '../data/controller.js';
import { resolveLoginLogIpLocationsBatch } from './service.js';

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

router.post('/login/resolve-locations', async (_req: Request, res: Response) => {
  try {
    const { resolved, total } = await resolveLoginLogIpLocationsBatch();
    if (total === 0) {
      res.json({ success: true, data: { resolved: 0 } });
      return;
    }
    res.json({ success: true, data: { resolved, total } });
  } catch (e) {
    console.error('[Logs] resolve-locations error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve locations' } });
  }
});

export default router;
