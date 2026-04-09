/**
 * Orders API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost, apiPatch } from './client';

export interface ApiOrder {
  id: string;
  order_number: string;
  order_type: string;
  amount: number;
  currency: string | null;
  status: string;
  created_at: string;
  [key: string]: unknown;
}

function withParams(path: string, params?: Record<string, string>): string {
  if (!params) return path;
  const q = new URLSearchParams(params).toString();
  return q ? `${path}?${q}` : path;
}

export const ordersApi = {
  list: (params?: Record<string, string>) =>
    apiGet<{ orders: ApiOrder[] }>(withParams('/api/orders', params)),
  getFull: (params?: Record<string, string>) =>
    apiGet<unknown>(withParams('/api/orders/full', params)),
  getUsdtFull: (params?: Record<string, string>) =>
    apiGet<unknown>(withParams('/api/orders/usdt-full', params)),
  getMeikaFiatFull: (params?: Record<string, string>) =>
    apiGet<unknown>(withParams('/api/orders/meika-fiat-full', params)),
  getMeikaUsdtFull: (params?: Record<string, string>) =>
    apiGet<unknown>(withParams('/api/orders/meika-usdt-full', params)),
  create: (data: Record<string, unknown>) => apiPost<unknown>('/api/orders', data),
  updatePoints: (id: string, data: Record<string, unknown>) =>
    apiPatch<unknown>(`/api/orders/${encodeURIComponent(id)}/points`, data),

  patchById: (id: string, data: Record<string, unknown>) =>
    apiPatch<Record<string, unknown> | Record<string, unknown>[]>(
      `/api/data/table/orders?id=eq.${encodeURIComponent(id)}`,
      { data },
    ),
  getDeleteState: (id: string) =>
    apiGet<{ is_deleted?: unknown } | null>(
      `/api/data/table/orders?select=is_deleted&id=eq.${encodeURIComponent(id)}&single=true`,
    ),
};
