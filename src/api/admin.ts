/**
 * Admin API Client — 纯 HTTP 请求层
 */
import { apiPost, apiDelete, apiGet } from './client';

export const adminApi = {
  verifyPassword: (data: { password: string }) =>
    apiPost<{ success: boolean }>('/api/admin/verify-password', data),
  bulkDelete: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/admin/bulk-delete', data),
  archiveOrders: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/admin/archive-orders', data),
  archiveMembers: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/admin/archive-members', data),
  deleteOrder: (id: string) =>
    apiDelete<{ success: boolean }>(`/api/admin/orders/${encodeURIComponent(id)}`),
  deleteMember: (id: string) =>
    apiDelete<{ success: boolean }>(`/api/admin/members/${encodeURIComponent(id)}`),
  cleanupWebhookEventQueue: () =>
    apiPost<{ success: boolean }>('/api/admin/webhooks/cleanup-event-queue', {}),

  cleanupWebhookEventQueueWithBody: (body: Record<string, unknown>) =>
    apiPost<{ deleted?: number }>('/api/admin/webhooks/cleanup-event-queue', body),

  backup: {
    run: (body?: Record<string, unknown>) => apiPost<unknown>('/api/admin/backup/run', body ?? {}),
    getTableSnapshot: (backupId: string, tableName: string) =>
      apiGet<unknown>(`/api/admin/backup/${encodeURIComponent(backupId)}/table/${encodeURIComponent(tableName)}`),
    delete: (backupId: string) =>
      apiDelete<{ success: boolean }>(`/api/admin/backup/${encodeURIComponent(backupId)}`),
  },
};
