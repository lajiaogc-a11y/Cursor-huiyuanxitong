/**
 * Points Repository - 唯一可操作 points 相关表的层
 */
import { query, queryOne } from '../../database/index.js';

export async function getMemberPointsRepository(memberId: string) {
  const row = await queryOne<{ balance: number | string | null; frozen_points: number | string | null }>(
    `SELECT COALESCE(balance, 0) AS balance, COALESCE(frozen_points, 0) AS frozen_points FROM points_accounts WHERE member_id = ? LIMIT 1`,
    [memberId],
  );
  const balance = Number(row?.balance ?? 0);
  const frozen = Number(row?.frozen_points ?? 0);
  return { balance, frozen_points: frozen };
}

/** @deprecated 使用 computeMemberPointsBreakdown；保留避免外部直接引用时报错 */
export async function getMemberPointsBreakdownRepository(memberId: string) {
  const rows = await query(
    `SELECT COALESCE(transaction_type, type) AS source, COALESCE(SUM(amount), 0) AS points
     FROM points_ledger
     WHERE member_id = ?
     GROUP BY COALESCE(transaction_type, type)
     ORDER BY source`,
    [memberId],
  );
  return rows;
}

export async function getMemberSpinQuotaRepository(memberId: string) {
  const rows = await query(
    `SELECT COALESCE(SUM(quota), 0) AS spin_quota FROM spin_quotas WHERE member_id = ?`,
    [memberId]
  );
  return rows[0]?.spin_quota ?? 0;
}
