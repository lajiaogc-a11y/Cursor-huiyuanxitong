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
    module: '邀请排行榜设置',
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
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '员工接口' } });
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
    await audit(req, 'update', id, '邀请排行榜假用户编辑', serializeFakeRow(beforeRow), afterRow ? serializeFakeRow(afterRow) : null);
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
    await audit(req, 'toggle_active', id, isActive ? '启用假用户' : '停用假用户', serializeFakeRow(beforeRow), afterRow ? serializeFakeRow(afterRow) : null);
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
    await audit(req, 'reset_growth', id, '重置自动增长', serializeFakeRow(beforeRow), afterRow ? serializeFakeRow(afterRow) : null);
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
    await audit(req, 'delete_all_fakes', null, '一键删除全部邀请榜假用户', null, { deleted });
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
    await audit(req, 'randomize_fake_base', null, '一键随机基础邀请人数', { min, max }, { updated });
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
    await audit(req, 'seed', null, replace ? '替换初始化50条假用户' : '初始化50条假用户', { replace }, { inserted });
    if (!replace && inserted === 0) {
      res.status(409).json({ success: false, error: 'ALREADY_SEEDED', message: '已有假用户，需 replace 才覆盖' });
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
    growth_alloc_mode: d.growth_alloc_mode,
    growth_segment_ticks_planned: d.growth_segment_ticks_planned,
    growth_segment_ticks_done: d.growth_segment_ticks_done,
    growth_ticks_min: d.growth_ticks_min,
    growth_ticks_max: d.growth_ticks_max,
    growth_interval_hours_min: d.growth_interval_hours_min,
    growth_interval_hours_max: d.growth_interval_hours_max,
    growth_delta_min: d.growth_delta_min,
    growth_delta_max: d.growth_delta_max,
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
    growth_alloc_mode?: string;
    growth_interval_hours_min?: number;
    growth_interval_hours_max?: number;
    growth_delta_min?: number;
    growth_delta_max?: number;
    growth_ticks_use_auto?: boolean;
    growth_ticks_min?: number | null;
    growth_ticks_max?: number | null;
  } = {};
  if (typeof body.auto_growth_enabled === 'boolean') patch.auto_growth_enabled = body.auto_growth_enabled;
  if (body.growth_segment_hours != null) patch.growth_segment_hours = Number(body.growth_segment_hours);
  if (body.growth_alloc_mode != null) patch.growth_alloc_mode = String(body.growth_alloc_mode);
  if (body.growth_interval_hours_min != null) patch.growth_interval_hours_min = Number(body.growth_interval_hours_min);
  if (body.growth_interval_hours_max != null) patch.growth_interval_hours_max = Number(body.growth_interval_hours_max);
  if (body.growth_delta_min != null) patch.growth_delta_min = Number(body.growth_delta_min);
  if (body.growth_delta_max != null) patch.growth_delta_max = Number(body.growth_delta_max);
  if (body.growth_ticks_use_auto === true) patch.growth_ticks_use_auto = true;
  if (body.growth_ticks_min !== undefined) {
    patch.growth_ticks_min =
      body.growth_ticks_min === null ? null : Number(body.growth_ticks_min);
  }
  if (body.growth_ticks_max !== undefined) {
    patch.growth_ticks_max =
      body.growth_ticks_max === null ? null : Number(body.growth_ticks_max);
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ success: false, error: 'empty body' });
    return;
  }
  try {
    const before = await getGrowthSettingsMerged(resolved.tenantId);
    const after = await upsertInviteLeaderboardGrowthSettings(resolved.tenantId, patch);
    await audit(req, 'growth_settings', null, '邀请榜自动增长策略', serializeGrowthSettings(before), serializeGrowthSettings(after));
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
    await audit(req, 'run_growth_job', null, '手动执行邀请榜假用户增长任务', null, result);
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
