/**
 * Member Analytics / Site Data API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPut, apiPost } from './client';

export const memberAnalyticsApi = {
  getStats: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown>(`/api/member-portal/analytics/stats${q}`);
  },
  getDataCleanupSettings: () =>
    apiGet<unknown>('/api/member-portal/analytics/data-cleanup'),
  updateDataCleanupSettings: (data: Record<string, unknown>) =>
    apiPut<{ success: boolean }>('/api/member-portal/analytics/data-cleanup', data),
  getCleanupPreview: () =>
    apiGet<unknown>('/api/member-portal/analytics/data-cleanup/preview'),
  runCleanup: (data?: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/member-portal/analytics/data-cleanup/run', data ?? {}),
};
