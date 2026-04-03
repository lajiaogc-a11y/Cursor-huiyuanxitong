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
  member_code: string | null;
};

export type CheckInsAdminFilter = {
  phone?: string;
  memberCode?: string;
};

function checkInsMemberFilterSql(opts?: CheckInsAdminFilter): { clause: string; params: unknown[] } {
  const p = opts?.phone?.trim();
  const m = opts?.memberCode?.trim();
  if (!p && !m) return { clause: '', params: [] };
  const parts: string[] = [];
  const params: unknown[] = [];
  if (p) {
    parts.push('m.phone_number LIKE ?');
    params.push(`%${p}%`);
  }
  if (m) {
    parts.push('(m.member_code LIKE ? OR CAST(m.id AS CHAR) LIKE ?)');
    params.push(`%${m}%`, `%${m}%`);
  }
  return { clause: ` AND (${parts.join(' AND ')})`, params };
}

export async function countCheckInsForTenant(tenantId: string | null, opts?: CheckInsAdminFilter): Promise<number> {
  const { clause, params } = checkInsMemberFilterSql(opts);
  const r = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt
     FROM check_ins c
     INNER JOIN members m ON m.id = c.member_id
     WHERE m.tenant_id <=> ?${clause}`,
    [tenantId, ...params],
  );
  return r?.cnt ?? 0;
}

export async function listCheckInsForTenant(
  tenantId: string | null,
  limit: number,
  offset: number,
  opts?: CheckInsAdminFilter,
): Promise<CheckInLogRow[]> {
  const lim = Math.min(2000, Math.max(1, limit));
  const off = Math.max(0, offset);
  const { clause, params } = checkInsMemberFilterSql(opts);
  return query<CheckInLogRow>(
    `SELECT c.id, c.member_id, c.check_in_date, c.streak, c.points_awarded, c.created_at,
            m.nickname, m.phone_number, NULLIF(TRIM(m.member_code), '') AS member_code
     FROM check_ins c
     INNER JOIN members m ON m.id = c.member_id
     WHERE m.tenant_id <=> ?${clause}
     ORDER BY c.check_in_date DESC, c.created_at DESC
     LIMIT ? OFFSET ?`,
    [tenantId, ...params, lim, off],
  );
}
