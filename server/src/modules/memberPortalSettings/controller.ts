/**
 * 会员门户设置控制器
 */
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  createMemberPortalSettingsVersion,
  getMemberPortalSettingsForEmployee,
  listMemberPortalSettingsVersions,
  rollbackMemberPortalSettingsVersion,
  getDefaultPortalSettingsPublic,
  getPortalSettingsByAccount,
  getPortalSettingsByMember,
  getPortalSettingsByInviteToken,
  listSpinWheelPrizesForEmployee,
  listSpinWheelPrizesForMember,
  upsertSpinWheelPrizes,
  saveDraftSettings,
  getLatestDraft,
  publishDraft,
  discardDraft,
} from './service.js';
import { countCheckInsForTenant, listCheckInsForTenant } from './checkInsAdmin.js';
import {
  countLotteryPointsRowsForTenant,
  listLotteryPointsRowsForTenant,
  sumLotteryPointsPositiveForTenant,
} from './lotteryPointsAdmin.js';
import { queryOne } from '../../database/index.js';
import {
  countSpinCreditsForTenant,
  listSpinCreditsForTenant,
  type SpinCreditCategory,
} from './spinCreditsAdmin.js';
import { resolveTenantIdForActivityDataList } from './activityDataTenant.js';

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function canPublish(user: AuthenticatedRequest['user']): boolean {
  return !!(user?.role === 'admin' || user?.is_super_admin);
}

function canSubmitApproval(user: AuthenticatedRequest['user']): boolean {
  return !!(user?.role === 'manager' || user?.role === 'admin' || user?.is_super_admin);
}

export async function createVersionController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  if (!canPublish(req.user)) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin role required to publish' } });
    return;
  }
  const { payload, note, effective_at, tenant_id } = req.body || {};
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'payload is required' } });
    return;
  }
  try {
    const result = await createMemberPortalSettingsVersion(
      userId,
      payload,
      note || null,
      effective_at || null,
      tenant_id || null
    );
    if (!result.success) {
      const status = result.error === 'NO_PERMISSION' ? 403 : result.error === 'TENANT_NOT_FOUND' ? 400 : 500;
      res.status(status).json({ success: false, error: { code: result.error, message: result.error } });
      return;
    }
    res.json({
      success: true,
      version_id: result.version_id,
      version_no: result.version_no,
      is_applied: result.is_applied,
    });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: errMessage(e, 'Create version failed') } });
  }
}

export async function getSettingsController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  const tenantId = (req.query.tenant_id as string) || null;
  try {
    const result = await getMemberPortalSettingsForEmployee(userId, tenantId);
    if (!result.success) {
      const status = result.error === 'TENANT_NOT_FOUND' ? 400 : 500;
      res.status(status).json({ success: false, error: { code: result.error, message: result.error } });
      return;
    }
    res.json({
      success: true,
      tenant_id: result.tenant_id,
      tenant_name: result.tenant_name,
      settings: result.settings,
      published_version_no: result.published_version_no ?? null,
      settings_updated_at: result.settings_updated_at ?? null,
    });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: errMessage(e, 'Get settings failed') } });
  }
}

export async function listVersionsController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 20), 10) || 20));
  const tenantId = (req.query.tenant_id as string) || null;
  try {
    const result = await listMemberPortalSettingsVersions(userId, limit, tenantId);
    if (!result.success) {
      const status = result.error === 'TENANT_NOT_FOUND' ? 400 : 500;
      res.status(status).json({ success: false, error: { code: result.error, message: result.error } });
      return;
    }
    res.json({ success: true, versions: result.versions || [] });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: errMessage(e, 'List versions failed') } });
  }
}

export async function rollbackVersionController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  if (!canPublish(req.user)) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin role required to rollback' } });
    return;
  }
  const versionId = req.params.versionId;
  const tenantId = (req.query.tenant_id as string) || null;
  if (!versionId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'versionId is required' } });
    return;
  }
  try {
    const result = await rollbackMemberPortalSettingsVersion(userId, versionId, tenantId);
    if (!result.success) {
      const status = result.error === 'NO_PERMISSION' ? 403 : result.error === 'VERSION_NOT_FOUND' ? 404 : 500;
      res.status(status).json({ success: false, error: { code: result.error, message: result.error } });
      return;
    }
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: errMessage(e, 'Rollback failed') } });
  }
}

export async function getDefaultSettingsPublicController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const result = await getDefaultPortalSettingsPublic();
    res.json({
      success: true,
      tenant_id: result.tenant_id ?? null,
      tenant_name: result.tenant_name || '',
      settings: result.settings || {},
    });
  } catch (err) {
    console.error('[getDefaultSettingsPublicController] error:', err);
    res.status(500).json({ success: false, tenant_id: null, tenant_name: '', settings: {} });
  }
}

