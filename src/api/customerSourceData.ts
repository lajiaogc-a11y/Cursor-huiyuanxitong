/**
 * customer_sources 表代理 — CRUD
 */
import { apiPost, apiPatch, apiDelete } from './client';


export function createCustomerSourceData(data: Record<string, unknown>) {
  return apiPost<unknown>('/api/data/table/customer_sources', { data });
}

export function patchCustomerSourceData(id: string, data: Record<string, unknown>) {
  return apiPatch<unknown>(`/api/data/table/customer_sources?id=eq.${encodeURIComponent(id)}`, { data });
}

export function deleteCustomerSourceData(id: string) {
  return apiDelete(`/api/data/table/customer_sources?id=eq.${encodeURIComponent(id)}`);
}
