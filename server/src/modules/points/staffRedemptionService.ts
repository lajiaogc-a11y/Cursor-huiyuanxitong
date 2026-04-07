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
import { applyMemberActivityDeltasOnConn } from '../members/memberActivityAccount.js';

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
  /** 员工端界面语言，写入 activity_gifts / 积分流水备注，避免中英文错乱 */
  remarkLocale?: 'zh' | 'en';
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
  const remarkLocale = p.remarkLocale === 'zh' ? 'zh' : 'en';
  const remark = buildStaffPointsRedemptionRemark(p.pointsToRedeem, p.giftAmount, p.giftCurrency, remarkLocale);

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

      await applyMemberActivityDeltasOnConn(conn, p.memberId, {
        total_gift_ngn: p.giftCurrency === 'NGN' ? p.giftAmount : 0,
        total_gift_ghs: p.giftCurrency === 'GHS' ? p.giftAmount : 0,
        total_gift_usdt: p.giftCurrency === 'USDT' ? p.giftAmount : 0,
        accumulated_profit: -(p.giftValue || 0),
      }, p.phone || null);
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
