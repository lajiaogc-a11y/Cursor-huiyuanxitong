/**
 * Webhooks API Client — Webhook 管理 RPC 请求层
 */
import { apiPost } from './client';

export const webhooksApi = {
  testDelivery: (webhookId: string) =>
    apiPost<{ success: boolean; message: string }>('/api/data/rpc/webhook-processor', {
      action: 'test',
      webhookId,
    }),
};
