/**
 * 数据 API - 操作日志、登录日志、公司文档
 * hooks 仅通过此层调用
 */
import { apiClient } from '@/lib/apiClient';

export interface OperationLogsResult {
  logs: Array<{
    id: string;
    timestamp: string;
    operatorId: string | null;
    operatorAccount: string;
    operatorRole: string;
    module: string;
    operationType: string;
    objectId: string | null;
    objectDescription: string | null;
    beforeData: unknown;
    afterData: unknown;
    ipAddress: string | null;
    isRestored: boolean;
    restoredBy: string | null;
    restoredAt: string | null;
  }>;
  totalCount: number;
}

export interface OperationLogsQuery {
  page?: number;
  pageSize?: number;
  module?: string;
  operationType?: string;
  operatorAccount?: string;
  restoreStatus?: string;
  searchTerm?: string;
  dateStart?: string;
  dateEnd?: string;
  tenantId?: string | null;
}

export interface PostOperationLogParams {
  operatorId?: string | null;
  operatorAccount?: string;
  operatorRole?: string;
  module: string;
  operationType: string;
  objectId?: string | null;
  objectDescription?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | null;
}

export async function postOperationLog(params: PostOperationLogParams): Promise<void> {
  await apiClient.post('/api/data/operation-logs', params);
}

export async function getOperationLogs(query: OperationLogsQuery): Promise<OperationLogsResult> {
  const params = new URLSearchParams();
  if (query.page != null) params.set('page', String(query.page));
  if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
  if (query.module) params.set('module', query.module);
  if (query.operationType) params.set('operationType', query.operationType);
  if (query.operatorAccount) params.set('operatorAccount', query.operatorAccount);
  if (query.restoreStatus) params.set('restoreStatus', query.restoreStatus);
  if (query.searchTerm) params.set('searchTerm', query.searchTerm);
  if (query.dateStart) params.set('dateStart', query.dateStart);
  if (query.dateEnd) params.set('dateEnd', query.dateEnd);
  if (query.tenantId) params.set('tenant_id', query.tenantId);
  const q = params.toString();
  const res = await apiClient.get<unknown>(`/api/logs/audit${q ? `?${q}` : ''}`);
  const raw = res as Record<string, unknown>;
  const payload = raw?.data ?? raw;
  const p = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {};
  const logs = (Array.isArray(p?.logs) ? p.logs : []) as unknown[];
  const totalCount = Number(p?.totalCount ?? 0) || 0;
  return { logs, totalCount };
}

export async function getKnowledgeCategories(tenantId?: string | null): Promise<unknown[]> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiClient.get<unknown>(`/api/knowledge/categories${q}`);
  const raw = res as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  return arr as unknown[];
}

export async function getKnowledgeArticles(categoryId: string, tenantId?: string | null): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenant_id', tenantId);
  const q = params.toString();
  const res = await apiClient.get<unknown>(
    `/api/knowledge/articles/${encodeURIComponent(categoryId)}${q ? `?${q}` : ''}`
  );
  const raw = res as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  return arr as unknown[];
}

export interface KnowledgeCategoryPayload {
  name?: string;
  content_type?: 'text' | 'phrase' | 'image';
  sort_order?: number;
  visibility?: 'public' | 'private';
  is_active?: boolean;
  created_by?: string | null;
  tenant_id?: string | null;
}

export interface KnowledgeArticlePayload {
  category_id?: string;
  title_zh?: string;
  title_en?: string | null;
  content?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order?: number;
  is_published?: boolean;
  visibility?: 'public' | 'private';
  tenant_id?: string | null;
}

export async function createKnowledgeCategory(payload: KnowledgeCategoryPayload): Promise<Record<string, unknown> | null> {
  const res = await apiClient.post<unknown>('/api/data/knowledge/categories', payload);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : raw;
  return (data && typeof data === 'object') ? data : null;
}

