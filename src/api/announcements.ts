/**
 * Announcements API Client — 纯 HTTP 请求层
 */
import { apiPost } from './client';

export const announcementsApi = {
  publish: (params: Record<string, unknown>) =>
    apiPost<Record<string, unknown>>('/api/data/rpc/publish_system_announcement', params),

  list: (params: { p_limit: number }) =>
    apiPost<unknown[]>('/api/data/rpc/list_system_announcements', params),
};
