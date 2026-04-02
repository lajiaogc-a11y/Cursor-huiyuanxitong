/**
 * 员工端：本租户签到流水（check_ins + 会员信息）
 */
import { query, queryOne } from '../../database/index.js';

export type CheckInLogRow = {
  id: string;
  member_id: string;
  check_in_date: string;
  streak: number | null;
  points_awarded: number | string | null;
  created_at: string;
  nickname: string | null;
  phone_number: string | null;
};

export async function countCheckInsForTenant(tenantId: string | null): Promise<number> {
  const r = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt
     FROM check_ins c
     INNER JOIN members m ON m.id = c.member_id
     WHERE m.tenant_id <=> ?`,
    [tenantId],
  );
  return r?.cnt ?? 0;
}

export async function listCheckInsForTenant(
  tenantId: string | null,
  limit: number,
  offset: number,
): Promise<CheckInLogRow[]> {
  const lim = Math.min(2000, Math.max(1, limit));
  const off = Math.max(0, offset);
  return query<CheckInLogRow>(
    `SELECT c.id, c.member_id, c.check_in_date, c.streak, c.points_awarded, c.created_at,
            m.nickname, m.phone_number
     FROM check_ins c
     INNER JOIN members m ON m.id = c.member_id
     WHERE m.tenant_id <=> ?
     ORDER BY c.check_in_date DESC, c.created_at DESC
     LIMIT ? OFFSET ?`,
    [tenantId, lim, off],
  );
}