export async function updateKnowledgeCategory(id: string, payload: KnowledgeCategoryPayload): Promise<Record<string, unknown> | null> {
  const res = await apiClient.patch<unknown>(`/api/data/knowledge/categories/${encodeURIComponent(id)}`, payload);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : raw;
  return (data && typeof data === 'object') ? data : null;
}

export async function deleteKnowledgeCategory(id: string, tenantId?: string | null): Promise<boolean> {
  const res = await apiClient.delete<{ success?: boolean }>(
    `/api/data/knowledge/categories/${encodeURIComponent(id)}`,
    tenantId ? { tenant_id: tenantId } : undefined
  );
  return !!(res && typeof res === 'object' && (res as { success?: boolean }).success !== false);
}

export async function createKnowledgeArticle(payload: KnowledgeArticlePayload): Promise<Record<string, unknown> | null> {
  const res = await apiClient.post<unknown>('/api/data/knowledge/articles', payload);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : raw;
  return (data && typeof data === 'object') ? data : null;
}

export async function updateKnowledgeArticle(id: string, payload: KnowledgeArticlePayload): Promise<Record<string, unknown> | null> {
  const res = await apiClient.patch<unknown>(`/api/data/knowledge/articles/${encodeURIComponent(id)}`, payload);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : raw;
  return (data && typeof data === 'object') ? data : null;
}

export async function deleteKnowledgeArticle(id: string, tenantId?: string | null): Promise<boolean> {
  const res = await apiClient.delete<{ success?: boolean }>(
    `/api/data/knowledge/articles/${encodeURIComponent(id)}`,
    tenantId ? { tenant_id: tenantId } : undefined
  );
  return !!(res && typeof res === 'object' && (res as { success?: boolean }).success !== false);
}

export async function getKnowledgeReadStatus(): Promise<string[]> {
  const res = await apiClient.get<unknown>('/api/data/knowledge/read-status');
  const raw = res as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  return arr as string[];
}

export async function getKnowledgeUnreadCount(tenantId?: string | null): Promise<number> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiClient.get<unknown>(`/api/data/knowledge/unread-count${q}`);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : raw;
  return Number(data?.unreadCount ?? 0) || 0;
}

export async function postKnowledgeMarkRead(articleId: string): Promise<boolean> {
  const res = await apiClient.post<{ success?: boolean }>('/api/data/knowledge/read-status', { article_id: articleId });
  return !!(res && typeof res === 'object' && (res as { success?: boolean }).success);
}

export async function postKnowledgeMarkAllRead(tenantId?: string | null): Promise<number> {
  const body = tenantId ? { tenant_id: tenantId } : {};
  const res = await apiClient.post<unknown>('/api/data/knowledge/read-status/mark-all', body);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : raw;
  return Number(data?.count ?? 0) || 0;
}

export interface LoginLogRow {
  id: string;
  employee_id: string;
  employee_name: string;
  login_time: string;
  ip_address: string | null;
  ip_location?: string | null;
  success: boolean | null;
  failure_reason: string | null;
  user_agent: string | null;
}

export async function getLoginLogs(limit?: number, tenantId?: string | null): Promise<LoginLogRow[]> {
  const params = new URLSearchParams();
  if (limit != null) params.set('limit', String(limit));
  if (tenantId) params.set('tenant_id', tenantId);
  const q = params.toString();
  const res = await apiClient.get<unknown>(`/api/logs/login${q ? `?${q}` : ''}`);
  const raw = res as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  return arr as LoginLogRow[];
}

export async function getCurrenciesApi(): Promise<Array<{
  id: string;
  code: string;
  name_zh: string;
  name_en?: string | null;
  symbol?: string | null;
  badge_color?: string | null;
  sort_order: number;
  is_active: boolean;
}>> {
  const res = await apiClient.get<unknown>('/api/data/currencies');
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? raw as any[] : ((raw.data as any[]) ?? []);
}

export async function getActivityTypesApi(): Promise<Array<{
  id: string;
  value: string;
  label: string;
  is_active: boolean;
  sort_order: number;
}>> {
  const res = await apiClient.get<unknown>('/api/data/activity-types');
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? raw as any[] : ((raw.data as any[]) ?? []);
}

