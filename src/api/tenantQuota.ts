/**
 * Tenant Quota API Client — 纯 HTTP 请求层
 */
import { apiPost } from './client';

export const tenantQuotaApi = {
  check: (body: Record<string, unknown>) =>
    apiPost<unknown>('/api/tenant/quota/check', body),
  getStatus: (body: Record<string, unknown>) =>
    apiPost<unknown>('/api/tenant/quota/status', body),
  list: () =>
    apiPost<unknown[]>('/api/tenant/quota/list', {}),
  set: (body: Record<string, unknown>) =>
    apiPost<unknown>('/api/tenant/quota/set', body),
};
