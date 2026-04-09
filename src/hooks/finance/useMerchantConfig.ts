/**
 * useMerchantConfig — 商家配置（卡片、卡商、代付商）的 react-query hooks
 *
 * 架构: Page → Hook(useCards/useVendors/usePaymentProviders) → API Service → Backend
 *
 * 提供:
 *   - useCards / useVendors / usePaymentProviders  (带 CRUD 的 react-query hooks)
 *   - useMerchantConfig (组合 hook，只读)
 *   - fetchCardsFromDb / fetchVendorsFromDb / fetchPaymentProvidersFromDb  (独立 fetch 供 prefetch)
 *   - 类型: CardItem, Vendor, PaymentProvider
 */
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME_LIST_MS } from '@/lib/reactQueryPolicy';
import { getSharedDataTenantId } from '@/services/finance/sharedDataService';
import {
  createCardApi,
  updateCardApi,
  deleteCardApi,
  createVendorApi,
  updateVendorApi,
  deleteVendorApi,
  createPaymentProviderApi,
  updatePaymentProviderApi,
  deletePaymentProviderApi,
} from '@/services/giftcards/giftcardsApiService';
import { logOperation } from '@/services/audit/auditLogService';

// 类型定义已迁移到 services/giftcards/merchantDataService.ts，此处 re-export 保持兼容
export type { CardItem, Vendor, PaymentProvider } from '@/services/giftcards/merchantDataService';

// Legacy aliases used by ExchangeRate.tsx / useMerchantConfig combined hook
export type MerchantCard = CardItem;
export type MerchantVendor = Vendor;
export type MerchantProvider = PaymentProvider;

export interface MerchantConfigResult {
  cardsList: CardItem[];
  vendorsList: Vendor[];
  paymentProvidersList: PaymentProvider[];
  loading: boolean;
  refetch: () => Promise<void>;
}

// --------------- Mappers ---------------

// --------------- Data fetch functions (delegated to service layer) ---------------
// 数据获取函数已迁移到 services/giftcards/merchantDataService.ts
// 此处 re-export 保持 hook 内部和已有消费方的兼容性。
export {
  fetchCardsFromDb,
  fetchVendorsFromDb,
  fetchPaymentProvidersFromDb,
} from '@/services/giftcards/merchantDataService';

import {
  fetchCardsFromDb,
  fetchVendorsFromDb,
  fetchPaymentProvidersFromDb,
} from '@/services/giftcards/merchantDataService';

// --------------- useCards ---------------

export function useCards() {
  const queryClient = useQueryClient();
  const { data: cards = [], isLoading: loading } = useQuery({
    queryKey: ['cards'],
    queryFn: fetchCardsFromDb,
    staleTime: STALE_TIME_LIST_MS,
  });

  const activeCards = cards.filter(c => c.status === 'active');

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['cards'] }),
    [queryClient],
  );

  const addCard = useCallback(async (body: { name: string; type?: string; status?: string; remark?: string; card_vendors?: string[]; cardVendors?: string[] }): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      const apiBody = { ...body, card_vendors: body.cardVendors ?? body.card_vendors };
      delete (apiBody as Record<string, unknown>).cardVendors;
      const created = await createCardApi(tid, apiBody);
      if (created) logOperation('card_management', 'create', created.id, null, body, `新增卡片: ${body.name}`);
      await refetch();
      return true;
    } catch (e) {
      console.error('[useCards] addCard failed:', e);
      return false;
    }
  }, [refetch]);

  const updateCard = useCallback(async (id: string, updates: Record<string, unknown>): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      const before = cards.find(c => c.id === id);
      const apiUpdates: Record<string, unknown> = { ...updates };
      if ('cardVendors' in apiUpdates) {
        apiUpdates.card_vendors = apiUpdates.cardVendors;
        delete apiUpdates.cardVendors;
      }
      if ('sortOrder' in apiUpdates) {
        apiUpdates.sort_order = apiUpdates.sortOrder;
        delete apiUpdates.sortOrder;
      }
      await updateCardApi(tid, id, apiUpdates as Partial<ApiCard>);
      logOperation('card_management', 'update', id, before, updates, `更新卡片: ${(updates.name as string) || before?.name}`);
      await refetch();
      return true;
    } catch (e) {
      console.error('[useCards] updateCard failed:', e);
      return false;
    }
  }, [cards, refetch]);

  const deleteCard = useCallback(async (id: string): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      const before = cards.find(c => c.id === id);
      await deleteCardApi(tid, id);
      if (before) logOperation('card_management', 'delete', id, before, null, `删除卡片: ${before.name}`);
      await refetch();
      return true;
    } catch (e) {
      console.error('[useCards] deleteCard failed:', e);
      return false;
    }
  }, [cards, refetch]);

  const updateCardSortOrders = useCallback(async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      await Promise.all(items.map(item => updateCardApi(tid, item.id, { sort_order: item.sortOrder })));
      await refetch();
      return true;
    } catch (e) {
      console.error('[useCards] updateCardSortOrders failed:', e);
      return false;
    }
  }, [refetch]);

  return { cards, activeCards, loading, addCard, updateCard, deleteCard, updateCardSortOrders, refetch };
}

// --------------- useVendors ---------------

