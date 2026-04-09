/**
 * Giftcards API Service - 通过 Backend API 操作 cards / vendors / payment_providers（须传 tenant_id）
 */
import { unwrapApiData } from '@/api/client';
import {
  giftcardsApi,
  type ApiCard,
  type ApiVendor,
  type ApiPaymentProvider,
} from '@/api/giftcards';

export type { ApiCard, ApiVendor, ApiPaymentProvider };

function toDateOnly(value: string | null | undefined): string {
  if (!value) return '';
  return value.split('T')[0] || '';
}

// ============= Cards =============
export async function listCardsApi(tenantId: string, status?: string): Promise<ApiCard[]> {
  const res = await giftcardsApi.cards.list(tenantId, status);
  const data = unwrapApiData<ApiCard[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getCardByIdApi(tenantId: string, id: string): Promise<ApiCard | null> {
  const res = await giftcardsApi.cards.getById(tenantId, id);
  const data = unwrapApiData<ApiCard>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function createCardApi(
  tenantId: string,
  body: { name: string; type?: string; status?: string; remark?: string; card_vendors?: string[] },
): Promise<ApiCard | null> {
  const res = await giftcardsApi.cards.create(tenantId, body);
  const data = unwrapApiData<ApiCard>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function updateCardApi(tenantId: string, id: string, body: Partial<ApiCard>): Promise<ApiCard | null> {
  const res = await giftcardsApi.cards.update(tenantId, id, body);
  const data = unwrapApiData<ApiCard>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function deleteCardApi(tenantId: string, id: string): Promise<boolean> {
  await giftcardsApi.cards.delete(tenantId, id);
  return true;
}

// ============= Vendors =============
export async function listVendorsApi(tenantId: string, status?: string): Promise<ApiVendor[]> {
  const res = await giftcardsApi.vendors.list(tenantId, status);
  const data = unwrapApiData<ApiVendor[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getVendorByIdApi(tenantId: string, id: string): Promise<ApiVendor | null> {
  const res = await giftcardsApi.vendors.getById(tenantId, id);
  const data = unwrapApiData<ApiVendor>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function createVendorApi(
  tenantId: string,
  body: { name: string; status?: string; remark?: string; payment_providers?: string[] },
): Promise<ApiVendor | null> {
  const res = await giftcardsApi.vendors.create(tenantId, body);
  const data = unwrapApiData<ApiVendor>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function updateVendorApi(tenantId: string, id: string, body: Partial<ApiVendor>): Promise<ApiVendor | null> {
  const res = await giftcardsApi.vendors.update(tenantId, id, body);
  const data = unwrapApiData<ApiVendor>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function deleteVendorApi(tenantId: string, id: string): Promise<boolean> {
  await giftcardsApi.vendors.delete(tenantId, id);
  return true;
}

// ============= Payment Providers =============
export async function listPaymentProvidersApi(tenantId: string, status?: string): Promise<ApiPaymentProvider[]> {
  const res = await giftcardsApi.providers.list(tenantId, status);
  const data = unwrapApiData<ApiPaymentProvider[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getPaymentProviderByIdApi(tenantId: string, id: string): Promise<ApiPaymentProvider | null> {
  const res = await giftcardsApi.providers.getById(tenantId, id);
  const data = unwrapApiData<ApiPaymentProvider>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function createPaymentProviderApi(
  tenantId: string,
  body: { name: string; status?: string; remark?: string },
): Promise<ApiPaymentProvider | null> {
  const res = await giftcardsApi.providers.create(tenantId, body);
  const data = unwrapApiData<ApiPaymentProvider>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function updatePaymentProviderApi(
  tenantId: string,
  id: string,
  body: Partial<ApiPaymentProvider>,
): Promise<ApiPaymentProvider | null> {
  const res = await giftcardsApi.providers.update(tenantId, id, body);
  const data = unwrapApiData<ApiPaymentProvider>(res);
  return data && typeof data === 'object' ? data : null;
}

export async function deletePaymentProviderApi(tenantId: string, id: string): Promise<boolean> {
  await giftcardsApi.providers.delete(tenantId, id);
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
