/**
 * 共享实体查询服务 — 卡片 / 供应商 / 支付渠道的只读列表查询。
 * 租户来自 SharedDataTenantProvider（getSharedDataTenantId），与后台其它租户隔离数据一致。
 */
import {
  listCardsApi as giftListCards,
  listVendorsApi as giftListVendors,
  listPaymentProvidersApi as giftListProviders,
  type ApiCard,
  type ApiVendor,
  type ApiPaymentProvider,
} from '@/services/giftcards/giftcardsApiService';
import { getSharedDataTenantId } from '@/services/finance/sharedDataService';

export type { ApiCard, ApiVendor, ApiPaymentProvider };

export async function listCardsApi(status?: string): Promise<ApiCard[]> {
  const tid = getSharedDataTenantId();
  if (!tid) return [];
  return giftListCards(tid, status);
}

export async function listVendorsApi(status?: string): Promise<ApiVendor[]> {
  const tid = getSharedDataTenantId();
  if (!tid) return [];
  return giftListVendors(tid, status);
}

export async function listPaymentProvidersApi(status?: string): Promise<ApiPaymentProvider[]> {
  const tid = getSharedDataTenantId();
  if (!tid) return [];
  return giftListProviders(tid, status);
}
