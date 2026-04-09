/**
 * Logs API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost } from './client';

export const logsApi = {
  getAuditLogs: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown[]>(`/api/logs/audit${q}`);
  },
  getLoginLogs: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown[]>(`/api/logs/login${q}`);
  },
  resolveLocations: (data: { ids: string[] }) =>
    apiPost<unknown>('/api/logs/login/resolve-locations', data),
};
