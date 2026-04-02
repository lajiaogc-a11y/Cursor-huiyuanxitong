/**
 * 员工端：本租户「抽奖获得积分」流水（points_ledger 中 type/transaction_type 为 lottery）
 */
import { query, queryOne } from '../../database/index.js';

export type LotteryPointsLedgerRow = {
  id: string;
  member_id: string;
  amount: number | string;
  description: string | null;
  created_at: string;
  reference_id: string | null;
  reference_type: string | null;
  nickname: string | null;
  phone_number: string | null;
  member_code: string | null;
  prize_name: string | null;
};

function searchClause(q: string): { sql: string; params: string[] } {
  const s = q.trim().replace(/[%_\\]/g, '');
  if (!s) return { sql: '', params: [] };
  const like = `%${s}%`;
  return {
    sql: ` AND (
      m.phone_number LIKE ? OR
      m.member_code LIKE ? OR
      COALESCE(m.nickname,'') LIKE ?
    )`,
    params: [like, like, like],
  };
}

export async function sumLotteryPointsPositiveForTenant(tenantId: string | null, q: string): Promise<number> {
  const sc = searchClause(q);
  const r = await queryOne<{ s: number | string | null }>(
    `SELECT COALESCE(SUM(GREATEST(pl.amount, 0)), 0) AS s
     FROM points_ledger pl
     INNER JOIN members m ON m.id = pl.member_id
     WHERE m.tenant_id <=> ?
       AND (pl.type = 'lottery' OR pl.transaction_type = 'lottery')
       ${sc.sql}`,
    [tenantId, ...sc.params],
  );
  return Number(r?.s ?? 0);
}

export async function countLotteryPointsRowsForTenant(tenantId: string | null, q: string): Promise<number> {
  const sc = searchClause(q);
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM points_ledger pl
     INNER JOIN members m ON m.id = pl.member_id
     WHERE m.tenant_id <=> ?
       AND (pl.type = 'lottery' OR pl.transaction_type = 'lottery')
       ${sc.sql}`,
    [tenantId, ...sc.params],
  );
  return r?.c ?? 0;
}

export async function listLotteryPointsRowsForTenant(
  tenantId: string | null,
  q: string,
  limit: number,
  offset: number,
): Promise<LotteryPointsLedgerRow[]> {
  const sc = searchClause(q);
  const lim = Math.min(2000, Math.max(1, limit));
  const off = Math.max(0, offset);
  return query<LotteryPointsLedgerRow>(
    `SELECT pl.id, pl.member_id, pl.amount, pl.description, pl.created_at, pl.reference_id, pl.reference_type,
            m.nickname, m.phone_number, m.member_code,
            ll.prize_name AS prize_name
     FROM points_ledger pl
     INNER JOIN members m ON m.id = pl.member_id
     LEFT JOIN lottery_logs ll ON ll.id = pl.reference_id AND pl.reference_type = 'lottery_log'
     WHERE m.tenant_id <=> ?
       AND (pl.type = 'lottery' OR pl.transaction_type = 'lottery')
       ${sc.sql}
     ORDER BY pl.created_at DESC
     LIMIT ? OFFSET ?`,
    [tenantId, ...sc.params, lim, off],
  );
}
