/**
 * Webhooks API Client — 纯 HTTP 请求层
 */
import { apiPost } from './client';

export const webhooksApi = {
  enqueue: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/webhooks/enqueue', data),
};
