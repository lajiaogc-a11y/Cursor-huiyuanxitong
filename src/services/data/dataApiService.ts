/**
 * Data API Service - 操作日志、公司文档（通过后端 API 绕过 RLS）
 */
import { knowledgeApi } from '@/api/knowledge';
import { logsApi } from '@/api/logs';

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
  distinctOperators?: string[];
  moduleCounts?: Record<string, number>;
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
  export?: boolean;
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
  if (query.export) params.set('export', '1');
  const flat: Record<string, string> = {};
  params.forEach((v, k) => {
    flat[k] = v;
  });
  const res = await logsApi.getAuditLogs(Object.keys(flat).length ? flat : undefined);
  const raw = res as unknown as Record<string, unknown>;
  const payload = raw?.data ?? raw;
  const p = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {};
  const logs = (Array.isArray(p?.logs) ? p.logs : p?.logs ?? []) as unknown[];
  const totalCount = Number(p?.totalCount ?? 0) || 0;
  const distinctOperators = Array.isArray(p?.distinctOperators) ? (p.distinctOperators as string[]) : [];
  const moduleCounts = (p?.moduleCounts && typeof p.moduleCounts === 'object') ? (p.moduleCounts as Record<string, number>) : {};
  return { logs: logs as OperationLogsResult['logs'], totalCount, distinctOperators, moduleCounts };
}

export async function getKnowledgeCategoriesApi(tenantId?: string | null): Promise<unknown[]> {
  const res = await knowledgeApi.getCategories(
    tenantId ? { tenant_id: tenantId } : undefined,
  );
  const raw = res as unknown as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  return arr as unknown[];
}

export async function getKnowledgeArticlesApi(categoryId: string, tenantId?: string | null): Promise<unknown[]> {
  const res = await knowledgeApi.getArticles(
    categoryId,
    tenantId ? { tenant_id: tenantId } : undefined,
  );
  const raw = res as unknown as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  return arr as unknown[];
}

export interface LoginLogApiRow {
  id: string;
  employee_id: string | null;
  employee_name: string;
  login_time: string;
  ip_address: string | null;
  success: boolean | null;
  failure_reason: string | null;
  user_agent: string | null;
}

export async function getLoginLogsApi(limit?: number, tenantId?: string | null): Promise<LoginLogApiRow[]> {
  const flat: Record<string, string> = {};
  if (limit != null) flat.page_size = String(limit);
  if (tenantId) flat.tenant_id = tenantId;
  const res = await logsApi.getLoginLogs(Object.keys(flat).length ? flat : undefined);
  if (Array.isArray(res)) return res as LoginLogApiRow[];
  const raw = res as Record<string, unknown>;
  if (Array.isArray(raw.rows)) return raw.rows as LoginLogApiRow[];
  if (Array.isArray(raw.data)) return raw.data as LoginLogApiRow[];
  return [];
}
