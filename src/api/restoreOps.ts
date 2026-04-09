/**
 * 操作日志「恢复」流程 — restore 端点 + member/employee 表代理
 */
import { apiPost, apiGet, apiPatch } from './client';

export function restoreOrder(body: unknown) { return apiPost<void>('/api/data/restore/order', body); }
export function restoreActivityGift(body: unknown) { return apiPost<void>('/api/data/restore/activity-gift', body); }
export function restoreCard(body: unknown) { return apiPost<void>('/api/data/restore/card', body); }
export function restoreVendor(body: unknown) { return apiPost<void>('/api/data/restore/vendor', body); }
export function restorePaymentProvider(body: unknown) { return apiPost<void>('/api/data/restore/payment-provider', body); }
export function restoreActivityType(body: unknown) { return apiPost<void>('/api/data/restore/activity-type', body); }
export function restoreCurrency(body: unknown) { return apiPost<void>('/api/data/restore/currency', body); }
export function restoreCustomerSource(body: unknown) { return apiPost<void>('/api/data/restore/customer-source', body); }
export function restoreReferral(body: unknown) { return apiPost<void>('/api/data/restore/referral', body); }

export function getMemberRowData(id: string) {
  return apiGet<unknown>(`/api/data/table/members?select=*&id=eq.${encodeURIComponent(id)}&single=true`);
}

export function createMemberRowData(body: Record<string, unknown>) {
  return apiPost('/api/data/table/members', { data: body });
}

export function patchMemberRowData(id: string, body: Record<string, unknown>) {
  return apiPatch('/api/data/table/members?id=eq.' + encodeURIComponent(id), { data: body });
}
