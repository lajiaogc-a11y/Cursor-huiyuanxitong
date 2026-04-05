/**
 * 员工 JWT：会员门户 → 活动数据 → 邀请设置
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveTenantIdForActivityDataList } from '../memberPortalSettings/activityDataTenant.js';
import { insertOperationLogRepository } from '../data/repository.js';
import {
  listFakeUsersForTenant,
  updateFakeUserBaseFields,
  setFakeUserActive,
  resetFakeUserGrowth,
  seedFiftyFakeUsers,
  getFakeUser,
  totalInviteCount,
  deleteAllFakeUsersForTenant,
  randomizeBaseInviteCountsForTenant,
  getGrowthSettingsMerged,
  upsertInviteLeaderboardGrowthSettings,
  resetGrowthCycleForTenant,
  type InviteFakeUserRow,
  type InviteLeaderboardGrowthScheduleDto,
} from './repository.js';
import { runInviteLeaderboardFakeGrowthJob } from './fakeGrowthJob.js';

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

function serializeFakeRow(r: InviteFakeUserRow) {
  return {
    id: r.id,
    name: r.name,
    base_invite_count: r.base_invite_count,
    auto_increment_count: r.auto_increment_count,
    total_invite_count: totalInviteCount(r),
    growth_cycles: r.growth_cycles,
    max_growth_cycles: r.max_growth_cycles,
    is_active: !!r.is_active,
    next_growth_at: r.next_growth_at ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function listInviteLeaderboardFakeUsersController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertEmployee(req, res)) return;
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  try {
    const rows = await listFakeUsersForTenant(resolved.tenantId);
    res.json({ success: true, rows: rows.map(serializeFakeRow) });
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
    const beforeRow = await getFakeUser(resolved.tenantId, id);
    if (!beforeRow) {
      res.status(404).json({ success: false, error: 'NOT_FOUND' });
      return;
    }
    const ok = await updateFakeUserBaseFields(resolved.tenantId, id, patch);
    if (!ok) {
      res.status(400).json({ success: false, error: 'NO_CHANGES' });
      return;
    }
    const afterRow = await getFakeUser(resolved.tenantId, id);
    await audit(req, 'update', id, 'Invite leaderboard fake user edit', serializeFakeRow(beforeRow), afterRow ? serializeFakeRow(afterRow) : null);
    res.json({ success: true, row: afterRow ? serializeFakeRow(afterRow) : null });
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
    const beforeRow = await getFakeUser(resolved.tenantId, id);
    if (!beforeRow) {
      res.status(404).json({ success: false, error: 'NOT_FOUND' });
      return;
    }
    await setFakeUserActive(resolved.tenantId, id, isActive);
    const afterRow = await getFakeUser(resolved.tenantId, id);
    await audit(req, 'toggle_active', id, isActive ? 'Enable fake user' : 'Disable fake user', serializeFakeRow(beforeRow), afterRow ? serializeFakeRow(afterRow) : null);
    res.json({ success: true, row: afterRow ? serializeFakeRow(afterRow) : null });
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
    const beforeRow = await getFakeUser(resolved.tenantId, id);
    if (!beforeRow) {
      res.status(404).json({ success: false, error: 'NOT_FOUND' });
      return;
    }
    await resetFakeUserGrowth(resolved.tenantId, id);
    const afterRow = await getFakeUser(resolved.tenantId, id);
    await audit(req, 'reset_growth', id, 'Reset auto-growth', serializeFakeRow(beforeRow), afterRow ? serializeFakeRow(afterRow) : null);
    res.json({ success: true, row: afterRow ? serializeFakeRow(afterRow) : null });
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
    const deleted = await deleteAllFakeUsersForTenant(resolved.tenantId);
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
    const updated = await randomizeBaseInviteCountsForTenant(resolved.tenantId, min, max);
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
    const { inserted } = await seedFiftyFakeUsers(resolved.tenantId, replace);
    await audit(req, 'seed', null, replace ? 'Replace and initialize 50 fake users' : 'Initialize 50 fake users', { replace }, { inserted });
    if (!replace && inserted === 0) {
      res.status(409).json({ success: false, error: 'ALREADY_SEEDED', message: 'Fake users already exist, use replace to overwrite' });
      return;
    }
    res.json({ success: true, inserted });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}

function serializeGrowthSettings(d: InviteLeaderboardGrowthScheduleDto) {
  return {
    auto_growth_enabled: d.auto_growth_enabled,
    growth_segment_hours: d.growth_segment_hours,
    growth_delta_min: d.growth_delta_min,
    growth_delta_max: d.growth_delta_max,
    growth_segment_started_at: d.growth_segment_started_at,
    last_fake_growth_at: d.last_fake_growth_at,
    next_fake_growth_at: d.next_fake_growth_at,
  };
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
    const row = await getGrowthSettingsMerged(resolved.tenantId);
    res.json({ success: true, settings: serializeGrowthSettings(row) });
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
    const before = await getGrowthSettingsMerged(resolved.tenantId);
    const after = await upsertInviteLeaderboardGrowthSettings(resolved.tenantId, patch);
    await audit(req, 'growth_settings', null, 'Invite leaderboard auto-growth strategy', serializeGrowthSettings(before), serializeGrowthSettings(after));
    res.json({ success: true, settings: serializeGrowthSettings(after) });
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
    const result = await runInviteLeaderboardFakeGrowthJob();
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
    const before = await getGrowthSettingsMerged(resolved.tenantId);
    const after = await resetGrowthCycleForTenant(resolved.tenantId);
    await audit(req, 'reset_growth_cycle', null, 'Reset invite leaderboard growth cycle', serializeGrowthSettings(before), serializeGrowthSettings(after));
    res.json({ success: true, settings: serializeGrowthSettings(after) });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}
