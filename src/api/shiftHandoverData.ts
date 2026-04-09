/**
 * shift_receivers / shift_handovers 表代理
 */
import { apiPost, apiPatch, apiDelete } from './client';


export function createShiftReceiverData(data: Record<string, unknown>) {
  return apiPost<unknown>('/api/data/table/shift_receivers', { data });
}

export function patchShiftReceiverData(id: string, data: Record<string, unknown>) {
  return apiPatch<unknown>(`/api/data/table/shift_receivers?id=eq.${encodeURIComponent(id)}`, { data });
}

export function deleteShiftReceiverData(id: string) {
  return apiDelete(`/api/data/table/shift_receivers?id=eq.${encodeURIComponent(id)}`);
}

export function createShiftHandoverData(data: Record<string, unknown>) {
  return apiPost<unknown>('/api/data/table/shift_handovers', { data });
}
