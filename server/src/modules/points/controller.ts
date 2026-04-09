/**
 * Points Controller
 */
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { getMemberTenantIdService } from '../members/service.js';
import {
  getMemberPointsService,
  getMemberPointsBreakdownService,
  getMemberSpinQuotaService,
} from './service.js';
import {
  postLedgerService,
  postMemberActivityAddConsumptionService,
  postMemberActivityAddReferralService,
  postReverseOnOrderCancelService,
} from './writeService.js';

async function assertMemberAccess(req: AuthenticatedRequest, memberId: string): Promise<boolean> {
  if (req.user?.type === 'member') return req.user.id === memberId;
  if (req.user?.is_platform_super_admin) return true;
  if (!req.user?.tenant_id) return false;
  const memberTenant = await getMemberTenantIdService(memberId);
  return memberTenant === req.user.tenant_id;
}

export async function getMemberPointsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { memberId } = req.params;
  if (!(await assertMemberAccess(req, memberId))) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this member' } }); return; }
  const result = await getMemberPointsService(memberId);
  res.json({ success: true, data: result });
}

export async function getMemberPointsBreakdownController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { memberId } = req.params;
  if (!(await assertMemberAccess(req, memberId))) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this member' } }); return; }
  const result = await getMemberPointsBreakdownService(memberId);
  res.json({ success: true, data: result });
}

export async function getMemberSpinQuotaController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { memberId } = req.params;
  if (!(await assertMemberAccess(req, memberId))) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this member' } }); return; }
  const result = await getMemberSpinQuotaService(memberId);
  res.json({ success: true, data: result });
}

function validationError(res: Response, message: string): void {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
}

/** POST /api/points/ledger — 写入积分流水（消费/推荐） */
export async function postLedgerController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await postLedgerService(req, (req.body || {}) as Record<string, unknown>);
    res.status(201).json({ success: true, data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INVALID_TRANSACTION_TYPE' || msg === 'INVALID_POINTS_EARNED') {
      validationError(res, msg);
      return;
    }
    if (msg === 'MEMBER_NOT_FOUND_FOR_LEDGER') {
      validationError(res, 'Cannot record points: member not found for this order/phone');
      return;
    }
    if (msg === 'INSUFFICIENT_POINTS' || msg === 'INSUFFICIENT_POINTS_NO_ACCOUNT') {
      validationError(res, msg);
      return;
    }
    console.error('[points] postLedger', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

/** POST /api/points/member-activity/add-consumption */
export async function postMemberActivityAddConsumptionController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const result = await postMemberActivityAddConsumptionService(req, (req.body || {}) as Record<string, unknown>);
    res.json({ success: true, data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'VALIDATION_ERROR') {
      validationError(res, 'phone_number / consumption_points invalid');
      return;
    }
    console.error('[points] add-consumption', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

/** POST /api/points/member-activity/add-referral */
export async function postMemberActivityAddReferralController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const result = await postMemberActivityAddReferralService(req, (req.body || {}) as Record<string, unknown>);
    res.json({ success: true, data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'VALIDATION_ERROR') {
      validationError(res, 'phone_number / referral_points invalid');
      return;
    }
    console.error('[points] add-referral', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

/** POST /api/points/reverse-on-order-cancel */
export async function postReverseOnOrderCancelController(req: Request, res: Response): Promise<void> {
  const { order_id: orderId } = req.body as { order_id: string };
  try {
    const result = await postReverseOnOrderCancelService(orderId);
    res.json({ success: true, data: { success: result.success, error: result.error } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[points] reverse-on-order-cancel', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}
