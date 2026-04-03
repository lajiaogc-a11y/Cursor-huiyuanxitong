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
  member_code: string | null;
};

/** 订单完成 / 分享 / 邀请（含注册欢迎） */
export type SpinCreditCategory = 'order' | 'share' | 'invite';

export type SpinCreditsAdminFilter = {
  phone?: string;
  memberCode?: string;
};

function spinCreditsCategorySql(category: SpinCreditCategory): string {
  switch (category) {
    case 'order':
      return `AND sc.source LIKE 'order_completed:%'`;
    case 'share':
      return `AND sc.source = 'share'`;
    case 'invite':
      return `AND sc.source IN ('referral', 'invite_welcome')`;
    default:
      return '';
  }
}

function spinCreditsMemberFilterSql(opts?: SpinCreditsAdminFilter): { clause: string; params: unknown[] } {
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

export async function countSpinCreditsForTenant(
  tenantId: string | null,
  category: SpinCreditCategory,
  opts?: SpinCreditsAdminFilter,
): Promise<number> {
  const cat = spinCreditsCategorySql(category);
  const { clause, params: memParams } = spinCreditsMemberFilterSql(opts);
  const r = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM spin_credits sc
     INNER JOIN members m ON m.id = sc.member_id
     WHERE m.tenant_id <=> ? ${cat}${clause}`,
    [tenantId, ...memParams],
  );
  return r?.total ?? 0;
}

export async function listSpinCreditsForTenant(
  tenantId: string | null,
  limit: number,
  offset: number,
  category: SpinCreditCategory,
  opts?: SpinCreditsAdminFilter,
): Promise<SpinCreditsLogRow[]> {
  const lim = Math.min(2000, Math.max(1, limit));
  const off = Math.max(0, offset);
  const cat = spinCreditsCategorySql(category);
  const { clause, params: memParams } = spinCreditsMemberFilterSql(opts);
  return query<SpinCreditsLogRow>(
    `SELECT sc.id, sc.member_id, sc.source, sc.amount, sc.created_at,
            m.phone_number,
            COALESCE(NULLIF(TRIM(m.nickname), ''), NULLIF(TRIM(m.member_code), ''), CAST(m.id AS CHAR)) AS member_label,
            NULLIF(TRIM(m.member_code), '') AS member_code
     FROM spin_credits sc
     INNER JOIN members m ON m.id = sc.member_id
     WHERE m.tenant_id <=> ? ${cat}${clause}
     ORDER BY sc.created_at DESC
     LIMIT ? OFFSET ?`,
    [tenantId, ...memParams, lim, off],
  );
}
