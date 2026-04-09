/**
 * Giftcards API — tenant-scoped cards / vendors / payment_providers（须传 tenant_id）
 */
import { apiClient } from '@/lib/apiClient';

export interface ApiCard {
  id: string;
  name: string;
  type?: string;
  status: string;
  remark?: string;
  card_vendors?: string[];
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ApiVendor {
  id: string;
  name: string;
  status: string;
  remark?: string;
  payment_providers?: string[];
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ApiPaymentProvider {
  id: string;
  name: string;
  status: string;
  remark?: string;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

/** 所有 giftcards 请求附加 tenant_id，与平台代管「查看租户」一致 */
function withTenant(path: string, tenantId: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}tenant_id=${encodeURIComponent(tenantId)}`;
}

export type CreateCardBody = {
  name: string;
  type?: string;
  status?: string;
  remark?: string;
  card_vendors?: string[];
};

export type CreateVendorBody = {
  name: string;
  status?: string;
  remark?: string;
  payment_providers?: string[];
};

export type CreateProviderBody = { name: string; status?: string; remark?: string };

export const giftcardsApi = {
  cards: {
    list: (tenantId: string, status?: string) => {
      let path = '/api/giftcards/cards';
      if (status) path += `?status=${encodeURIComponent(status)}`;
      return apiClient.get<unknown>(withTenant(path, tenantId));
    },
    getById: (tenantId: string, id: string) =>
      apiClient.get<unknown>(withTenant(`/api/giftcards/cards/${encodeURIComponent(id)}`, tenantId)),
    create: (tenantId: string, body: CreateCardBody) =>
      apiClient.post<unknown>(withTenant('/api/giftcards/cards', tenantId), body),
    update: (tenantId: string, id: string, body: Partial<ApiCard>) =>
      apiClient.put<unknown>(withTenant(`/api/giftcards/cards/${encodeURIComponent(id)}`, tenantId), body),
    delete: (tenantId: string, id: string) =>
      apiClient.delete<unknown>(withTenant(`/api/giftcards/cards/${encodeURIComponent(id)}`, tenantId)),
  },

  vendors: {
    list: (tenantId: string, status?: string) => {
      const base = status
        ? `/api/giftcards/vendors?status=${encodeURIComponent(status)}`
        : '/api/giftcards/vendors';
      return apiClient.get<unknown>(withTenant(base, tenantId));
    },
    getById: (tenantId: string, id: string) =>
      apiClient.get<unknown>(withTenant(`/api/giftcards/vendors/${encodeURIComponent(id)}`, tenantId)),
    create: (tenantId: string, body: CreateVendorBody) =>
      apiClient.post<unknown>(withTenant('/api/giftcards/vendors', tenantId), body),
    update: (tenantId: string, id: string, body: Partial<ApiVendor>) =>
      apiClient.put<unknown>(withTenant(`/api/giftcards/vendors/${encodeURIComponent(id)}`, tenantId), body),
    delete: (tenantId: string, id: string) =>
      apiClient.delete<unknown>(withTenant(`/api/giftcards/vendors/${encodeURIComponent(id)}`, tenantId)),
  },

  providers: {
    list: (tenantId: string, status?: string) => {
      const base = status
        ? `/api/giftcards/providers?status=${encodeURIComponent(status)}`
        : '/api/giftcards/providers';
      return apiClient.get<unknown>(withTenant(base, tenantId));
    },
    getById: (tenantId: string, id: string) =>
      apiClient.get<unknown>(withTenant(`/api/giftcards/providers/${encodeURIComponent(id)}`, tenantId)),
    create: (tenantId: string, body: CreateProviderBody) =>
      apiClient.post<unknown>(withTenant('/api/giftcards/providers', tenantId), body),
    update: (tenantId: string, id: string, body: Partial<ApiPaymentProvider>) =>
      apiClient.put<unknown>(withTenant(`/api/giftcards/providers/${encodeURIComponent(id)}`, tenantId), body),
    delete: (tenantId: string, id: string) =>
      apiClient.delete<unknown>(withTenant(`/api/giftcards/providers/${encodeURIComponent(id)}`, tenantId)),
  },
} as const;
