/**
 * Giftcards API Service - 通过 Backend API 操作 cards / vendors / payment_providers（须传 tenant_id）
 */
import { apiGet, apiPost, apiPut, apiDelete, unwrapApiData } from '@/api/client';

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

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

function toDateOnly(value: string | null | undefined): string {
  if (!value) return '';
  return value.split('T')[0] || '';
}

/** 所有 giftcards 请求附加 tenant_id，与平台代管「查看租户」一致 */
function withTenant(path: string, tenantId: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}tenant_id=${encodeURIComponent(tenantId)}`;
}

// ============= Cards =============
export async function listCardsApi(tenantId: string, status?: string): Promise<ApiCard[]> {
  let path = '/api/giftcards/cards';
  if (status) path += `?status=${encodeURIComponent(status)}`;
  const res = await apiGet<ApiCard[] | ApiResponse<ApiCard[]>>(withTenant(path, tenantId));
  const data = unwrapApiData<ApiCard[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getCardByIdApi(tenantId: string, id: string): Promise<ApiCard | null> {
  const res = await apiGet<ApiCard | ApiResponse<ApiCard>>(
    withTenant(`/api/giftcards/cards/${encodeURIComponent(id)}`, tenantId),
  );
  const data = unwrapApiData<ApiCard>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function createCardApi(
  tenantId: string,
  body: { name: string; type?: string; status?: string; remark?: string; card_vendors?: string[] },
): Promise<ApiCard | null> {
  const res = await apiPost<ApiCard | ApiResponse<ApiCard>>(withTenant('/api/giftcards/cards', tenantId), body);
  const data = unwrapApiData<ApiCard>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function updateCardApi(tenantId: string, id: string, body: Partial<ApiCard>): Promise<ApiCard | null> {
  const res = await apiPut<ApiCard | ApiResponse<ApiCard>>(
    withTenant(`/api/giftcards/cards/${encodeURIComponent(id)}`, tenantId),
    body,
  );
  const data = unwrapApiData<ApiCard>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function deleteCardApi(tenantId: string, id: string): Promise<boolean> {
  await apiDelete(withTenant(`/api/giftcards/cards/${encodeURIComponent(id)}`, tenantId));
  return true;
}

// ============= Vendors =============
export async function listVendorsApi(tenantId: string, status?: string): Promise<ApiVendor[]> {
  const base = status ? `/api/giftcards/vendors?status=${encodeURIComponent(status)}` : '/api/giftcards/vendors';
  const res = await apiGet<ApiVendor[] | ApiResponse<ApiVendor[]>>(withTenant(base, tenantId));
  const data = unwrapApiData<ApiVendor[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getVendorByIdApi(tenantId: string, id: string): Promise<ApiVendor | null> {
  const res = await apiGet<ApiVendor | ApiResponse<ApiVendor>>(
    withTenant(`/api/giftcards/vendors/${encodeURIComponent(id)}`, tenantId),
  );
  const data = unwrapApiData<ApiVendor>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function createVendorApi(
  tenantId: string,
  body: { name: string; status?: string; remark?: string; payment_providers?: string[] },
): Promise<ApiVendor | null> {
  const res = await apiPost<ApiVendor | ApiResponse<ApiVendor>>(withTenant('/api/giftcards/vendors', tenantId), body);
  const data = unwrapApiData<ApiVendor>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function updateVendorApi(tenantId: string, id: string, body: Partial<ApiVendor>): Promise<ApiVendor | null> {
  const res = await apiPut<ApiVendor | ApiResponse<ApiVendor>>(
    withTenant(`/api/giftcards/vendors/${encodeURIComponent(id)}`, tenantId),
    body,
  );
  const data = unwrapApiData<ApiVendor>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function deleteVendorApi(tenantId: string, id: string): Promise<boolean> {
  await apiDelete(withTenant(`/api/giftcards/vendors/${encodeURIComponent(id)}`, tenantId));
  return true;
}

// ============= Payment Providers =============
export async function listPaymentProvidersApi(tenantId: string, status?: string): Promise<ApiPaymentProvider[]> {
  const base = status
    ? `/api/giftcards/providers?status=${encodeURIComponent(status)}`
    : '/api/giftcards/providers';
  const res = await apiGet<ApiPaymentProvider[] | ApiResponse<ApiPaymentProvider[]>>(withTenant(base, tenantId));
  const data = unwrapApiData<ApiPaymentProvider[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getPaymentProviderByIdApi(tenantId: string, id: string): Promise<ApiPaymentProvider | null> {
  const res = await apiGet<ApiPaymentProvider | ApiResponse<ApiPaymentProvider>>(
    withTenant(`/api/giftcards/providers/${encodeURIComponent(id)}`, tenantId),
  );
  const data = unwrapApiData<ApiPaymentProvider>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function createPaymentProviderApi(
  tenantId: string,
  body: { name: string; status?: string; remark?: string },
): Promise<ApiPaymentProvider | null> {
  const res = await apiPost<ApiPaymentProvider | ApiResponse<ApiPaymentProvider>>(
    withTenant('/api/giftcards/providers', tenantId),
    body,
  );
  const data = unwrapApiData<ApiPaymentProvider>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function updatePaymentProviderApi(
  tenantId: string,
  id: string,
  body: Partial<ApiPaymentProvider>,
): Promise<ApiPaymentProvider | null> {
  const res = await apiPut<ApiPaymentProvider | ApiResponse<ApiPaymentProvider>>(
    withTenant(`/api/giftcards/providers/${encodeURIComponent(id)}`, tenantId),
    body,
  );
  const data = unwrapApiData<ApiPaymentProvider>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function deletePaymentProviderApi(tenantId: string, id: string): Promise<boolean> {
  await apiDelete(withTenant(`/api/giftcards/providers/${encodeURIComponent(id)}`, tenantId));
  return true;
}

// ============= Mapped helpers (for merchantConfigReadService compatibility) =============
export async function fetchMerchantCardsApi(tenantId: string): Promise<{
  id: string;
  name: string;
  type: string;
  status: string;
  remark: string;
  createdAt: string;
  cardVendors: string[];
  sortOrder: number;
}[]> {
  const data = await listCardsApi(tenantId);
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type || '',
    status: c.status as 'active' | 'inactive',
    remark: c.remark || '',
    createdAt: toDateOnly(c.created_at),
    cardVendors: c.card_vendors || [],
    sortOrder: c.sort_order || 0,
  }));
}

export async function fetchMerchantVendorsApi(tenantId: string): Promise<{
  id: string;
  name: string;
  status: string;
  remark: string;
  createdAt: string;
  paymentProviders: string[];
  sortOrder: number;
}[]> {
  const data = await listVendorsApi(tenantId);
  return data.map((v) => ({
    id: v.id,
    name: v.name,
    status: v.status as 'active' | 'inactive',
    remark: v.remark || '',
    createdAt: toDateOnly(v.created_at),
    paymentProviders: v.payment_providers || [],
    sortOrder: v.sort_order || 0,
  }));
}

export async function fetchMerchantPaymentProvidersApi(tenantId: string): Promise<{
  id: string;
  name: string;
  status: string;
  remark: string;
  createdAt: string;
  sortOrder: number;
}[]> {
  const data = await listPaymentProvidersApi(tenantId);
  return data.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status as 'active' | 'inactive',
    remark: p.remark || '',
    createdAt: toDateOnly(p.created_at),
    sortOrder: p.sort_order || 0,
  }));
}
