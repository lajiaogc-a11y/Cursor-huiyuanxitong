/**
 * 积分写入业务：供 POST 路由调用
 */
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { queryOne } from '../../database/index.js';
import { reverseActivityDataForOrder } from '../admin/orderReversal.js';
import {
  type LedgerInsertBody,
  type PointsTransactionType,
  findIssuedLedgerDuplicate,
  insertPointsLedgerRow,
  addConsumptionToMemberActivity,
  addReferralToMemberActivity,
} from './writeRepository.js';

export async function resolveTenantIdForPoints(
  req: AuthenticatedRequest,
  orderId: string | null | undefined
): Promise<string | null> {
  if (req.user?.tenant_id) return req.user.tenant_id;
  if (orderId) {
    const row = await queryOne<{ tenant_id: string | null }>(
      `SELECT tenant_id FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    );
    return row?.tenant_id ?? null;
  }
  return null;
}

function parseTransactionType(v: unknown): PointsTransactionType | null {
  if (v === 'consumption' || v === 'referral_1' || v === 'referral_2') return v;
  return null;
}

export async function postLedgerService(
  req: AuthenticatedRequest,
  body: Record<string, unknown>
): Promise<{ id: string | null; skipped: boolean }> {
  const transactionType = parseTransactionType(body.transaction_type);
  if (!transactionType) {
    throw new Error('INVALID_TRANSACTION_TYPE');
  }

  const pointsEarned = Number(body.points_earned);
  if (!Number.isFinite(pointsEarned) || pointsEarned === 0) {
    throw new Error('INVALID_POINTS_EARNED');
  }

  const orderId = body.order_id != null ? String(body.order_id) : null;
  const tenantId = await resolveTenantIdForPoints(req, orderId);

  if (orderId) {
    const dup = await findIssuedLedgerDuplicate(orderId, transactionType);
    if (dup) {
      return { id: null, skipped: true };
    }
  }

  const ledger: LedgerInsertBody = {
    member_code: body.member_code != null ? String(body.member_code) : null,
    phone_number: body.phone_number != null ? String(body.phone_number) : null,
    order_id: orderId,
    transaction_type: transactionType,
    actual_payment: body.actual_payment != null && body.actual_payment !== '' ? Number(body.actual_payment) : null,
    currency: body.currency != null ? String(body.currency) : null,
    exchange_rate: body.exchange_rate != null && body.exchange_rate !== '' ? Number(body.exchange_rate) : null,
    usd_amount: body.usd_amount != null && body.usd_amount !== '' ? Number(body.usd_amount) : null,
    points_multiplier:
      body.points_multiplier != null && body.points_multiplier !== '' ? Number(body.points_multiplier) : null,
    points_earned: pointsEarned,
    status: body.status != null ? String(body.status) : 'issued',
    creator_id: body.creator_id != null ? String(body.creator_id) : null,
  };

  const id = await insertPointsLedgerRow(ledger, tenantId);
  return { id, skipped: false };
}

export async function postMemberActivityAddConsumptionService(
  req: AuthenticatedRequest,
  body: Record<string, unknown>
): Promise<{ updated: boolean }> {
  const phone = body.phone_number != null ? String(body.phone_number) : '';
  const pts = Number(body.consumption_points);
  if (!phone || !Number.isFinite(pts) || pts <= 0) {
    throw new Error('VALIDATION_ERROR');
  }
  const tenantId = await resolveTenantIdForPoints(req, null);
  return addConsumptionToMemberActivity(phone, pts, tenantId);
}

export async function postMemberActivityAddReferralService(
  req: AuthenticatedRequest,
  body: Record<string, unknown>
): Promise<{ updated: boolean }> {
  const phone = body.phone_number != null ? String(body.phone_number) : '';
  const pts = Number(body.referral_points);
  if (!phone || !Number.isFinite(pts) || pts <= 0) {
    throw new Error('VALIDATION_ERROR');
  }
  const tenantId = await resolveTenantIdForPoints(req, null);
  return addReferralToMemberActivity(phone, pts, tenantId);
}

export async function postReverseOnOrderCancelService(orderId: string): Promise<{ success: boolean; error?: string }> {
  const r = await reverseActivityDataForOrder(orderId);
  return { success: r.ok, error: r.error };
}
