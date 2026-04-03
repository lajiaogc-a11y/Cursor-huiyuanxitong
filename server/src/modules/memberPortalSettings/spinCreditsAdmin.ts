/**
 * 员工端：本租户「抽奖次数」流水（spin_credits + 会员信息）
 */
import { query, queryOne } from '../../database/index.js';

export type SpinCreditsLogRow = {
  id: string;
  member_id: string;
  source: string | null;
  amount: number | string;
  created_at: string;
  phone_number: string | null;
  member_label: string | null;
};

export async function countSpinCreditsForTenant(tenantId: string | null): Promise<number> {
  const r = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM spin_credits sc
     INNER JOIN members m ON m.id = sc.member_id
     WHERE m.tenant_id <=> ?`,
    [tenantId],
  );
  return r?.total ?? 0;
}

export async function listSpinCreditsForTenant(
  tenantId: string | null,
  limit: number,
  offset: number,
): Promise<SpinCreditsLogRow[]> {
  const lim = Math.min(2000, Math.max(1, limit));
  const off = Math.max(0, offset);
  return query<SpinCreditsLogRow>(
    `SELECT sc.id, sc.member_id, sc.source, sc.amount, sc.created_at,
            m.phone_number, COALESCE(m.nickname, m.member_code) AS member_label
     FROM spin_credits sc
     INNER JOIN members m ON m.id = sc.member_id
     WHERE m.tenant_id <=> ?
     ORDER BY sc.created_at DESC
     LIMIT ? OFFSET ?`,
    [tenantId, lim, off],
  );
}
