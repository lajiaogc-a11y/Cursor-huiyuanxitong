/**
 * api_keys / api_request_logs 表代理
 */
import { apiGet, apiPost, apiPatch, apiDelete } from './client';


export function listApiKeysData() {
  return apiGet<unknown[]>(`/api/data/table/api_keys?select=*&order=created_at.desc`);
}

export function listApiRequestLogsData(query: string) {
  return apiGet<unknown[]>(`/api/data/table/api_request_logs${query ? `?${query}` : ''}`);
}

export function createApiKeyData(body: Record<string, unknown>) {
  return apiPost('/api/data/table/api_keys', { data: body });
}

export function patchApiKeyData(keyId: string, data: Record<string, unknown>) {
  return apiPatch(`/api/data/table/api_keys?id=eq.${encodeURIComponent(keyId)}`, { data });
}

export function deleteApiKeyData(keyId: string) {
  return apiDelete(`/api/data/table/api_keys?id=eq.${encodeURIComponent(keyId)}`);
}
