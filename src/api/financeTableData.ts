/**
 * Finance 相关表代理 — orders / ledger_transactions /
 * member_activity / shared_data_store / card_types
 */
import { apiGet, apiPost, apiPatch, apiDelete } from './client';


// ---- orders ----
export function listOrdersData(query: string) {
  return apiGet<unknown[]>(`/api/data/table/orders${query ? `?${query}` : ''}`);
}

// ---- ledger_transactions ----
export function listLedgerTransactionsData(query: string) {
  return apiGet<unknown[]>(`/api/data/table/ledger_transactions${query ? `?${query}` : ''}`);
}

export function patchLedgerTransactionsInBatch(inList: string, data: Record<string, unknown>) {
  return apiPatch(`/api/data/table/ledger_transactions?id=in.(${inList})`, { data });
}

// ---- member_activity ----
export function getMemberActivityData(query: string) {
  return apiGet<unknown>(`/api/data/table/member_activity${query ? `?${query}` : ''}`);
}

export function patchMemberActivityData(id: string, data: Record<string, unknown>) {
  return apiPatch(`/api/data/table/member_activity?id=eq.${encodeURIComponent(id)}`, { data });
}

// ---- shared_data_store ----
export function deleteSharedDataRow(filter: string) {
  return apiDelete(`/api/data/table/shared_data_store?${filter}`);
}

// ---- card_types ----
export function listCardTypeNamesData() {
  return apiGet<{ name?: string }[]>(`/api/data/table/card_types?select=name&order=sort_order.asc`);
}

// ---- generic queries (for reconcile service) ----
export function queryTable<T = unknown>(table: string, query: string) {
  return apiGet<T>(`/api/data/table/${table}${query ? `?${query}` : ''}`);
}

export function insertTableRows(table: string, rows: Record<string, unknown>[]) {
  return apiPost(`/api/data/table/${table}`, { data: rows });
}

export function deleteTableRows(table: string, filter: string) {
  return apiDelete(`/api/data/table/${table}?${filter}`);
}
