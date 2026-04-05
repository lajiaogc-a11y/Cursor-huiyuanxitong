/**
 * 会员门户设置模块 — 仅控制器层需要的轻量查询
 */
import { queryOne } from '../../database/index.js';

export async function selectMemberTenantIdByMemberId(
  memberId: string,
): Promise<{ tenant_id: string | null } | null> {
  return queryOne<{ tenant_id: string | null }>(
    'SELECT tenant_id FROM members WHERE id = ? LIMIT 1',
    [memberId],
  );
}
