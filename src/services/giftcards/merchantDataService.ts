/**
 * Merchant Data Service — 商家基础数据（卡片/卡商/代付商）获取
 *
 * 架构: Context/Hook → Service(此文件) → API(@/services/giftcards/giftcardsApiService)
 *
 * 从 hooks/useMerchantConfig 中提取的纯数据获取函数，
 * 供 AuthContext prefetch 和 hooks 共用，消除 Context → Hook 的反向依赖。
 */
import { getSharedDataTenantId } from '@/services/finance/sharedDataService';
import {
  listCardsApi,
  listVendorsApi,
  listPaymentProvidersApi,
  type ApiCard,
  type ApiVendor,
  type ApiPaymentProvider,
} from '@/services/giftcards/giftcardsApiService';

export interface CardItem {
  id: string;
  name: string;
  type: string;
  status: string;
  remark: string;
  cardVendors: string[];
  sortOrder: number;
}

export interface Vendor {
  id: string;
  name: string;
  status: string;
  remark: string;
  paymentProviders: string[];
  sortOrder: number;
}

export interface PaymentProvider {
  id: string;
  name: string;
  status: string;
  remark: string;
  sortOrder: number;
}

function mapCard(c: ApiCard): CardItem {
  return {
    id: c.id,
    name: c.name,
    type: c.type || '',
    status: c.status,
    remark: c.remark || '',
    cardVendors: c.card_vendors || [],
    sortOrder: c.sort_order || 0,
  };
}

function mapVendor(v: ApiVendor): Vendor {
  return {
    id: v.id,
    name: v.name,
    status: v.status,
    remark: v.remark || '',
    paymentProviders: v.payment_providers || [],
    sortOrder: v.sort_order || 0,
  };
}

function mapProvider(p: ApiPaymentProvider): PaymentProvider {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    remark: p.remark || '',
    sortOrder: p.sort_order || 0,
  };
}

export async function fetchCardsFromDb(): Promise<CardItem[]> {
  const tid = getSharedDataTenantId();
  if (!tid) return [];
  try {
    const rows = await listCardsApi(tid);
    return rows.map(mapCard).sort((a, b) => a.sortOrder - b.sortOrder);
  } catch (e) {
    console.error('[merchantDataService] fetchCardsFromDb failed:', e);
    return [];
  }
}

export async function fetchVendorsFromDb(): Promise<Vendor[]> {
  const tid = getSharedDataTenantId();
  if (!tid) return [];
  try {
    const rows = await listVendorsApi(tid);
    return rows.map(mapVendor).sort((a, b) => a.sortOrder - b.sortOrder);
  } catch (e) {
    console.error('[merchantDataService] fetchVendorsFromDb failed:', e);
    return [];
  }
}

export async function fetchPaymentProvidersFromDb(): Promise<PaymentProvider[]> {
  const tid = getSharedDataTenantId();
  if (!tid) return [];
  try {
    const rows = await listPaymentProvidersApi(tid);
    return rows.map(mapProvider).sort((a, b) => a.sortOrder - b.sortOrder);
  } catch (e) {
    console.error('[merchantDataService] fetchPaymentProvidersFromDb failed:', e);
    return [];
  }
}