export async function getSettingsByAccountPublicController(
  req: Request,
  res: Response
): Promise<void> {
  const account = String(req.params.account || '').trim();
  if (!account) {
    res.json({ success: false });
    return;
  }
  try {
    const result = await getPortalSettingsByAccount(account);
    res.json({
      success: true,
      tenant_id: result.tenant_id ?? null,
      tenant_name: result.tenant_name || '',
      settings: result.settings || {},
    });
  } catch (err) {
    console.error('[getSettingsByAccountPublicController] error:', err);
    res.status(500).json({ success: false, tenant_id: null, tenant_name: '', settings: {} });
  }
}

export async function getSettingsByInviteTokenPublicController(
  req: Request,
  res: Response
): Promise<void> {
  const token = String(req.params.token || '').trim();
  if (!token) {
    res.json({ success: false });
    return;
  }
  try {
    const result = await getPortalSettingsByInviteToken(token);
    res.json({
      success: true,
      tenant_id: result.tenant_id ?? null,
      tenant_name: result.tenant_name || '',
      settings: result.settings || {},
    });
  } catch (err) {
    console.error('[getSettingsByInviteTokenPublicController] error:', err);
    res.status(500).json({ success: false, tenant_id: null, tenant_name: '', settings: {} });
  }
}

export async function getSettingsByMemberController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const memberId = String(req.params.memberId || '').trim();
  if (!memberId) {
    res.status(400).json({ success: false, error: 'memberId is required' });
    return;
  }
  if (req.user?.type === 'member' && req.user.id !== memberId) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Member can only load own portal settings' },
    });
    return;
  }
  // M10: staff must belong to same tenant as the queried member
  if (req.user?.type !== 'member' && req.user?.tenant_id) {
    try {
      const memberTenant = await queryOne<{ tenant_id: string | null }>(
        'SELECT tenant_id FROM members WHERE id = ? LIMIT 1',
        [memberId]
      );
      if (memberTenant && memberTenant.tenant_id !== req.user.tenant_id) {
        res.status(403).json({ success: false, error: 'CROSS_TENANT_FORBIDDEN' });
        return;
      }
    } catch {
      /* proceed if lookup fails */
    }
  }
  try {
    const result = await getPortalSettingsByMember(memberId);
    res.json({
      success: true,
      tenant_id: result.tenant_id ?? null,
      tenant_name: result.tenant_name || '',
      settings: result.settings || {},
    });
  } catch {
    res.json({ success: true, tenant_id: null, tenant_name: '', settings: {} });
  }
}

/* ── 草稿 / 发布 Controllers ── */

export async function saveDraftController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ success: false, error: 'UNAUTHORIZED' }); return; }
  if (!canSubmitApproval(req.user)) { res.status(403).json({ success: false, error: 'NO_PERMISSION' }); return; }
  const { payload, note, tenant_id } = req.body || {};
  if (!payload || typeof payload !== 'object') { res.status(400).json({ success: false, error: 'payload is required' }); return; }
  try {
    const result = await saveDraftSettings(userId, payload, note || null, tenant_id || null);
    if (!result.success) { res.status(400).json(result); return; }
    res.json({ success: true, draft_id: result.draft_id });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: errMessage(e, 'Save draft failed') });
  }
}

export async function getDraftController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ success: false, error: 'UNAUTHORIZED' }); return; }
  const tenantId = (req.query.tenant_id as string) || null;
  try {
    const result = await getLatestDraft(userId, tenantId);
    if (!result.success) { res.status(400).json(result); return; }
    res.json({ success: true, draft: result.draft || null });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: errMessage(e, 'Get draft failed') });
  }
}

export async function publishDraftController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ success: false, error: 'UNAUTHORIZED' }); return; }
  if (!canPublish(req.user)) { res.status(403).json({ success: false, error: 'Admin role required to publish' }); return; }
  const { note, tenant_id } = req.body || {};
  try {
    const result = await publishDraft(userId, note || null, tenant_id || null);
    if (!result.success) {
      const status = result.error === 'NO_DRAFT' ? 400 : result.error === 'NO_PERMISSION' ? 403 : 500;
      res.status(status).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, version_id: result.version_id, version_no: result.version_no, is_applied: result.is_applied });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: errMessage(e, 'Publish failed') });
  }
}

export async function discardDraftController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ success: false, error: 'UNAUTHORIZED' }); return; }
  if (!canSubmitApproval(req.user)) { res.status(403).json({ success: false, error: 'NO_PERMISSION' }); return; }
  const tenantId = (req.query.tenant_id as string) || null;
  try {
    const result = await discardDraft(userId, tenantId);
    if (!result.success) { res.status(400).json(result); return; }
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: errMessage(e, 'Discard draft failed') });
  }
}

