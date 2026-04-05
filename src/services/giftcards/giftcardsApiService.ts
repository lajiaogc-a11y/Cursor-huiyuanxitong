/**
 * Giftcards API Service - 通过 Backend API 操作 cards / vendors / payment_providers
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

// ============= Cards =============
export async function listCardsApi(status?: string): Promise<ApiCard[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiGet<ApiCard[] | ApiResponse<ApiCard[]>>(`/api/giftcards/cards${q}`);
  const data = unwrapApiData<ApiCard[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getCardByIdApi(id: string): Promise<ApiCard | null> {
  const res = await apiGet<ApiCard | ApiResponse<ApiCard>>(`/api/giftcards/cards/${encodeURIComponent(id)}`);
  const data = unwrapApiData<ApiCard>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function createCardApi(body: { name: string; type?: string; status?: string; remark?: string; card_vendors?: string[] }): Promise<ApiCard | null> {
  const res = await apiPost<ApiCard | ApiResponse<ApiCard>>('/api/giftcards/cards', body);
  const data = unwrapApiData<ApiCard>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function updateCardApi(id: string, body: Partial<ApiCard>): Promise<ApiCard | null> {
  const res = await apiPut<ApiCard | ApiResponse<ApiCard>>(`/api/giftcards/cards/${encodeURIComponent(id)}`, body);
  const data = unwrapApiData<ApiCard>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function deleteCardApi(id: string): Promise<boolean> {
  await apiDelete(`/api/giftcards/cards/${encodeURIComponent(id)}`);
  return true;
}

// ============= Vendors =============
export async function listVendorsApi(status?: string): Promise<ApiVendor[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiGet<ApiVendor[] | ApiResponse<ApiVendor[]>>(`/api/giftcards/vendors${q}`);
  const data = unwrapApiData<ApiVendor[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getVendorByIdApi(id: string): Promise<ApiVendor | null> {
  const res = await apiGet<ApiVendor | ApiResponse<ApiVendor>>(`/api/giftcards/vendors/${encodeURIComponent(id)}`);
  const data = unwrapApiData<ApiVendor>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function createVendorApi(body: { name: string; status?: string; remark?: string; payment_providers?: string[] }): Promise<ApiVendor | null> {
  const res = await apiPost<ApiVendor | ApiResponse<ApiVendor>>('/api/giftcards/vendors', body);
  const data = unwrapApiData<ApiVendor>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function updateVendorApi(id: string, body: Partial<ApiVendor>): Promise<ApiVendor | null> {
  const res = await apiPut<ApiVendor | ApiResponse<ApiVendor>>(`/api/giftcards/vendors/${encodeURIComponent(id)}`, body);
  const data = unwrapApiData<ApiVendor>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function deleteVendorApi(id: string): Promise<boolean> {
  await apiDelete(`/api/giftcards/vendors/${encodeURIComponent(id)}`);
  return true;
}

// ============= Payment Providers =============
export async function listPaymentProvidersApi(status?: string): Promise<ApiPaymentProvider[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiGet<ApiPaymentProvider[] | ApiResponse<ApiPaymentProvider[]>>(`/api/giftcards/providers${q}`);
  const data = unwrapApiData<ApiPaymentProvider[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getPaymentProviderByIdApi(id: string): Promise<ApiPaymentProvider | null> {
  const res = await apiGet<ApiPaymentProvider | ApiResponse<ApiPaymentProvider>>(`/api/giftcards/providers/${encodeURIComponent(id)}`);
  const data = unwrapApiData<ApiPaymentProvider>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function createPaymentProviderApi(body: { name: string; status?: string; remark?: string }): Promise<ApiPaymentProvider | null> {
  const res = await apiPost<ApiPaymentProvider | ApiResponse<ApiPaymentProvider>>('/api/giftcards/providers', body);
  const data = unwrapApiData<ApiPaymentProvider>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function updatePaymentProviderApi(id: string, body: Partial<ApiPaymentProvider>): Promise<ApiPaymentProvider | null> {
  const res = await apiPut<ApiPaymentProvider | ApiResponse<ApiPaymentProvider>>(`/api/giftcards/providers/${encodeURIComponent(id)}`, body);
  const data = unwrapApiData<ApiPaymentProvider>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function deletePaymentProviderApi(id: string): Promise<boolean> {
  await apiDelete(`/api/giftcards/providers/${encodeURIComponent(id)}`);
  return true;
}

// ============= Mapped helpers (for merchantConfigReadService compatibility) =============
export async function fetchMerchantCardsApi(): Promise<{ id: string; name: string; type: string; status: string; remark: string; createdAt: string; cardVendors: string[]; sortOrder: number }[]> {
  const data = await listCardsApi();
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

export async function fetchMerchantVendorsApi(): Promise<{ id: string; name: string; status: string; remark: string; createdAt: string; paymentProviders: string[]; sortOrder: number }[]> {
  const data = await listVendorsApi();
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

export async function fetchMerchantPaymentProvidersApi(): Promise<{ id: string; name: string; status: string; remark: string; createdAt: string; sortOrder: number }[]> {
  const data = await listPaymentProvidersApi();
  return data.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status as 'active' | 'inactive',
    remark: p.remark || '',
    createdAt: toDateOnly(p.created_at),
    sortOrder: p.sort_order || 0,
  }));
}
