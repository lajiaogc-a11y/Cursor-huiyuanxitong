/**
 * Task Posters API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost, apiPut, apiDelete } from './client';

export const taskPostersApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown[]>(`/api/task-posters${q}`);
  },
  save: (data: Record<string, unknown>) =>
    apiPost<Record<string, unknown>>('/api/task-posters', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiPut<{ success: boolean }>(`/api/task-posters/${encodeURIComponent(id)}`, data),
  delete: (id: string, params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiDelete<{ success: boolean }>(`/api/task-posters/${encodeURIComponent(id)}${q}`);
  },
};
