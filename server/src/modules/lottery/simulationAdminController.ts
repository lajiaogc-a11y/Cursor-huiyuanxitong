/**
 * 后台：模拟抽奖滚动设置与数据浏览（独立表 lottery_simulation_feed）
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveTenantIdForActivityDataList } from '../memberPortalSettings/activityDataTenant.js';
import {
  getSimulationSettingsRow,
  upsertSimulationSettings,
  listSimulationFeedRowsAdmin,
  listSpinFakeHourRunsAdmin,
} from './simulationFeedRepository.js';
import { manualStartSpinFakeCronForTenant } from './spinFakeSimulationJob.js';

function assertEmployee(req: AuthenticatedRequest, res: Response): boolean {
  if (!req.user?.id) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return false;
  }
  if (req.user.type === 'member') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } });
    return false;
  }
  return true;
}

function canAdminSim(req: AuthenticatedRequest): boolean {
  const role = String(req.user?.role ?? '').toLowerCase();
  return !!(
    req.user?.is_super_admin ||
    req.user?.is_platform_super_admin ||
    role === 'admin'
  );
}

export async function adminGetSimulationSettingsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const s = await getSimulationSettingsRow(resolved.tenantId);
  res.json({ success: true, ...s });
}

export async function adminSaveSimulationSettingsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canAdminSim(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const body = req.body || {};
  const patch: {
    retention_days?: number;
    cron_fake_draws_per_hour?: number;
    sim_feed_rank_min?: number;
    sim_feed_rank_max?: number;
    enable_cron_fake_feed?: boolean;
  } = {};
  if (body.retention_days != null) patch.retention_days = Number(body.retention_days);
  if (body.cron_fake_draws_per_hour != null) patch.cron_fake_draws_per_hour = Number(body.cron_fake_draws_per_hour);
  if (body.sim_feed_rank_min != null) patch.sim_feed_rank_min = Number(body.sim_feed_rank_min);
  if (body.sim_feed_rank_max != null) patch.sim_feed_rank_max = Number(body.sim_feed_rank_max);
  if (typeof body.enable_cron_fake_feed === 'boolean') patch.enable_cron_fake_feed = body.enable_cron_fake_feed;

  const s = await upsertSimulationSettings(resolved.tenantId, patch);
  res.json({ success: true, ...s });
}

export async function adminListSimulationFeedController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
  const rows = await listSimulationFeedRowsAdmin(resolved.tenantId, limit);
  res.json({
    success: true,
    rows: rows.map((r) => ({
      id: r.id,
      source: r.source,
      feed_text: r.feed_text,
      member_id: r.member_id,
      created_at: String(r.created_at),
    })),
  });
}

export async function adminListSpinFakeHourRunsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
  const rows = await listSpinFakeHourRunsAdmin(resolved.tenantId, limit);
  res.json({ success: true, rows });
}

const START_ERR: Record<string, string> = {
  ENABLE_CRON_FIRST: 'Enable auto-generate hourly and save settings first.',
  NO_PRIZES: 'No enabled lottery prizes for this tenant; cannot simulate.',
  SLOT0_BUSY:
    'This round is already claimed (do not click again). To restart the timer from now, turn off auto-generate, turn it on again to clear the anchor, then retry.',
  ANCHOR_ALREADY_SET:
    'Simulation is already running (time anchor exists). To restart from the current moment, turn off auto-generate hourly and save, then turn it on again and run simulation.',
};

export async function adminStartSpinFakeCronController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canAdminSim(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const r = await manualStartSpinFakeCronForTenant(resolved.tenantId);
  if (!r.ok) {
    res.status(400).json({
      success: false,
      error: { code: r.code, message: START_ERR[r.code] ?? r.code },
    });
    return;
  }
  const s = await getSimulationSettingsRow(resolved.tenantId);
  res.json({ success: true, cron_fake_anchor_at: s.cron_fake_anchor_at });
}
