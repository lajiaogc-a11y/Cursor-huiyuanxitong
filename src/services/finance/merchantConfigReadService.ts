import {
  fetchMerchantCardsApi,
  fetchMerchantVendorsApi,
  fetchMerchantPaymentProvidersApi,
} from '@/services/giftcards/giftcardsApiService';

export interface MerchantCardRecord {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
  cardVendors: string[];
  sortOrder: number;
}

export interface MerchantVendorRecord {
  id: string;
  name: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
  paymentProviders: string[];
  sortOrder: number;
}

export interface MerchantPaymentProviderRecord {
  id: string;
  name: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
  sortOrder: number;
}

export async function fetchMerchantCards(): Promise<MerchantCardRecord[]> {
  return fetchMerchantCardsApi();
}

export async function fetchMerchantVendors(): Promise<MerchantVendorRecord[]> {
  return fetchMerchantVendorsApi();
}

export async function fetchMerchantPaymentProviders(): Promise<MerchantPaymentProviderRecord[]> {
  return fetchMerchantPaymentProvidersApi();
}

export async function fetchMerchantConfigSnapshot() {
  const [cards, vendors, providers] = await Promise.all([
    fetchMerchantCards(),
    fetchMerchantVendors(),
    fetchMerchantPaymentProviders(),
  ]);
  return { cards, vendors, providers };
}