export async function getCustomerSourcesApi(): Promise<Array<{
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}>> {
  const res = await apiClient.get<unknown>('/api/data/customer-sources');
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? raw as any[] : ((raw.data as any[]) ?? []);
}

export async function getShiftReceiversApi(): Promise<Array<{
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}>> {
  const res = await apiClient.get<unknown>('/api/data/shift-receivers');
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? raw as any[] : ((raw.data as any[]) ?? []);
}

export async function getShiftHandoversApi(tenantId?: string | null): Promise<Array<{
  id: string;
  handover_employee_id: string | null;
  handover_employee_name: string;
  receiver_name: string;
  handover_time: string;
  card_merchant_data: unknown;
  payment_provider_data: unknown;
  remark: string | null;
  created_at: string;
}>> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiClient.get<unknown>(`/api/data/shift-handovers${q}`);
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? raw as any[] : ((raw.data as any[]) ?? []);
}

export async function getAuditRecordsApi(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  tenantId?: string | null;
}): Promise<{ records: any[]; totalCount: number }> {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.status) q.set('status', params.status);
  if (params?.dateFrom) q.set('dateFrom', params.dateFrom);
  if (params?.dateTo) q.set('dateTo', params.dateTo);
  if (params?.tenantId) q.set('tenant_id', params.tenantId);
  const res = await apiClient.get<unknown>(`/api/data/audit-records${q.toString() ? `?${q.toString()}` : ''}`);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : raw;
  return {
    records: Array.isArray(data?.records) ? data.records as any[] : [],
    totalCount: Number(data?.totalCount ?? 0) || 0,
  };
}

export async function getPendingAuditCountApi(tenantId?: string | null): Promise<number> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiClient.get<unknown>(`/api/data/audit-records/pending-count${q}`);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : raw;
  return Number(data?.count ?? 0) || 0;
}

