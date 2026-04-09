/**
 * Data API Client — 通用表代理 + RPC + 数据操作 (纯 HTTP 请求层)
 *
 * 覆盖 `/api/data/table/*`、`/api/data/rpc/*`、`/api/data/restore/*`、`/api/data/operation-logs/*`
 */
import {
  apiGet, apiPost, apiPatch, apiDelete,
  apiGetAsStaff, apiPostAsStaff,
} from './client';

/**
 * 通用表代理 — `/api/data/table/{table}?{query}`
 * 所有调用者不再需要自己拼 `/api/data/table/` 前缀。
 */
export const dataTableApi = {
  get: <T = unknown>(table: string, query?: string) =>
    apiGet<T>(`/api/data/table/${table}${query ? `?${query}` : ''}`),

  post: <T = unknown>(table: string, body: unknown) =>
    apiPost<T>(`/api/data/table/${table}`, body),

  patch: <T = unknown>(table: string, filter: string, body: unknown) =>
    apiPatch<T>(`/api/data/table/${table}?${filter}`, body),

  del: (table: string, filter: string) =>
    apiDelete(`/api/data/table/${table}?${filter}`),

  getAsStaff: <T = unknown>(table: string, query?: string) =>
    apiGetAsStaff<T>(`/api/data/table/${table}${query ? `?${query}` : ''}`),

  postAsStaff: <T = unknown>(table: string, body: unknown) =>
    apiPostAsStaff<T>(`/api/data/table/${table}`, body),
};

/**
 * 通用 RPC 代理 — `POST /api/data/rpc/{rpcName}`
 */
export const dataRpcApi = {
  call: <T = unknown>(name: string, params?: unknown) =>
    apiPost<T>(`/api/data/rpc/${name}`, params ?? {}),
};

/**
 * 数据操作接口 — restore / operation-logs / migration / archive 等
 */
export const dataOpsApi = {
  markLogRestored: (logId: string, tenantId?: string) => {
    const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
    return apiPost<void>(`/api/data/operation-logs/${encodeURIComponent(logId)}/mark-restored${q}`, {});
  },
  restoreOrder: (body: unknown) => apiPost<void>('/api/data/restore/order', body),
  restoreActivityGift: (body: unknown) => apiPost<void>('/api/data/restore/activity-gift', body),
  restoreCard: (body: unknown) => apiPost<void>('/api/data/restore/card', body),
  restoreVendor: (body: unknown) => apiPost<void>('/api/data/restore/vendor', body),
  restorePaymentProvider: (body: unknown) => apiPost<void>('/api/data/restore/payment-provider', body),
  restoreActivityType: (body: unknown) => apiPost<void>('/api/data/restore/activity-type', body),
  restoreCurrency: (body: unknown) => apiPost<void>('/api/data/restore/currency', body),
  restoreCustomerSource: (body: unknown) => apiPost<void>('/api/data/restore/customer-source', body),
  restoreReferral: (body: unknown) => apiPost<void>('/api/data/restore/referral', body),
  rpcSyncCardTypes: (types: unknown) => apiPost<void>('/api/data/rpc/sync_card_types', { types }),
  rpcArchiveOldData: (retentionDays: number) =>
    apiPost<Record<string, unknown>>('/api/data/rpc/archive_old_data', { retention_days: retentionDays }),
};
