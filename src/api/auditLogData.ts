/**
 * operation_logs 表代理 + mark-restored 端点
 */

import { apiPost, apiGet } from './client';

export function listOperationLogsData(query: string) {
  return apiGet<unknown>(`/api/data/table/operation_logs${query ? `?${query}` : ''}`);
}

export function markLogRestoredData(logId: string, tenantId?: string) {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  return apiPost<void>(`/api/data/operation-logs/${encodeURIComponent(logId)}/mark-restored${q}`, {});
}
