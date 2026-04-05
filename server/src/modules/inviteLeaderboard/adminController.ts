/**
 * 员工 JWT：会员门户 → 活动数据 → 邀请设置
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveTenantIdForActivityDataList } from '../memberPortalSettings/activityDataTenant.js';
import { insertOperationLogRepository } from '../data/repository.js';
import {
  listInviteLeaderboardFakeUsers,
  patchInviteLeaderboardFakeUser,
  toggleInviteLeaderboardFakeUserActive,
  resetInviteLeaderboardFakeUserGrowth,
  deleteAllInviteLeaderboardFakes,
  randomizeInviteLeaderboardFakeBaseCounts,
  seedInviteLeaderboardFakeUsers,
  getInviteLeaderboardGrowthSettingsDto,
  patchInviteLeaderboardGrowthSettings,
  runInviteLeaderboardGrowthJobNow,
  resetInviteLeaderboardGrowthCycle,
} from './service.js';

function staffIp(req: AuthenticatedRequest): string | null {
  const forwarded = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  return forwarded || (req.headers['x-real-ip'] as string) || req.socket?.remoteAddress || null;
}

async function audit(
  req: AuthenticatedRequest,
  operationType: string,
  objectId: string | null,
  desc: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await insertOperationLogRepository({
    operator_id: req.user?.id ?? null,
    operator_account: req.user?.username || req.user?.real_name || 'staff',
    operator_role: req.user?.role || 'staff',
    module: 'Invite leaderboard settings',
    operation_type: operationType,
    object_id: objectId,
    object_description: desc,
    before_data: before,
    after_data: after,
    ip_address: staffIp(req),
  });
}

function assertEmployee(req: AuthenticatedRequest, res: Response): boolean {
  if (!req.user?.id) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return false;
  }
  if (req.user.type === 'member') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff endpoint' } });
    return false;
  }
  return true;
}

function canMutate(req: AuthenticatedRequest): boolean {
  const role = String(req.user?.role ?? '').toLowerCase();
  return !!(
    req.user?.is_super_admin ||
    req.user?.is_platform_super_admin ||
    role === 'admin' ||
    role === 'manager'
  );
}

function canReplaceSeed(req: AuthenticatedRequest): boolean {
  const role = String(req.user?.role ?? '').toLowerCase();
  return !!(req.user?.is_super_admin || req.user?.is_platform_super_admin || role === 'admin');
}

export async function listInviteLeaderboardFakeUsersController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  try {
    const rows = await listInviteLeaderboardFakeUsers(resolved.tenantId);
    res.json({ success: true, rows });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

export async function patchInviteLeaderboardFakeUserController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canMutate(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ success: false, error: 'id required' });
    return;
  }
  const body = req.body || {};
  const patch: { name?: string; base_invite_count?: number } = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (body.base_invite_count != null) patch.base_invite_count = Number(body.base_invite_count);

  try {
    const outcome = await patchInviteLeaderboardFakeUser(resolved.tenantId, id, patch);
    if (!outcome.ok) {
      if (outcome.error === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: 'NOT_FOUND' });
        return;
      }
      res.status(400).json({ success: false, error: 'NO_CHANGES' });
      return;
    }
    await audit(req, 'update', id, 'Invite leaderboard fake user edit', outcome.before, outcome.after);
    res.json({ success: true, row: outcome.after });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

export async function postInviteLeaderboardFakeUserToggleController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canMutate(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const id = String(req.params.id || '').trim();
  const b = req.body as { is_active?: boolean } | undefined;
  if (typeof b?.is_active !== 'boolean') {
    res.status(400).json({ success: false, error: 'is_active boolean required' });
    return;
  }
  const isActive = b.is_active;
  try {
    const outcome = await toggleInviteLeaderboardFakeUserActive(resolved.tenantId, id, isActive);
    if (!outcome.ok) {
      res.status(404).json({ success: false, error: 'NOT_FOUND' });
      return;
    }
    await audit(req, 'toggle_active', id, isActive ? 'Enable fake user' : 'Disable fake user', outcome.before, outcome.after);
    res.json({ success: true, row: outcome.after });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

export async function postInviteLeaderboardFakeUserResetGrowthController(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canMutate(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const id = String(req.params.id || '').trim();
  try {
    const outcome = await resetInviteLeaderboardFakeUserGrowth(resolved.tenantId, id);
    if (!outcome.ok) {
      res.status(404).json({ success: false, error: 'NOT_FOUND' });
      return;
    }
    await audit(req, 'reset_growth', id, 'Reset auto-growth', outcome.before, outcome.after);
    res.json({ success: true, row: outcome.after });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

export async function postInviteLeaderboardDeleteAllFakesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canReplaceSeed(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  try {
    const { deleted } = await deleteAllInviteLeaderboardFakes(resolved.tenantId);
    await audit(req, 'delete_all_fakes', null, 'Delete all invite leaderboard fake users', null, { deleted });
    res.json({ success: true, deleted });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

export async function postInviteLeaderboardRandomizeFakeBaseController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canMutate(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const body = (req.body || {}) as { min?: unknown; max?: unknown };
  let min = body.min != null ? Number(body.min) : 1;
  let max = body.max != null ? Number(body.max) : 3;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    res.status(400).json({ success: false, error: 'min/max must be numbers' });
    return;
  }
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  try {
    const { updated } = await randomizeInviteLeaderboardFakeBaseCounts(resolved.tenantId, min, max);
    await audit(req, 'randomize_fake_base', null, 'Randomize base invite counts', { min, max }, { updated });
    res.json({ success: true, updated, min, max });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

export async function postInviteLeaderboardSeedController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canMutate(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  const replace = !!(req.body && (req.body as { replace?: boolean }).replace === true);
  if (replace && !canReplaceSeed(req)) {
    res.status(403).json({ success: false, error: 'ADMIN_REQUIRED_FOR_REPLACE' });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  try {
    const seedOutcome = await seedInviteLeaderboardFakeUsers(resolved.tenantId, replace);
    await audit(
      req,
      'seed',
      null,
      replace ? 'Replace and initialize 50 fake users' : 'Initialize 50 fake users',
      { replace },
      { inserted: seedOutcome.ok ? seedOutcome.inserted : 0 },
    );
    if (!seedOutcome.ok) {
      res.status(409).json({ success: false, error: 'ALREADY_SEEDED', message: 'Fake users already exist, use replace to overwrite' });
      return;
    }
    res.json({ success: true, inserted: seedOutcome.inserted });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

export async function getInviteLeaderboardGrowthSettingsController(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  if (!assertEmployee(req, res)) return;
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  try {
    const settings = await getInviteLeaderboardGrowthSettingsDto(resolved.tenantId);
    res.json({ success: true, settings });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

export async function patchInviteLeaderboardGrowthSettingsController(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canMutate(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const body = (req.body || {}) as Record<string, unknown>;
  const patch: {
    auto_growth_enabled?: boolean;
    growth_segment_hours?: number;
    growth_delta_min?: number;
    growth_delta_max?: number;
  } = {};
  if (typeof body.auto_growth_enabled === 'boolean') patch.auto_growth_enabled = body.auto_growth_enabled;
  if (body.growth_segment_hours != null) patch.growth_segment_hours = Number(body.growth_segment_hours);
  if (body.growth_delta_min != null) patch.growth_delta_min = Number(body.growth_delta_min);
  if (body.growth_delta_max != null) patch.growth_delta_max = Number(body.growth_delta_max);
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ success: false, error: 'empty body' });
    return;
  }
  try {
    const outcome = await patchInviteLeaderboardGrowthSettings(resolved.tenantId, patch);
    if (!outcome.ok) {
      res.status(400).json({ success: false, error: 'empty body' });
      return;
    }
    await audit(req, 'growth_settings', null, 'Invite leaderboard auto-growth strategy', outcome.before, outcome.after);
    res.json({ success: true, settings: outcome.after });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

/** 手动触发增长任务：仍按每租户 next_fake_growth_at 是否到期执行（与定时任务相同逻辑） */
export async function postInviteLeaderboardRunGrowthNowController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canReplaceSeed(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  try {
    const result = await runInviteLeaderboardGrowthJobNow();
    await audit(req, 'run_growth_job', null, 'Manually run invite leaderboard fake user growth task', null, result);
    res.json({
      success: result.ok,
      tenants_eligible: result.tenants_eligible,
      tenants_processed: result.tenants_processed,
      fake_rows_updated: result.fake_rows_updated,
      message: result.message,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

/** Explicitly reset the current growth cycle and re-allocate random growth times. */
export async function postInviteLeaderboardResetCycleController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  if (!canMutate(req)) {
    res.status(403).json({ success: false, error: 'NO_PERMISSION' });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  try {
    const { before, after } = await resetInviteLeaderboardGrowthCycle(resolved.tenantId);
    await audit(req, 'reset_growth_cycle', null, 'Reset invite leaderboard growth cycle', before, after);
    res.json({ success: true, settings: after });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}
