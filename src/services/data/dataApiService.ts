/**
 * Data API Service - 操作日志、公司文档（通过后端 API 绕过 RLS）
 */
import { apiGet } from '@/api/client';

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

export async function getOperationLogsApi(query: OperationLogsQuery): Promise<OperationLogsResult> {
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
  const res = await apiGet<unknown>(`/api/logs/audit${q ? `?${q}` : ''}`);
  const raw = res as Record<string, unknown>;
  const payload = raw?.data ?? raw;
  const p = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {};
  const logs = (Array.isArray(p?.logs) ? p.logs : p?.logs ?? []) as unknown[];
  const totalCount = Number(p?.totalCount ?? p?.totalCount ?? 0) || 0;
  return { logs, totalCount };
}

export async function getKnowledgeCategoriesApi(tenantId?: string | null): Promise<unknown[]> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiGet<unknown>(`/api/knowledge/categories${q}`);
  const raw = res as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  return arr as unknown[];
}

export async function getKnowledgeArticlesApi(categoryId: string, tenantId?: string | null): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenant_id', tenantId);
  const q = params.toString();
  const res = await apiGet<unknown>(
    `/api/knowledge/articles/${encodeURIComponent(categoryId)}${q ? `?${q}` : ''}`
  );
  const raw = res as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  return arr as unknown[];
}

export interface LoginLogApiRow {
  id: string;
  employee_id: string;
  employee_name: string;
  login_time: string;
  ip_address: string | null;
  success: boolean | null;
  failure_reason: string | null;
  user_agent: string | null;
}

export async function getLoginLogsApi(limit?: number, tenantId?: string | null): Promise<LoginLogApiRow[]> {
  const params = new URLSearchParams();
  if (limit != null) params.set('limit', String(limit));
  if (tenantId) params.set('tenant_id', tenantId);
  const q = params.toString();
  const res = await apiGet<unknown>(`/api/logs/login${q ? `?${q}` : ''}`);
  const raw = res as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  return arr as LoginLogApiRow[];
}
