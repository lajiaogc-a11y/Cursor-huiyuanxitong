import {
  fetchMerchantCardsApi,
  fetchMerchantVendorsApi,
  fetchMerchantPaymentProvidersApi,
} from '@/services/giftcards/giftcardsApiService';

export interface MerchantCardRecord {
  id: string;
  name: string;
  type: string;
  status: string;
  remark: string;
  createdAt: string;
  cardVendors: string[];
  sortOrder: number;
}

export interface MerchantVendorRecord {
  id: string;
  name: string;
  status: string;
  remark: string;
  createdAt: string;
  paymentProviders: string[];
  sortOrder: number;
}

export interface MerchantPaymentProviderRecord {
  id: string;
  name: string;
  status: string;
  remark: string;
  createdAt: string;
  sortOrder: number;
}

export async function fetchMerchantCards(tenantId: string): Promise<MerchantCardRecord[]> {
  return fetchMerchantCardsApi(tenantId);
}

export async function fetchMerchantVendors(tenantId: string): Promise<MerchantVendorRecord[]> {
  return fetchMerchantVendorsApi(tenantId);
}

export async function fetchMerchantPaymentProviders(tenantId: string): Promise<MerchantPaymentProviderRecord[]> {
  return fetchMerchantPaymentProvidersApi(tenantId);
}

export async function fetchMerchantConfigSnapshot(tenantId: string) {
  const [cards, vendors, providers] = await Promise.all([
    fetchMerchantCards(tenantId),
    fetchMerchantVendors(tenantId),
    fetchMerchantPaymentProviders(tenantId),
  ]);
  return { cards, vendors, providers };
}
