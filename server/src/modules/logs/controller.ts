/**
 * Logs Controller
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveLoginLogIpLocationsBatch } from './service.js';

export async function resolveLocationsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user || req.user.type === 'member') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } });
    return;
  }
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
}
