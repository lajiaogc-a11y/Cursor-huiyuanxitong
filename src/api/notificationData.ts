/**
 * Notifications 表代理 — 员工端通知 CRUD
 */
import { apiGet, apiPost, apiPatch, apiDelete } from './client';


export function listNotificationsData<T = unknown>() {
  return apiGet<T>(`/api/data/table/notifications?select=*&order=created_at.desc&limit=50`);
}

export function patchNotificationReadData(id: string) {
  return apiPatch(`/api/data/table/notifications?id=eq.${encodeURIComponent(id)}`, { data: { is_read: true } });
}

export function deleteNotificationData(id: string) {
  return apiDelete(`/api/data/table/notifications?id=eq.${encodeURIComponent(id)}`);
}

export function createNotificationData(body: Record<string, unknown>) {
  return apiPost('/api/data/table/notifications', { data: body });
}