/* ── Spin Wheel Prizes Controllers ── */

export async function listSpinWheelPrizesController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ success: false, error: 'UNAUTHORIZED' }); return; }
  try {
    const tenantId = (req.query.tenant_id as string) || null;
    const result = await listSpinWheelPrizesForEmployee(userId, tenantId);
    if (!result.success) { res.status(400).json(result); return; }
    res.json({ success: true, items: result.items || [] });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: errMessage(e, 'Failed') });
  }
}

export async function upsertSpinWheelPrizesController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ success: false, error: 'UNAUTHORIZED' }); return; }
  if (!canPublish(req.user)) { res.status(403).json({ success: false, error: 'NO_PERMISSION' }); return; }
  try {
    const { items, tenant_id } = req.body || {};
    const result = await upsertSpinWheelPrizes(userId, items || [], tenant_id || null);
    if (!result.success) { res.status(400).json(result); return; }
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: errMessage(e, 'Failed') });
  }
}

export async function listSpinWheelPrizesByMemberController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const memberId = String(req.params.memberId || '').trim();
  if (!memberId) { res.status(400).json({ success: false, error: 'memberId required' }); return; }
  if (req.user?.type === 'member' && req.user.id !== memberId) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Member can only load own spin prizes' } });
    return;
  }
  // M10: staff must belong to same tenant as the queried member
  if (req.user?.type !== 'member' && req.user?.tenant_id) {
    try {
      const memberTenant = await queryOne<{ tenant_id: string | null }>(
        'SELECT tenant_id FROM members WHERE id = ? LIMIT 1',
        [memberId]
      );
      if (memberTenant && memberTenant.tenant_id !== req.user.tenant_id) {
        res.status(403).json({ success: false, error: 'CROSS_TENANT_FORBIDDEN' });
        return;
      }
    } catch {
      /* proceed if lookup fails */
    }
  }
  try {
    const result = await listSpinWheelPrizesForMember(memberId);
    res.json({ success: true, items: result.items || [] });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: errMessage(e, 'Failed') });
  }
}

/** 员工：本租户签到流水（活动数据） */
export async function listCheckInsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return;
  }
  if (req.user?.type === 'member') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '员工接口' } });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const { tenantId } = resolved;
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
  const memberCode = typeof req.query.member_code === 'string' ? req.query.member_code : '';
  const filter =
    phone.trim() || memberCode.trim()
      ? { phone: phone.trim() || undefined, memberCode: memberCode.trim() || undefined }
      : undefined;
  try {
    const [rows, total] = await Promise.all([
      listCheckInsForTenant(tenantId, limit, offset, filter),
      countCheckInsForTenant(tenantId, filter),
    ]);
    res.json({ success: true, check_ins: rows, total });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: errMessage(e, 'Failed') });
  }
}

/** 员工：本租户抽奖获得积分流水（活动数据） */
export async function listLotteryPointsLedgerController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return;
  }
  if (req.user?.type === 'member') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '员工接口' } });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const { tenantId } = resolved;
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  try {
    const [rows, total, totalLotteryPointsEarned] = await Promise.all([
      listLotteryPointsRowsForTenant(tenantId, q, limit, offset),
      countLotteryPointsRowsForTenant(tenantId, q),
      sumLotteryPointsPositiveForTenant(tenantId, q),
    ]);
    res.json({
      success: true,
      rows,
      total,
      stats: { total_lottery_points_earned: totalLotteryPointsEarned },
    });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: errMessage(e, 'Failed') });
  }
}

/** 员工：本租户抽奖次数流水（活动数据） */
export async function listSpinCreditsLogController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return;
  }
  if (req.user?.type === 'member') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '员工接口' } });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const { tenantId } = resolved;
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const rawCat = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const category =
    rawCat === 'order' || rawCat === 'share' || rawCat === 'invite' ? (rawCat as SpinCreditCategory) : null;
  if (!category) {
    res.status(400).json({ success: false, error: 'category required: order | share | invite' });
    return;
  }
  const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
  const memberCode = typeof req.query.member_code === 'string' ? req.query.member_code : '';
  const filter =
    phone.trim() || memberCode.trim()
      ? { phone: phone.trim() || undefined, memberCode: memberCode.trim() || undefined }
      : undefined;
  try {
    const [rows, total] = await Promise.all([
      listSpinCreditsForTenant(tenantId, limit, offset, category, filter),
      countSpinCreditsForTenant(tenantId, category, filter),
    ]);
    res.json({ success: true, rows, total });
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: errMessage(e, 'Failed') });
  }
}