export function useVendors() {
  const queryClient = useQueryClient();
  const { data: vendors = [], isLoading: loading } = useQuery({
    queryKey: ['vendors'],
    queryFn: fetchVendorsFromDb,
    staleTime: STALE_TIME_LIST_MS,
  });

  const activeVendors = vendors.filter(v => v.status === 'active');

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['vendors'] }),
    [queryClient],
  );

  const addVendor = useCallback(async (body: { name: string; status?: string; remark?: string; payment_providers?: string[]; paymentProviders?: string[] }): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      const apiBody = { ...body, payment_providers: body.paymentProviders ?? body.payment_providers };
      delete (apiBody as Record<string, unknown>).paymentProviders;
      const created = await createVendorApi(tid, apiBody);
      if (created) logOperation('vendor_management', 'create', created.id, null, body, `新增卡商: ${body.name}`);
      await refetch();
      return true;
    } catch (e) {
      console.error('[useVendors] addVendor failed:', e);
      return false;
    }
  }, [refetch]);

  const updateVendor = useCallback(async (id: string, updates: Record<string, unknown>): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      const before = vendors.find(v => v.id === id);
      const apiUpdates: Record<string, unknown> = { ...updates };
      if ('paymentProviders' in apiUpdates) {
        apiUpdates.payment_providers = apiUpdates.paymentProviders;
        delete apiUpdates.paymentProviders;
      }
      if ('sortOrder' in apiUpdates) {
        apiUpdates.sort_order = apiUpdates.sortOrder;
        delete apiUpdates.sortOrder;
      }
      await updateVendorApi(tid, id, apiUpdates as Partial<ApiVendor>);
      logOperation('vendor_management', 'update', id, before, updates, `更新卡商: ${(updates.name as string) || before?.name}`);
      await refetch();
      return true;
    } catch (e) {
      console.error('[useVendors] updateVendor failed:', e);
      return false;
    }
  }, [vendors, refetch]);

  const deleteVendor = useCallback(async (id: string): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      const before = vendors.find(v => v.id === id);
      await deleteVendorApi(tid, id);
      if (before) logOperation('vendor_management', 'delete', id, before, null, `删除卡商: ${before.name}`);
      await refetch();
      return true;
    } catch (e) {
      console.error('[useVendors] deleteVendor failed:', e);
      return false;
    }
  }, [vendors, refetch]);

  const updateVendorSortOrders = useCallback(async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      await Promise.all(items.map(item => updateVendorApi(tid, item.id, { sort_order: item.sortOrder })));
      await refetch();
      return true;
    } catch (e) {
      console.error('[useVendors] updateVendorSortOrders failed:', e);
      return false;
    }
  }, [refetch]);

  return { vendors, activeVendors, loading, addVendor, updateVendor, deleteVendor, updateVendorSortOrders, refetch };
}

// --------------- usePaymentProviders ---------------

export function usePaymentProviders() {
  const queryClient = useQueryClient();
  const { data: providers = [], isLoading: loading } = useQuery({
    queryKey: ['payment-providers'],
    queryFn: fetchPaymentProvidersFromDb,
    staleTime: STALE_TIME_LIST_MS,
  });

  const activeProviders = providers.filter(p => p.status === 'active');

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['payment-providers'] }),
    [queryClient],
  );

  const addProvider = useCallback(async (body: { name: string; status?: string; remark?: string }): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      const created = await createPaymentProviderApi(tid, body);
      if (created) logOperation('provider_management', 'create', created.id, null, body, `新增代付商: ${body.name}`);
      await refetch();
      return true;
    } catch (e) {
      console.error('[usePaymentProviders] addProvider failed:', e);
      return false;
    }
  }, [refetch]);

  const updateProvider = useCallback(async (id: string, updates: Record<string, unknown>): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      const before = providers.find(p => p.id === id);
      const apiUpdates: Record<string, unknown> = { ...updates };
      if ('sortOrder' in apiUpdates) {
        apiUpdates.sort_order = apiUpdates.sortOrder;
        delete apiUpdates.sortOrder;
      }
      await updatePaymentProviderApi(tid, id, apiUpdates as Partial<ApiPaymentProvider>);
      logOperation('provider_management', 'update', id, before, updates, `更新代付商: ${(updates.name as string) || before?.name}`);
      await refetch();
      return true;
    } catch (e) {
      console.error('[usePaymentProviders] updateProvider failed:', e);
      return false;
    }
  }, [providers, refetch]);

  const deleteProvider = useCallback(async (id: string): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      const before = providers.find(p => p.id === id);
      await deletePaymentProviderApi(tid, id);
      if (before) logOperation('provider_management', 'delete', id, before, null, `删除代付商: ${before.name}`);
      await refetch();
      return true;
    } catch (e) {
      console.error('[usePaymentProviders] deleteProvider failed:', e);
      return false;
    }
  }, [providers, refetch]);

  const updateProviderSortOrders = useCallback(async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    const tid = getSharedDataTenantId();
    if (!tid) return false;
    try {
      await Promise.all(items.map(item => updatePaymentProviderApi(tid, item.id, { sort_order: item.sortOrder })));
      await refetch();
      return true;
    } catch (e) {
      console.error('[usePaymentProviders] updateProviderSortOrders failed:', e);
      return false;
    }
  }, [refetch]);

  return { providers, activeProviders, loading, addProvider, updateProvider, deleteProvider, updateProviderSortOrders, refetch };
}

// --------------- useMerchantConfig (combined, read-only) ---------------

export function useMerchantConfig(): MerchantConfigResult {
  const [cardsList, setCardsList] = useState<CardItem[]>([]);
  const [vendorsList, setVendorsList] = useState<Vendor[]>([]);
  const [paymentProvidersList, setPaymentProvidersList] = useState<PaymentProvider[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cards, vendors, providers] = await Promise.all([
        fetchCardsFromDb(),
        fetchVendorsFromDb(),
        fetchPaymentProvidersFromDb(),
      ]);
      setCardsList(cards.filter(c => c.status === 'active'));
      setVendorsList(vendors.filter(v => v.status === 'active'));
      setPaymentProvidersList(providers.filter(p => p.status === 'active'));
    } catch (e) {
      console.error('[useMerchantConfig] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { cardsList, vendorsList, paymentProvidersList, loading, refetch: loadData };
}
