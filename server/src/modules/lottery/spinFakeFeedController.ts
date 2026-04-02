/**
 * 会员抽奖模拟中奖 — 轮询 feed（会员 JWT + 租户隔离）；数据来自 lottery_simulation_feed
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { getMemberTenantId } from './repository.js';
import {
  getSimulationSettingsRow,
  listSimulationFeedForTenant,
  purgeSimulationFeedOlderThan,
} from './simulationFeedRepository.js';

export async function spinSimFeedController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const memberId = req.user?.id;
  if (!memberId || req.user?.type !== 'member') {
    res.status(403).json({ success: false, error: { code: 'MEMBER_JWT_REQUIRED', message: 'Member session required' } });
    return;
  }
  const tenantId = await getMemberTenantId(memberId);
  if (!tenantId) {
    res.json({ success: true, items: [] });
    return;
  }
  try {
    const settings = await getSimulationSettingsRow(tenantId);
    await purgeSimulationFeedOlderThan(tenantId, settings.retention_days);
    const items = await listSimulationFeedForTenant(tenantId, 80);
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}
