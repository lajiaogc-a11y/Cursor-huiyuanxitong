/**
 * Members Controller - 接收请求、调用 Service、返回结果
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import bcrypt from 'bcryptjs';
import { execute } from '../../database/index.js';
import {
  listMembersService,
  getMemberByIdService,
  createMemberService,
  updateMemberService,
  updateMemberByPhoneService,
  deleteMemberService,
  listReferralsService,
  getCustomerDetailByPhoneService,
  getReferrerByRefereePhoneService,
  bulkCreateMembersService,
  lookupMemberForReferralService,
} from './service.js';

function resolveTenantId(
  req: AuthenticatedRequest,
  requestedTenantId?: string | null,
  options?: { allowPlatformAll?: boolean }
): string | undefined {
  const isPlatform = !!req.user?.is_platform_super_admin;
  if (isPlatform) {
    if (requestedTenantId) return requestedTenantId;
    return options?.allowPlatformAll ? undefined : undefined;
  }
  return req.user?.tenant_id ?? undefined;
}

export async function listMembersController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const queryTenantId = req.query.tenant_id as string | undefined;
  const effectiveTenantId = resolveTenantId(req, queryTenantId, { allowPlatformAll: true });
  const query = {
    tenant_id: effectiveTenantId,
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  };
  const data = await listMembersService(effectiveTenantId, query);
  res.json({ success: true, data });
}

export async function getMemberByIdController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const queryTenantId = req.query.tenant_id as string | undefined;
  const effectiveTenantId = resolveTenantId(req, queryTenantId, { allowPlatformAll: true });
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const data = await getMemberByIdService(id, effectiveTenantId);
    res.json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found' } });
      return;
    }
    throw e;
  }
}

export async function createMemberController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = resolveTenantId(
    req,
    ((req.query.tenant_id as string) ?? (req.body?.tenant_id as string | undefined)) ?? undefined
  );
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '创建会员需指定 tenant_id（query 或 body）' } });
    return;
  }
  const body = req.body;
  if (!body?.phone_number) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'phone_number required' } });
    return;
  }
  try {
    const data = await createMemberService(tenantId, body);
    res.status(201).json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; errno?: number };
    if (err?.code === '23505' || err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
      res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Phone number already exists' } });
      return;
    }
    throw e;
  }
}

export async function updateMemberController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = resolveTenantId(
    req,
    ((req.query.tenant_id as string) ?? (req.body?.tenant_id as string | undefined)) ?? undefined
  );
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const data = await updateMemberService(id, tenantId, req.body);
    res.json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; errno?: number };
    if (err?.code === 'PGRST116' || err?.code === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found' } });
      return;
    }
    if (err?.code === 'MEMBER_CODE_TAKEN') {
      res.status(409).json({
        success: false,
        error: { code: 'MEMBER_CODE_TAKEN', message: err.message || 'Member code already in use' },
      });
      return;
    }
    if (err?.code === 'INVALID_LEVEL_ID') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_LEVEL_ID', message: err.message || 'Invalid level' },
      });
      return;
    }
    if (
      err?.code === 'REFERRER_NOT_FOUND' ||
      err?.code === 'REFERRER_SELF' ||
      err?.code === 'REFERRER_TENANT_MISMATCH'
    ) {
      res.status(400).json({
        success: false,
        error: { code: err.code, message: err.message || '推荐人无效' },
      });
      return;
    }
    if (err?.code === 'ER_BAD_FIELD_ERROR' || err?.code === 'ER_INVALID_JSON_TEXT' || err?.errno === 3140) {
      console.error('[updateMember] SQL error:', err);
      res.status(400).json({
        success: false,
        error: { code: 'DATA_ERROR', message: '数据格式错误，请检查输入内容' },
      });
      return;
    }
    throw e;
  }
}

export async function updateMemberByPhoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = resolveTenantId(
    req,
    ((req.query.tenant_id as string) ?? (req.body?.tenant_id as string | undefined)) ?? undefined
  );
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant_id required' } });
    return;
  }
  const phone = req.params.phone;
  if (!phone) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'phone required' } });
    return;
  }
  try {
    const data = await updateMemberByPhoneService(decodeURIComponent(phone), tenantId, req.body);
    res.json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; errno?: number };
    if (err?.code === 'PGRST116' || err?.code === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found' } });
      return;
    }
    if (err?.code === 'MEMBER_CODE_TAKEN') {
      res.status(409).json({
        success: false,
        error: { code: 'MEMBER_CODE_TAKEN', message: err.message || 'Member code already in use' },
      });
      return;
    }
    if (err?.code === 'INVALID_LEVEL_ID') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_LEVEL_ID', message: err.message || 'Invalid level' },
      });
      return;
    }
    if (
      err?.code === 'REFERRER_NOT_FOUND' ||
      err?.code === 'REFERRER_SELF' ||
      err?.code === 'REFERRER_TENANT_MISMATCH'
    ) {
      res.status(400).json({
        success: false,
        error: { code: err.code, message: err.message || '推荐人无效' },
      });
      return;
    }
    if (err?.code === 'ER_BAD_FIELD_ERROR' || err?.code === 'ER_INVALID_JSON_TEXT' || err?.errno === 3140) {
      console.error('[updateMemberByPhone] SQL error:', err);
      res.status(400).json({
        success: false,
        error: { code: 'DATA_ERROR', message: '数据格式错误，请检查输入内容' },
      });
      return;
    }
    throw e;
  }
}

export async function deleteMemberController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = resolveTenantId(req, (req.query.tenant_id as string | undefined) ?? undefined);
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    await deleteMemberService(id, tenantId);
    res.json({ success: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found' } });
      return;
    }
    throw e;
  }
}

export async function listReferralsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const queryTenantId = req.query.tenant_id as string | undefined;
  const effectiveTenantId = resolveTenantId(req, queryTenantId, { allowPlatformAll: true });
  const data = await listReferralsService(effectiveTenantId);
  res.json({ success: true, data });
}

export async function getReferrerByPhoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const effectiveTenantId = resolveTenantId(req, req.query.tenant_id as string | undefined, { allowPlatformAll: true });
  const phone = decodeURIComponent(req.params.phone || '').trim();
  if (!phone) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'phone required' } });
    return;
  }
  const data = await getReferrerByRefereePhoneService(phone, effectiveTenantId);
  res.json({ success: true, data: data ?? null });
}

export async function getCustomerDetailByPhoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const queryTenantId = req.query.tenant_id as string | undefined;
  const effectiveTenantId = resolveTenantId(req, queryTenantId, { allowPlatformAll: true });
  const phone = decodeURIComponent(req.params.phone || '').trim();
  if (!phone) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'phone required' } });
    return;
  }
  try {
    const syncCc =
      req.query.sync_common_cards === '1' ||
      req.query.sync_common_cards === 'true' ||
      req.query.sync_common_cards === 'yes';
    const data = await getCustomerDetailByPhoneService(phone, effectiveTenantId, {
      syncCommonCardsFromOrders: syncCc,
    });
    res.json({ success: true, data });
  } catch (e: unknown) {
    console.error(`[customerDetail] error for phone="${phone}" tenant="${effectiveTenantId}":`, e);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Customer detail lookup failed' },
    });
  }
}

/** 推荐录入：按 q=电话或会员编号 在指定租户内查找会员（须 tenant_id） */
export async function lookupMemberForReferralController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const queryTenantId = req.query.tenant_id as string | undefined;
  const effectiveTenantId = resolveTenantId(req, queryTenantId, { allowPlatformAll: false });
  if (!effectiveTenantId) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'tenant_id required for member lookup' },
    });
    return;
  }
  const q = String(req.query.q || '').trim();
  if (!q || q.length > 64) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'q required (max 64 chars)' } });
    return;
  }
  try {
    const data = await lookupMemberForReferralService(effectiveTenantId, q);
    res.json({ success: true, data: data ?? null });
  } catch (e: unknown) {
    console.error(`[lookupMember] error for q="${q}" tenant="${effectiveTenantId}":`, e);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Member lookup failed' },
    });
  }
}

