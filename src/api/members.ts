/**
 * 会员 API - hooks 仅通过此层调用
 */
import { apiClient } from '@/lib/apiClient';

export interface ApiMember {
  id: string;
  member_code: string;
  phone_number: string;
  nickname?: string | null;
  tenant_id?: string;
  member_level?: string;
  currency_preferences?: string[] | string;
  bank_card?: string;
  common_cards?: string[] | string;
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
  recorder_id?: string | null;
  creator_id?: string | null;
  created_at?: string;
  updated_at?: string;
  invite_success_lifetime_count?: number | string | null;
  lifetime_reward_points_earned?: number | string | null;
  total_points?: number | string | null;
  current_level_id?: string | null;
}

export interface ApiReferralRelation {
  referrer_phone: string;
  referrer_member_code: string;
  referee_phone: string;
}

export interface CustomerDetailMember {
  id: string;
  phone_number: string;
  member_code: string;
  member_level: string | null;
  /** 与 member_level_rules.level_name_zh 对应，用于中文界面展示 */
  member_level_zh?: string | null;
  common_cards: string[];
  currency_preferences: string[];
  bank_card: string | null;
  customer_feature: string | null;
  source_name: string | null;
  remark: string | null;
  created_at: string;
  recorder_name: string | null;
  referrer_display: string | null;
  /** 累计邀请注册成功人次 */
  invite_success_lifetime_count?: number;
  /** 累计获得奖励积分 */
  lifetime_reward_points_earned?: number;
}

export interface CustomerDetailActivity {
  order_count: number;
  remaining_points: number | null;
  accumulated_profit: number | null;
  accumulated_profit_usdt: number | null;
  total_accumulated_ngn: number | null;
  total_accumulated_ghs: number | null;
  total_accumulated_usdt: number | null;
  referral_count: number;
  consumption_count: number;
}

export interface CustomerDetailResponse {
  member: CustomerDetailMember | null;
  activity: CustomerDetailActivity | null;
}

export interface ListMembersParams {
  tenant_id?: string;
  page?: number;
  limit?: number;
}

export interface CreateMemberBody {
  phone_number: string;
  member_code?: string;
  member_level?: string;
  currency_preferences?: string[];
  bank_card?: string;
  common_cards?: string[];
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
  creator_id?: string | null;
  recorder_id?: string | null;
  /** 平台总管理员创建会员时必填；普通员工由后端 JWT 租户决定，传了也会被忽略 */
  tenant_id?: string | null;
}

export interface UpdateMemberBody {
  member_code?: string;
  current_level_id?: string | null;
  member_level?: string;
  currency_preferences?: string[];
  bank_card?: string;
  common_cards?: string[];
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
  nickname?: string | null;
  /** 推荐人电话或会员编号；null/空串清除。仅当传入该字段时后端会同步 referral_relations */
  referrer_phone?: string | null;
}

export interface BulkCreateMemberItem {
  phone_number: string;
  member_code?: string;
  nickname?: string | null;
  member_level?: string;
  currency_preferences?: string[];
  bank_card?: string;
  common_cards?: string[];
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
  creator_id?: string | null;
}

function unwrapData<T>(res: T | { success?: boolean; data?: T }): T | null {
  if (Array.isArray(res)) return res as T;
  if (res && typeof res === 'object' && 'data' in res) return (res as { data?: T }).data ?? null;
  return res as T;
}

export async function listMembers(params?: ListMembersParams): Promise<ApiMember[]> {
  const q = new URLSearchParams();
  if (params?.tenant_id) q.set('tenant_id', params.tenant_id);
  if (params?.page) q.set('page', String(params.page));
  if (params?.limit) q.set('limit', String(params.limit));
  const query = q.toString();
  const res = await apiClient.get<ApiMember[] | { success?: boolean; data?: ApiMember[] }>(
    `/api/members${query ? `?${query}` : ''}`
  );
  const data = unwrapData(res);
  return Array.isArray(data) ? data : [];
}