export interface RolePermissionRow {
  id: string;
  role: string;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export async function getRolePermissions(): Promise<RolePermissionRow[]> {
  const res = await apiClient.get<RolePermissionRow[] | { data?: RolePermissionRow[] }>('/api/data/permissions');
  const arr = Array.isArray(res) ? res : (res as { data?: RolePermissionRow[] })?.data ?? [];
  return Array.isArray(arr) ? arr : [];
}

/** 初始化公司文档默认分类（仅管理员可调用） */
export async function seedKnowledgeCategories(): Promise<{ seeded: boolean; count?: number; message?: string }> {
  const res = await apiClient.post<{ seeded?: boolean; count?: number; message?: string }>('/api/data/seed-knowledge');
  const raw = res as Record<string, unknown>;
  const data = raw?.data ?? raw;
  return (data && typeof data === 'object') ? (data as { seeded: boolean; count?: number; message?: string }) : { seeded: false };
}

export async function getIpAccessControlConfig(): Promise<{ enabled?: boolean }> {
  try {
    const res = await apiClient.get<{ enabled?: boolean } | { data?: { enabled?: boolean } }>(
      '/api/data/settings/ip-access-control'
    );
    const data = (res as { data?: { enabled?: boolean } })?.data ?? res;
    return typeof data === 'object' && data ? data : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

export interface NavConfigRow {
  nav_key: string;
  display_text_zh: string;
  display_text_en: string;
  is_visible: boolean;
  sort_order: number;
}

export async function getNavigationConfig(): Promise<NavConfigRow[]> {
  const res = await apiClient.get<NavConfigRow[] | { data?: NavConfigRow[] }>('/api/data/navigation-config');
  const arr = Array.isArray(res) ? res : (res as { data?: NavConfigRow[] })?.data ?? [];
  return Array.isArray(arr) ? arr : [];
}

export async function postNavigationConfig(items: NavConfigRow[]): Promise<boolean> {
  const res = await apiClient.post<{ success?: boolean }>('/api/data/navigation-config', { items });
  return !!(res && typeof res === 'object' && (res as { success?: boolean }).success);
}

export async function getSharedDataApi<T>(dataKey: string, tenantId?: string | null): Promise<T | null> {
  const q = new URLSearchParams();
  q.set('data_key', dataKey);
  if (tenantId) q.set('tenant_id', tenantId);
  const res = await apiClient.get<T | null | { data?: T | null }>(`/api/data/shared-data?${q.toString()}`);
  if (res === null || res === undefined) return null;
  if (typeof res === 'object' && 'data' in res) return (res as { data?: T | null }).data ?? null;
  return res as T | null;
}

export async function postSharedDataApi(dataKey: string, dataValue: unknown, tenantId?: string | null): Promise<boolean> {
  const body = { data_key: dataKey, data_value: dataValue };
  if (tenantId) (body as Record<string, unknown>).tenant_id = tenantId;
  const res = await apiClient.post<{ success?: boolean }>('/api/data/shared-data', body);
  return !!(res && typeof res === 'object' && (res as { success?: boolean }).success);
}

export async function getSharedDataBatchApi(keys: string[], tenantId?: string | null): Promise<Record<string, unknown>> {
  if (keys.length === 0) return {};
  const q = new URLSearchParams();
  q.set('keys', keys.join(','));
  if (tenantId) q.set('tenant_id', tenantId);
  const res = await apiClient.get<Record<string, unknown> | { data?: Record<string, unknown> }>(`/api/data/shared-data/batch?${q.toString()}`);
  const data = (res && typeof res === 'object' && 'data' in res) ? (res as { data?: Record<string, unknown> }).data : res;
  return (data && typeof data === 'object') ? data : {};
}

export interface ActivityDataResult {
  gifts: unknown[];
  referrals: unknown[];
  memberActivities: unknown[];
  pointsLedgerData: unknown[];
  pointsAccountsData: unknown[];
}

export interface ActivityGiftMutationPayload {
  currency?: string;
  amount?: number | string;
  rate?: number | string;
  phone_number?: string;
  payment_agent?: string | null;
  gift_type?: string | null;
  fee?: number | string | null;
  gift_value?: number | string | null;
  remark?: string | null;
  creator_id?: string | null;
  tenant_id?: string | null;
}

export async function getActivityDataApi(tenantId?: string | null): Promise<ActivityDataResult> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiClient.get<ActivityDataResult | { data?: ActivityDataResult }>(`/api/data/activity-data${q}`);
  const data = (res && typeof res === 'object' && 'data' in res) ? (res as { data?: ActivityDataResult }).data : res;
  const d = data && typeof data === 'object' ? data : {};
  return {
    gifts: Array.isArray(d.gifts) ? d.gifts : [],
    referrals: Array.isArray(d.referrals) ? d.referrals : [],
    memberActivities: Array.isArray(d.memberActivities) ? d.memberActivities : [],
    pointsLedgerData: Array.isArray(d.pointsLedgerData) ? d.pointsLedgerData : [],
    pointsAccountsData: Array.isArray(d.pointsAccountsData) ? d.pointsAccountsData : [],
  };
}

export async function patchActivityGiftApi(id: string, payload: ActivityGiftMutationPayload): Promise<Record<string, unknown> | null> {
  const res = await apiClient.patch<unknown>(`/api/data/activity-gifts/${encodeURIComponent(id)}`, payload);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : raw;
  return (data && typeof data === 'object') ? data : null;
}

export async function deleteActivityGiftApi(id: string, tenantId?: string | null): Promise<{ gift: Record<string, unknown> | null; restored_points: number }> {
  const res = await apiClient.delete<unknown>(`/api/data/activity-gifts/${encodeURIComponent(id)}`, tenantId ? { tenant_id: tenantId } : undefined);
  const raw = res as Record<string, unknown>;
  const data = (raw?.data && typeof raw.data === 'object') ? raw.data as Record<string, unknown> : raw;
  return {
    gift: (data?.gift && typeof data.gift === 'object') ? data.gift as Record<string, unknown> : null,
    restored_points: Number(data?.restored_points ?? 0) || 0,
  };
}