export async function bulkCreateMembersController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = resolveTenantId(
    req,
    ((req.query.tenant_id as string) ?? (req.body?.tenant_id as string | undefined)) ?? undefined
  );
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant_id required' } });
    return;
  }
  const body = req.body as { members?: import('./types.js').BulkCreateMemberItem[] };
  if (!Array.isArray(body?.members) || body.members.length === 0) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'members array required' } });
    return;
  }
  try {
    const data = await bulkCreateMembersService(tenantId, body.members);
    res.status(201).json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string; errno?: number };
    if (err?.code === '23505' || err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
      res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Duplicate phone number' } });
      return;
    }
    throw e;
  }
}

export async function adminResetMemberPasswordController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const role = req.user?.role;
  if (role !== 'admin' && !req.user?.is_super_admin) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin role required' } });
    return;
  }
  const memberId = req.params.id;
  const { new_password } = req.body || {};
  const password = new_password || '123456';
  if (password.length < 6) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters' } });
    return;
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await execute(
      'UPDATE members SET password_hash = ?, must_change_password = 1, updated_at = NOW() WHERE id = ?',
      [hash, memberId],
    );
    const affected = result?.affectedRows ?? 0;
    if (affected === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found' } });
      return;
    }
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e?.message || 'Reset failed' } });
  }
}
