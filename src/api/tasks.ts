/**
 * Tasks API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost, apiPatch } from './client';

export const tasksApi = {
  getProgressList: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown[]>(`/api/tasks/progress-list${q}`);
  },
  getMyItems: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown[]>(`/api/tasks/my-items${q}`);
  },
  updateItemRemark: (itemId: string, data: Record<string, unknown>) =>
    apiPatch<{ success: boolean }>(`/api/tasks/items/${encodeURIComponent(itemId)}/remark`, data),
  markItemDone: (itemId: string, data?: Record<string, unknown>) =>
    apiPost<{ success: boolean }>(`/api/tasks/items/${encodeURIComponent(itemId)}/done`, data ?? {}),
  logCopy: (itemId: string, data?: Record<string, unknown>) =>
    apiPost<{ success: boolean }>(`/api/tasks/items/${encodeURIComponent(itemId)}/log-copy`, data ?? {}),
  generateCustomerList: (data: Record<string, unknown>) =>
    apiPost<unknown>('/api/tasks/generate-customer-list', data),
  create: (data: Record<string, unknown>) =>
    apiPost<unknown>('/api/tasks/create', data),
  createPoster: (data: Record<string, unknown>) =>
    apiPost<unknown>('/api/tasks/create-poster', data),
  getOpen: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown[]>(`/api/tasks/open${q}`);
  },
  close: (id: string, data?: Record<string, unknown>) =>
    apiPost<{ success: boolean }>(`/api/tasks/${encodeURIComponent(id)}/close`, data ?? {}),
};
