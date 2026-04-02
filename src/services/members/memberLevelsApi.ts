import { apiClient } from '@/lib/apiClient';

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
  return apiClient.get<MemberLevelRuleDTO[]>(`/api/member-levels?${q.toString()}`);
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
  return apiClient.put<MemberLevelRuleDTO[]>(`/api/member-levels?tenant_id=${encodeURIComponent(tenantId)}`, {
    tenant_id: tenantId,
    rules,
  });
}
