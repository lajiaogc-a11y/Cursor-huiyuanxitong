/**
 * Task Posters API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost, apiPut, apiDelete } from './client';

export const taskPostersApi = {
  list: () => apiGet<unknown[]>('/api/task-posters'),
  save: (data: Record<string, unknown>) => apiPost<{ success: boolean }>('/api/task-posters', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiPut<{ success: boolean }>(`/api/task-posters/${encodeURIComponent(id)}`, data),
  delete: (id: string) =>
    apiDelete<{ success: boolean }>(`/api/task-posters/${encodeURIComponent(id)}`),
};
