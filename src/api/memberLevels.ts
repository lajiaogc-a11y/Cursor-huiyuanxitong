/**
 * Member Levels API Client — 会员等级 HTTP 请求层
 */
import { apiGet, apiPut } from './client';

export interface MemberLevelRuleDTO {
  id: string;
  tenant_id?: string;
  level_name: string;
  /** 中文展示名；可与 level_name 独立配置 */
  level_name_zh: string;
  required_points: number;
  level_order: number;
  rate_bonus?: number | null;
  priority_level?: number | null;
}

export async function fetchMemberLevelsApi(tenantId: string): Promise<MemberLevelRuleDTO[]> {
  const q = new URLSearchParams({ tenant_id: tenantId });
  return apiGet<MemberLevelRuleDTO[]>(`/api/member-levels?${q.toString()}`);
}

export async function saveMemberLevelsApi(
  tenantId: string,
  rules: Array<{
    level_name: string;
    level_name_zh?: string;
    required_points: number;
    level_order: number;
    rate_bonus?: number | null;
    priority_level?: number | null;
  }>,
): Promise<MemberLevelRuleDTO[]> {
  return apiPut<MemberLevelRuleDTO[]>(`/api/member-levels?tenant_id=${encodeURIComponent(tenantId)}`, {
    tenant_id: tenantId,
    rules,
  });
}
