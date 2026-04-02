/**
 * 会员端：积分流水查询（全部 / 消费 / 推广 / 抽奖），包含正负变动与变动前后余额。
 */
import { query, queryOne } from '../../database/index.js';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';

export type MemberLedgerCategory = 'all' | 'consumption' | 'referral' | 'lottery';

export type MemberPointsLedgerHistoryRow = {
  id: string;
  order_id: string | null;
  order_number: string | null;
  reference_id: string | null;
  earned_at: string;
  points: number;
  balance_before: number;
  balance_after: number;
  type: string;
  description: string | null;
};

const MAX_LIMIT = 100;

function categoryWhereSql(category: MemberLedgerCategory): string {
  switch (category) {
    case 'all':
      return '1=1';
    case 'consumption':
      return `(
        pl.type = 'consumption' OR pl.transaction_type = 'consumption'
      )`;
    case 'referral':
      return `(
        pl.type IN ('referral_1', 'referral_2')
        OR pl.transaction_type IN ('referral_1', 'referral_2')
      )`;
    case 'lottery':
      return `(pl.type = 'lottery' OR pl.transaction_type = 'lottery')`;
    default:
      return '1=0';
  }
}

function baseWhere(category: MemberLedgerCategory): string {
  if (category === 'all') {
    return `pl.member_id = ?`;
  }
  return `
  pl.member_id = ?
  AND pl.amount > 0
  AND LOWER(COALESCE(pl.status, 'issued')) = 'issued'
  AND LOWER(COALESCE(pl.reference_type, '')) NOT LIKE 'mall_redemption%'
  AND LOWER(pl.type) NOT LIKE 'redeem%'
  AND LOWER(COALESCE(pl.transaction_type, '')) NOT IN ('redemption')
`;
}

export async function listMemberPointsLedgerHistory(
  memberId: string,
  category: MemberLedgerCategory,
  limit: number,
  offset: number
): Promise<{ rows: MemberPointsLedgerHistoryRow[]; total: number }> {
  const lim = Math.min(Math.max(1, Math.floor(limit || 50)), MAX_LIMIT);
  const off = Math.max(0, Math.floor(offset || 0));
  const catSql = categoryWhereSql(category);
  const bw = baseWhere(category);

  const countRow = await queryOne<{ c: number | string }>(
    `SELECT COUNT(*) AS c FROM points_ledger pl
     WHERE ${bw}
     AND ${catSql}`,
    [memberId]
  );
  const total = Number(countRow?.c ?? 0);

  const raw = await query<{
    id: string;
    amount: number | string | null;
    points_earned: number | string | null;
    balance_after: number | string | null;
    order_id: string | null;
    order_number: string | null;
    reference_id: string | null;
    type: string | null;
    description: string | null;
    created_at: Date | string;
  }>(
    `SELECT pl.id, pl.amount, pl.points_earned, pl.balance_after, pl.order_id, o.order_number,
            pl.reference_id, pl.type, pl.description, pl.created_at
     FROM points_ledger pl
     LEFT JOIN orders o ON o.id = pl.order_id
     WHERE ${bw}
     AND ${catSql}
     ORDER BY pl.created_at DESC
     LIMIT ? OFFSET ?`,
    [memberId, lim, off]
  );

  const rows: MemberPointsLedgerHistoryRow[] = raw.map((r) => {
    const pts = Number(r.points_earned ?? r.amount ?? 0);
    const after = Number(r.balance_after ?? 0);
    const before = Math.round((after - pts) * 100) / 100;
    const earned =
      typeof r.created_at === 'string'
        ? r.created_at
        : r.created_at instanceof Date
          ? toMySqlDatetime(r.created_at)
          : String(r.created_at);
    return {
      id: r.id,
      order_id: r.order_id,
      order_number: r.order_number ? String(r.order_number).trim() : null,
      reference_id: r.reference_id,
      earned_at: earned,
      points: Math.round(pts * 100) / 100,
      balance_before: Math.max(0, before),
      balance_after: Math.max(0, after),
      type: r.type || 'unknown',
      description: r.description || null,
    };
  });

  return { rows, total };
}
