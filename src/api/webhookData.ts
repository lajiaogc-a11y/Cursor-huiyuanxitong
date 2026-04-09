/**
 * webhooks / webhook_delivery_logs 表代理
 */
import { apiGet, apiPost, apiPatch, apiDelete } from './client';


export function listWebhooksData(query: string) {
  return apiGet<unknown[]>(`/api/data/table/webhooks${query ? `?${query}` : ''}`);
}

export function listWebhookDeliveryLogsData(query: string) {
  return apiGet<unknown[]>(`/api/data/table/webhook_delivery_logs${query ? `?${query}` : ''}`);
}

export function createWebhookData(data: Record<string, unknown>) {
  return apiPost('/api/data/table/webhooks', { data });
}

export function patchWebhookData(id: string, data: Record<string, unknown>) {
  return apiPatch(`/api/data/table/webhooks?id=eq.${encodeURIComponent(id)}`, { data });
}

export function deleteWebhookData(id: string) {
  return apiDelete(`/api/data/table/webhooks?id=eq.${encodeURIComponent(id)}`);
}