export async function getMemberById(id: string): Promise<ApiMember | null> {
  const res = await apiClient.get<ApiMember | { success?: boolean; data?: ApiMember }>(
    `/api/members/${encodeURIComponent(id)}`
  );
  const data = unwrapData(res);
  return data && typeof data === 'object' ? data : null;
}

export async function createMember(body: CreateMemberBody): Promise<ApiMember | null> {
  const res = await apiClient.post<ApiMember | { success?: boolean; data?: ApiMember }>('/api/members', body);
  const data = unwrapData(res);
  return data && typeof data === 'object' ? data : null;
}

export async function updateMember(id: string, body: UpdateMemberBody): Promise<ApiMember | null> {
  const res = await apiClient.put<ApiMember | { success?: boolean; data?: ApiMember }>(
    `/api/members/${encodeURIComponent(id)}`,
    body
  );
  const data = unwrapData(res);
  return data && typeof data === 'object' ? data : null;
}

/**
 * 按手机号更新会员。须传 tenantId：平台超管进入某租户视图时 JWT 无法推断业务租户，query 与 customer-detail 一致。
 * 普通员工传当前租户 id 亦可（后端仍以 JWT 的 tenant_id 为准，忽略越权 query）。
 */
export async function updateMemberByPhone(
  phone: string,
  body: UpdateMemberBody,
  tenantId?: string | null,
): Promise<ApiMember | null> {
  const tid = tenantId != null && String(tenantId).trim() !== "" ? String(tenantId).trim() : "";
  const q = tid ? `?tenant_id=${encodeURIComponent(tid)}` : "";
  const res = await apiClient.put<ApiMember | { success?: boolean; data?: ApiMember }>(
    `/api/members/by-phone/${encodeURIComponent(phone)}${q}`,
    body,
  );
  const data = unwrapData(res);
  return data && typeof data === "object" ? data : null;
}

export async function deleteMember(id: string, tenantId?: string | null): Promise<boolean> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiClient.delete<unknown | { success?: boolean }>(`/api/members/${encodeURIComponent(id)}${q}`);
  if (res && typeof res === 'object' && 'success' in res) return !!(res as { success?: boolean }).success;
  return true;
}

export async function listReferrals(tenantId?: string | null): Promise<ApiReferralRelation[]> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiClient.get<ApiReferralRelation[] | { success?: boolean; data?: ApiReferralRelation[] }>(
    `/api/members/referrals${q}`
  );
  const data = unwrapData(res);
  return Array.isArray(data) ? data : [];
}

export async function getCustomerDetailByPhone(phone: string, tenantId?: string | null): Promise<CustomerDetailResponse> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiClient.get<CustomerDetailResponse | { success?: boolean; data?: CustomerDetailResponse }>(
    `/api/members/customer-detail/${encodeURIComponent(phone)}${q}`
  );
  const data = unwrapData(res);
  return (data && typeof data === 'object') ? data as CustomerDetailResponse : { member: null, activity: null };
}

/** 推荐录入：服务端按租户查会员（电话或会员编号），不依赖前端全量 members 缓存 */
export async function lookupMemberForReferral(
  q: string,
  tenantId: string
): Promise<ApiMember | null> {
  const params = new URLSearchParams();
  params.set('q', q.trim());
  params.set('tenant_id', tenantId);
  try {
    const res = await apiClient.get<ApiMember | null>(
      `/api/members/lookup?${params.toString()}`
    );
    return res && typeof res === 'object' ? (res as ApiMember) : null;
  } catch (e) {
    console.error('[lookupMemberForReferral] failed:', e);
    return null;
  }
}

export async function bulkCreateMembers(
  items: BulkCreateMemberItem[],
  tenantId?: string | null
): Promise<{ id: string; phone_number: string }[] | null> {
  const tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : '';
  const q = tid ? `?tenant_id=${encodeURIComponent(tid)}` : '';
  const res = await apiClient.post<
    { id: string; phone_number: string }[] | { success?: boolean; data?: { id: string; phone_number: string }[] }
  >(`/api/members/bulk${q}`, { members: items });
  const data = unwrapData(res);
  return Array.isArray(data) ? data : null;
}
