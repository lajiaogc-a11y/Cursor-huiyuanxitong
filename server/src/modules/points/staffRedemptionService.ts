/**
 * Staff points-redemption + activity-gift creation — extracted from RPC handler
 * so it can be shared by the RPC proxy and any future REST endpoint.
 */
import { queryOne, withTransaction } from '../../database/index.js';
import { randomUUID } from 'crypto';
import { applyPointsLedgerDeltaOnConn } from './pointsLedgerAccount.js';
import { syncPointsLog } from './pointsService.js';
import { generateUniqueActivityGiftNumber } from '../../lib/giftNumber.js';
import { buildStaffPointsRedemptionRemark } from '../data/staffPointsRedemptionRemark.js';

export interface StaffRedeemParams {
  memberCode: string;
  phone: string;
  memberId: string;
  pointsToRedeem: number;
  activityType: string;
  giftCurrency: string;
  giftAmount: number;
  giftRate: number;
  giftFee: number;
  giftValue: number;
  paymentAgent: string;
  creatorId: string | null;
}

export interface StaffRedeemAuth {
  callerTenantId: string | undefined;
  isAdmin: boolean | undefined;
  isPlatformSuperAdmin: boolean | undefined;
}

export type StaffRedeemResult =
  | { success: true; ledger_id: string; gift_id: string; points_redeemed: number; points_before: number }
  | { success: false; error: string; current?: number; requested?: number };

export async function executeStaffPointsRedemption(
  p: StaffRedeemParams,
  auth: StaffRedeemAuth,
): Promise<StaffRedeemResult> {
  if (!p.memberId || !Number.isFinite(p.pointsToRedeem) || p.pointsToRedeem <= 0) {
    return { success: false, error: 'INVALID_PARAMS' };
  }

  const memberRow = await queryOne<{ tenant_id: string | null }>(
    'SELECT tenant_id FROM members WHERE id = ?',
    [p.memberId],
  );
  if (!memberRow) return { success: false, error: 'MEMBER_NOT_FOUND' };

  if (
    auth.callerTenantId &&
    memberRow.tenant_id !== auth.callerTenantId &&
    !auth.isAdmin &&
    !auth.isPlatformSuperAdmin
  ) {
    return { success: false, error: 'FORBIDDEN' };
  }

  const acctBal = await queryOne<{ balance: number }>(
    'SELECT balance FROM points_accounts WHERE member_id = ?',
    [p.memberId],
  );
  const curPts = Math.round(Number(acctBal?.balance ?? 0));

  if (curPts <= 0) {
    return { success: false, error: 'NO_POINTS', current: curPts, requested: p.pointsToRedeem };
  }
  if (curPts !== p.pointsToRedeem) {
    return { success: false, error: 'POINTS_MISMATCH', current: curPts, requested: p.pointsToRedeem };
  }

  const txnType =
    p.activityType === 'activity_1' ? 'redeem_activity_1' : 'redeem_activity_2';

  const tenantIdForLedger = memberRow.tenant_id ?? null;
  const remark = buildStaffPointsRedemptionRemark(p.pointsToRedeem, p.giftAmount, p.giftCurrency);

  let ledgerIdOut = '';
  let giftIdOut = '';

  try {
    await withTransaction(async (conn) => {
      const ledgerId = randomUUID();
      ledgerIdOut = ledgerId;
      await applyPointsLedgerDeltaOnConn(conn, {
        ledgerId,
        memberId: p.memberId,
        type: txnType,
        delta: -p.pointsToRedeem,
        description: remark,
        referenceType: 'redemption',
        referenceId: ledgerId,
        createdBy: p.creatorId,
        extras: {
          member_code: p.memberCode || null,
          phone_number: p.phone || null,
          transaction_type: txnType,
          points_earned: -p.pointsToRedeem,
          status: 'issued',
          currency: p.giftCurrency || null,
          creator_id: p.creatorId,
          tenant_id: tenantIdForLedger,
        },
      });
      await syncPointsLog(conn, p.memberId, -p.pointsToRedeem, txnType, remark, tenantIdForLedger);

      const giftId = randomUUID();
      giftIdOut = giftId;
      const gn = await generateUniqueActivityGiftNumber();
      await conn.query(
        `INSERT INTO activity_gifts (
          id, tenant_id, member_id, phone_number, currency, amount, rate, fee, gift_value, gift_type,
          payment_agent, creator_id, gift_number, remark, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(3))`,
        [
          giftId, tenantIdForLedger, p.memberId, p.phone,
          p.giftCurrency, p.giftAmount, p.giftRate, p.giftFee, p.giftValue, p.activityType,
          p.paymentAgent, p.creatorId, gn, remark,
        ],
      );

      const ngnAdd = p.giftCurrency === 'NGN' ? p.giftAmount : 0;
      const ghsAdd = p.giftCurrency === 'GHS' ? p.giftAmount : 0;
      const usdtAdd = p.giftCurrency === 'USDT' ? p.giftAmount : 0;

      const [maRows] = await conn.query(
        'SELECT id FROM member_activity WHERE member_id = ? LIMIT 1',
        [p.memberId],
      );
      const maList = maRows as { id: string }[];
      if (maList.length > 0) {
        await conn.query(
          `UPDATE member_activity SET
            total_gift_ngn = total_gift_ngn + ?,
            total_gift_ghs = total_gift_ghs + ?,
            total_gift_usdt = total_gift_usdt + ?,
            accumulated_profit = GREATEST(accumulated_profit - ?, 0),
            updated_at = NOW(3)
           WHERE member_id = ?`,
          [ngnAdd, ghsAdd, usdtAdd, p.giftValue, p.memberId],
        );
      } else {
        const newMaId = randomUUID();
        await conn.query(
          `INSERT INTO member_activity (
            id, member_id, phone_number, order_count, remaining_points,
            accumulated_profit, accumulated_profit_usdt,
            total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt,
            referral_count, accumulated_points, referral_points,
            total_gift_ngn, total_gift_ghs, total_gift_usdt,
            created_at, updated_at
          ) VALUES (?, ?, ?, 0, 0, GREATEST(0 - ?, 0), 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, NOW(3), NOW(3))`,
          [newMaId, p.memberId, p.phone || null, p.giftValue, ngnAdd, ghsAdd, usdtAdd],
        );
      }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('INSUFFICIENT_POINTS')) {
      return { success: false, error: 'POINTS_MISMATCH', current: curPts, requested: p.pointsToRedeem };
    }
    console.error('[staffRedemptionService] redeem_points_and_record', e);
    return { success: false, error: msg || 'REDEEM_FAILED' };
  }

  return {
    success: true,
    ledger_id: ledgerIdOut,
    gift_id: giftIdOut,
    points_redeemed: p.pointsToRedeem,
    points_before: curPts,
  };
}
