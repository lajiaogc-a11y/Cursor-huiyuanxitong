/**
 * 会员可兑换积分：以 points_accounts.balance 为唯一余额来源；
 * 推广/消费/抽奖拆分为按比例分摊「兑换类扣减」后的展示值，三者之和恒等于 balance。
 */
import { query, queryOne } from '../../database/index.js';

export type MemberPointsBreakdownDto = {
  success: boolean;
  balance: number;
  frozen_points: number;
  /** balance + frozen_points */
  total_points: number;
  consumption_points: number;
  referral_points: number;
  lottery_points: number;
  /** 积分商城待审核兑换单消耗的积分之和（redemptions.status=pending） */
  pending_mall_points: number;
  /** member_activity.referral_count，与员工端活动数据一致 */
  referral_count: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isRedeemLikeRow(
  type: string,
  transactionType: string,
  referenceType: string | null | undefined,
  amount: number
): boolean {
  if (amount >= 0) return false;
  const t = (type || '').toLowerCase();
  const tt = (transactionType || '').toLowerCase();
  const rt = (referenceType || '').toLowerCase();
  if (rt === 'mall_redemption' || rt.startsWith('mall_redemption_')) return true;
  if (t === 'redeem' || t.startsWith('redeem_')) return true;
  if (tt.includes('redeem') || tt === 'redemption') return true;
  return false;
}

function classifyLedgerAmount(
  type: string,
  transactionType: string
): 'consumption' | 'referral' | 'lottery' | 'redeem' | 'other' {
  const t = (type || '').toLowerCase();
  const tt = (transactionType || '').toLowerCase();
  if (t === 'lottery' || tt === 'lottery') return 'lottery';
  if (t === 'consumption' || tt === 'consumption') return 'consumption';
  if (t === 'referral_1' || t === 'referral_2' || tt === 'referral_1' || tt === 'referral_2') return 'referral';
  if (t === 'reversal') {
    if (tt === 'consumption') return 'consumption';
    if (tt === 'referral_1' || tt === 'referral_2') return 'referral';
    if (tt === 'lottery') return 'lottery';
    return 'consumption';
  }
  if (t === 'redeem' || t.startsWith('redeem_') || tt.includes('redeem') || tt === 'redemption') return 'redeem';
  return 'other';
}

export async function computeMemberPointsBreakdown(memberId: string): Promise<MemberPointsBreakdownDto> {
  const balRow = await queryOne<{ balance: number | string | null; frozen_points: number | string | null }>(
    'SELECT COALESCE(balance, 0) AS balance, COALESCE(frozen_points, 0) AS frozen_points FROM points_accounts WHERE member_id = ? LIMIT 1',
    [memberId],
  );
  const balance = round2(Number(balRow?.balance ?? 0));
  const frozenPoints = round2(Number(balRow?.frozen_points ?? 0));

  const rows = await query<{
    type: string;
    transaction_type: string | null;
    amount: number | string;
    reference_type: string | null;
  }>(
    `SELECT type, transaction_type, amount, reference_type
     FROM points_ledger WHERE member_id = ?`,
    [memberId],
  );

  let ec = 0;
  let er = 0;
  let el = 0;
  let eo = 0;

  for (const r of rows) {
    const amt = round2(Number(r.amount));
    const t = String(r.type || '');
    const tt = String(r.transaction_type || '');
    if (isRedeemLikeRow(t, tt, r.reference_type, amt)) {
      continue;
    }
    const bucket = classifyLedgerAmount(t, tt);
    if (bucket === 'lottery') el += amt;
    else if (bucket === 'referral') er += amt;
    else if (bucket === 'consumption') ec += amt;
    else if (bucket === 'redeem') continue;
    else eo += amt;
  }

  const S = ec + er + el + eo;
  let consumption_points = 0;
  let referral_points = 0;
  let lottery_points = 0;

  if (balance <= 0) {
    consumption_points = referral_points = lottery_points = 0;
  } else if (S > 0) {
    consumption_points = round2(balance * (ec / S));
    referral_points = round2(balance * (er / S));
    lottery_points = round2(balance - consumption_points - referral_points);
  } else {
    consumption_points = balance;
  }

  const [pendingRow, actRow] = await Promise.all([
    queryOne<{ s: number | string | null }>(
      `SELECT COALESCE(SUM(points_used), 0) AS s FROM redemptions
       WHERE member_id = ? AND LOWER(TRIM(COALESCE(status, ''))) = 'pending'
         AND (mall_item_id IS NOT NULL OR LOWER(TRIM(COALESCE(type, ''))) = 'mall')`,
      [memberId],
    ),
    queryOne<{ referral_count: number | string | null }>(
      `SELECT COALESCE(referral_count, 0) AS referral_count FROM member_activity WHERE member_id = ? LIMIT 1`,
      [memberId],
    ),
  ]);
  const pendingMallPoints = round2(Number(pendingRow?.s ?? 0));
  const referralCount = Math.max(0, Math.floor(Number(actRow?.referral_count ?? 0)));

  return {
    success: true,
    balance,
    frozen_points: frozenPoints,
    total_points: round2(balance + frozenPoints),
    consumption_points,
    referral_points,
    lottery_points,
    pending_mall_points: pendingMallPoints,
    referral_count: referralCount,
  };
}
