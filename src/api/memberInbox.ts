/**
 * Member Inbox API Client — 纯 HTTP 请求层
 * 覆盖 /api/member-inbox/* 系列端点
 */
import { apiGet, apiPost, apiDelete } from './client';

export const memberInboxApi = {
  list: (params?: Record<string, string | number>) => {
    const sp = new URLSearchParams();
    if (params) for (const [k, v] of Object.entries(params)) sp.set(k, String(v));
    const q = sp.toString();
    return apiGet<unknown>(`/api/member-inbox/notifications${q ? `?${q}` : ''}`);
  },
  getUnreadCount: () =>
    apiGet<unknown>('/api/member-inbox/unread-count'),
  markRead: (id: string) =>
    apiPost<unknown>(`/api/member-inbox/notifications/${encodeURIComponent(id)}/read`, {}),
  markAllRead: () =>
    apiPost<unknown>('/api/member-inbox/notifications/read-all', {}),
  del: (id: string) =>
    apiDelete<unknown>(`/api/member-inbox/notifications/${encodeURIComponent(id)}`),
};
