/**
 * 会员 API - hooks 仅通过此层调用
 */
import { apiClient } from '@/lib/apiClient';

export interface ApiMember {
  id: string;
  member_code: string;
  phone_number: string;
  tenant_id?: string;
  member_level?: string;
  currency_preferences?: string[];
  bank_card?: string;
  common_cards?: string[];
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
  recorder_id?: string | null;
  creator_id?: string | null;
  created_at?: string;
  updated_at?: string;
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
  common_cards: string[];
  currency_preferences: string[];
  bank_card: string | null;
  customer_feature: string | null;
  source_name: string | null;
  remark: string | null;
  created_at: string;
  recorder_name: string | null;
  referrer_display: string | null;
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
}

export interface UpdateMemberBody {
  member_level?: string;
  currency_preferences?: string[];
  bank_card?: string;
  common_cards?: string[];
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
}

export interface BulkCreateMemberItem {
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

export async function updateMemberByPhone(phone: string, body: UpdateMemberBody): Promise<ApiMember | null> {
  const res = await apiClient.put<ApiMember | { success?: boolean; data?: ApiMember }>(
    `/api/members/by-phone/${encodeURIComponent(phone)}`,
    body
  );
  const data = unwrapData(res);
  return data && typeof data === 'object' ? data : null;
}

export async function deleteMember(id: string): Promise<boolean> {
  const res = await apiClient.delete<unknown | { success?: boolean }>(`/api/members/${encodeURIComponent(id)}`);
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

export async function bulkCreateMembers(
  items: BulkCreateMemberItem[]
): Promise<{ id: string }[] | null> {
  const res = await apiClient.post<{ id: string }[] | { success?: boolean; data?: { id: string }[] }>(
    '/api/members/bulk',
    { members: items }
  );
  const data = unwrapData(res);
  return Array.isArray(data) ? data : null;
}
