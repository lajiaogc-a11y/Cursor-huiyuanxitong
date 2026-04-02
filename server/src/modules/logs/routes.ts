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
import { query, execute } from '../../database/index.js';

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

function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed || trimmed === 'unknown') return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

router.post('/login/resolve-locations', async (req: Request, res: Response) => {
  try {
    const rows = await query<{ id: string; ip_address: string }>(
      `SELECT id, ip_address FROM employee_login_logs
       WHERE ip_location IS NULL AND ip_address IS NOT NULL
       ORDER BY created_at DESC LIMIT 100`,
    );
    if (rows.length === 0) {
      res.json({ success: true, data: { resolved: 0 } });
      return;
    }
    let resolved = 0;
    const BATCH = 5;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await Promise.all(batch.map(async (row) => {
        const normalized = normalizeIp(row.ip_address);
        if (!normalized) return;
        if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
          await execute('UPDATE employee_login_logs SET ip_location = ? WHERE id = ?', ['本机', row.id]);
          resolved++;
          return;
        }
        if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(normalized)) {
          await execute('UPDATE employee_login_logs SET ip_location = ? WHERE id = ?', ['内网', row.id]);
          resolved++;
          return;
        }
        try {
          const resp = await fetch(
            `http://ip-api.com/json/${encodeURIComponent(normalized)}?fields=status,country,regionName,city&lang=zh-CN`,
            { signal: AbortSignal.timeout(3000) },
          );
          const data = await resp.json() as { status: string; country?: string; regionName?: string; city?: string };
          if (data.status === 'success') {
            const parts = [data.city, data.regionName, data.country].filter(Boolean);
            const location = parts.join(', ') || null;
            if (location) {
              await execute('UPDATE employee_login_logs SET ip_location = ? WHERE id = ?', [location, row.id]);
              resolved++;
            }
          }
        } catch { /* best effort */ }
      }));
      if (i + BATCH < rows.length) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    res.json({ success: true, data: { resolved, total: rows.length } });
  } catch (e) {
    console.error('[Logs] resolve-locations error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve locations' } });
  }
});

export default router;
