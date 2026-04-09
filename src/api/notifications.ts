/**
 * Notifications API Client — 通知 RPC 请求层
 */
import { apiPost } from './client';

export const notificationsApi = {
  markAllRead: () =>
    apiPost<unknown>('/api/data/rpc/mark_all_notifications_read', {}),
};
