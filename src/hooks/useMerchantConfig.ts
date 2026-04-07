// ============= Merchant Config Hook - react-query Migration =============
// react-query 缓存确保页面切换不重复请求；卡商数据按当前生效租户隔离
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notify } from "@/lib/notifyHub";
import { logOperation } from '@/services/audit/auditLogService';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { getPlatformTenantId } from '@/services/auth/authApiService';
import { fetchMerchantCards, fetchMerchantVendors, fetchMerchantPaymentProviders } from '@/services/finance/merchantConfigReadService';
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
import { logger } from '@/lib/logger';

/** 与 SharedDataTenantProvider 一致：平台「进入租户」后代管该租户卡商配置 */
function useGiftcardsTenantId(): string | null {
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  return viewingTenantId || employee?.tenant_id || getPlatformTenantId() || null;
}

export interface CardItem {
  id: string;
  name: string;
  type: string;
  status: string;
  remark: string;
  createdAt: string;
  cardVendors?: string[];
  sortOrder?: number;
}

export interface Vendor {
  id: string;
  name: string;
  status: string;
  remark: string;
  createdAt: string;
  paymentProviders?: string[];
  sortOrder?: number;
}

export interface PaymentProvider {
  id: string;
  name: string;
  status: string;
  remark: string;
  createdAt: string;
  sortOrder?: number;
}

// ============= Standalone fetch functions =============
export async function fetchCardsFromDb(tenantId: string): Promise<CardItem[]> {
  const rows = await fetchMerchantCards(tenantId);
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    status: c.status,
    remark: c.remark,
    createdAt: c.createdAt,
    cardVendors: c.cardVendors,
    sortOrder: c.sortOrder,
  }));
}

export async function fetchVendorsFromDb(tenantId: string): Promise<Vendor[]> {
  const rows = await fetchMerchantVendors(tenantId);
  return rows.map((v) => ({
    id: v.id,
    name: v.name,
    status: v.status,
    remark: v.remark,
    createdAt: v.createdAt,
    paymentProviders: v.paymentProviders,
    sortOrder: v.sortOrder,
  }));
}

export async function fetchPaymentProvidersFromDb(tenantId: string): Promise<PaymentProvider[]> {
  const rows = await fetchMerchantPaymentProviders(tenantId);
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    remark: p.remark,
    createdAt: p.createdAt,
    sortOrder: p.sortOrder,
  }));
}

// ============= Cards Hook =============
export function useCards() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const tenantId = useGiftcardsTenantId();

  const { data: cards = [], isLoading: loading } = useQuery({
    queryKey: ['cards', tenantId],
    queryFn: () => fetchCardsFromDb(tenantId!),
    enabled: !!tenantId,
  });

  // 轮询替代 Realtime 订阅：每 30 秒刷新
  useEffect(() => {
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['cards', tenantId] });
    }, 30000);
    return () => { clearInterval(timer); };
  }, [queryClient, tenantId]);

  const addCard = async (card: Omit<CardItem, 'id' | 'createdAt'>): Promise<CardItem | null> => {
    if (!tenantId) return null;
    try {
      const data = await createCardApi(tenantId, {
        name: card.name,
        type: card.type,
        status: card.status,
        remark: card.remark,
        card_vendors: card.cardVendors || [],
      });
      if (!data) throw new Error('创建失败');
      const newCard: CardItem = {
        id: data.id,
        name: data.name,
        type: data.type || '',
        status: data.status as "active" | "inactive",
        remark: data.remark || '',
        createdAt: data.created_at?.split('T')[0] || '',
        cardVendors: data.card_vendors || [],
      };
      logOperation('merchant_management', 'create', data.id, null, data, `新增卡片: ${card.name}`);
      await queryClient.invalidateQueries({ queryKey: ['cards', tenantId] });
      return newCard;
    } catch (error) {
      logger.error('Failed to add card:', error);
      notify.error(t('创建卡片失败', 'Failed to create card'));
      return null;
    }
  };

  const updateCard = async (id: string, updates: Partial<CardItem>): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      const oldCard = cards.find(c => c.id === id);
      const body: Record<string, unknown> = {};
      if (updates.name !== undefined) body.name = updates.name;
      if (updates.type !== undefined) body.type = updates.type;
      if (updates.status !== undefined) body.status = updates.status;
      if (updates.remark !== undefined) body.remark = updates.remark;
      if (updates.cardVendors !== undefined) body.card_vendors = updates.cardVendors;
      const data = await updateCardApi(tenantId, id, body);
      if (!data) throw new Error('更新失败');
      if (oldCard) {
        logOperation('card_management', 'update', id, oldCard, updates, `更新卡片: ${oldCard.name}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['cards', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to update card:', error);
      return false;
    }
  };

  const deleteCard = async (id: string): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      const cardToDelete = cards.find(c => c.id === id);
      const ok = await deleteCardApi(tenantId, id);
      if (!ok) throw new Error('删除失败');
      if (cardToDelete) {
        logOperation('card_management', 'delete', id, cardToDelete, null, `删除卡片: ${cardToDelete.name}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['cards', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to delete card:', error);
      return false;
    }
  };

  const activeCards = cards.filter(c => c.status === 'active');

  const updateCardSortOrder = async (id: string, sortOrder: number): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      const data = await updateCardApi(tenantId, id, { sort_order: sortOrder });
      if (!data) throw new Error('更新失败');
      await queryClient.invalidateQueries({ queryKey: ['cards', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to update card sort order:', error);
      return false;
    }
  };

  const updateCardSortOrders = async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      const results = await Promise.all(
        items.map((item) => updateCardApi(tenantId, item.id, { sort_order: item.sortOrder })),
      );
      if (results.some(r => !r)) return false;
      await queryClient.invalidateQueries({ queryKey: ['cards', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to update card sort orders:', error);
      return false;
    }
  };

  return {
    cards, activeCards, loading,
    addCard, updateCard, deleteCard,
    updateCardSortOrder, updateCardSortOrders,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['cards', tenantId] }),
  };
}

// ============= Vendors Hook =============
export function useVendors() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const tenantId = useGiftcardsTenantId();

  const { data: vendors = [], isLoading: loading } = useQuery({
    queryKey: ['vendors', tenantId],
    queryFn: () => fetchVendorsFromDb(tenantId!),
    enabled: !!tenantId,
  });

  // 轮询替代 Realtime 订阅：每 30 秒刷新
  useEffect(() => {
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] });
    }, 30000);
    return () => { clearInterval(timer); };
  }, [queryClient, tenantId]);

  const addVendor = async (vendor: Omit<Vendor, 'id' | 'createdAt'>): Promise<Vendor | null> => {
    if (!tenantId) return null;
    try {
      const data = await createVendorApi(tenantId, { name: vendor.name, status: vendor.status, remark: vendor.remark });
      if (!data) throw new Error('创建失败');
      const newVendor: Vendor = {
        id: data.id,
        name: data.name,
        status: data.status as "active" | "inactive",
        remark: data.remark || '',
        createdAt: data.created_at?.split('T')[0] || '',
      };
      logOperation('merchant_management', 'create', data.id, null, data, `新增卡商: ${vendor.name}`);
      await queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] });
      return newVendor;
    } catch (error) {
      logger.error('Failed to add vendor:', error);
      notify.error(t('创建卡商失败', 'Failed to create vendor'));
      return null;
    }
  };

  const updateVendor = async (id: string, updates: Partial<Vendor & { sortOrder?: number }>): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      const oldVendor = vendors.find(v => v.id === id);
      const body: Record<string, unknown> = {};
      if (updates.name !== undefined) body.name = updates.name;
      if (updates.status !== undefined) body.status = updates.status;
      if (updates.remark !== undefined) body.remark = updates.remark;
      if (updates.paymentProviders !== undefined) body.payment_providers = updates.paymentProviders;
      if (updates.sortOrder !== undefined) body.sort_order = updates.sortOrder;

      const data = await updateVendorApi(tenantId, id, body);
      if (!data) throw new Error('更新失败');
      
      if (oldVendor) {
        logOperation('vendor_management', 'update', id, oldVendor, updates, `更新卡商: ${oldVendor.name}`);
      }
      
      if (updates.name && oldVendor?.name && updates.name !== oldVendor.name) {
        const { renameVendorSettlement } = await import('@/services/finance/merchantSettlementService');
        await renameVendorSettlement(oldVendor.name, updates.name);
      }
      
      await queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to update vendor:', error);
      return false;
    }
  };

  const deleteVendor = async (id: string): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      const vendorToDelete = vendors.find(v => v.id === id);
      const ok = await deleteVendorApi(tenantId, id);
      if (!ok) throw new Error('删除失败');
      
      if (vendorToDelete) {
        logOperation('vendor_management', 'delete', id, vendorToDelete, null, `删除卡商: ${vendorToDelete.name}`);
      }
      
      await queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to delete vendor:', error);
      return false;
    }
  };

  const activeVendors = vendors.filter(v => v.status === 'active');

  const updateVendorOrder = async (reorderedVendors: Vendor[]): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      for (let i = 0; i < reorderedVendors.length; i++) {
        await updateVendorApi(tenantId, reorderedVendors[i].id, { sort_order: i });
      }
      await queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to update vendor order:', error);
      return false;
    }
  };

  const updateVendorSortOrders = async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      const results = await Promise.all(
        items.map((item) => updateVendorApi(tenantId, item.id, { sort_order: item.sortOrder })),
      );
      if (results.some(r => !r)) return false;
      await queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to update vendor sort orders:', error);
      return false;
    }
  };

  return {
    vendors, activeVendors, loading,
    addVendor, updateVendor, deleteVendor,
    updateVendorOrder, updateVendorSortOrders,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] }),
  };
}

// ============= Payment Providers Hook =============
export function usePaymentProviders() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const tenantId = useGiftcardsTenantId();

  const { data: providers = [], isLoading: loading } = useQuery({
    queryKey: ['payment-providers', tenantId],
    queryFn: () => fetchPaymentProvidersFromDb(tenantId!),
    enabled: !!tenantId,
  });

  // 轮询替代 Realtime 订阅：每 30 秒刷新
  useEffect(() => {
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['payment-providers', tenantId] });
    }, 30000);
    return () => { clearInterval(timer); };
  }, [queryClient, tenantId]);

  const addProvider = async (provider: Omit<PaymentProvider, 'id' | 'createdAt'>): Promise<PaymentProvider | null> => {
    if (!tenantId) return null;
    try {
      const data = await createPaymentProviderApi(tenantId, { name: provider.name, status: provider.status, remark: provider.remark });
      if (!data) throw new Error('创建失败');
      const newProvider: PaymentProvider = {
        id: data.id,
        name: data.name,
        status: data.status as "active" | "inactive",
        remark: data.remark || '',
        createdAt: data.created_at?.split('T')[0] || '',
      };
      logOperation('merchant_management', 'create', data.id, null, data, `新增代付商家: ${provider.name}`);
      await queryClient.invalidateQueries({ queryKey: ['payment-providers', tenantId] });
      return newProvider;
    } catch (error) {
      logger.error('Failed to add payment provider:', error);
      notify.error(t('创建代付商家失败', 'Failed to create payment provider'));
      return null;
    }
  };

  const updateProvider = async (id: string, updates: Partial<PaymentProvider & { sortOrder?: number }>): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      const oldProvider = providers.find(p => p.id === id);
      const body: Record<string, unknown> = {};
      if (updates.name !== undefined) body.name = updates.name;
      if (updates.status !== undefined) body.status = updates.status;
      if (updates.remark !== undefined) body.remark = updates.remark;
      if (updates.sortOrder !== undefined) body.sort_order = updates.sortOrder;

      const data = await updatePaymentProviderApi(tenantId, id, body);
      if (!data) throw new Error('更新失败');
      
      if (oldProvider) {
        logOperation('provider_management', 'update', id, oldProvider, updates, `更新代付商家: ${oldProvider.name}`);
      }
      
      if (updates.name && oldProvider?.name && updates.name !== oldProvider.name) {
        const { renameProviderSettlement } = await import('@/services/finance/merchantSettlementService');
        await renameProviderSettlement(oldProvider.name, updates.name);
      }
      
      await queryClient.invalidateQueries({ queryKey: ['payment-providers', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to update payment provider:', error);
      return false;
    }
  };

  const deleteProvider = async (id: string): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      const providerToDelete = providers.find(p => p.id === id);
      const ok = await deletePaymentProviderApi(tenantId, id);
      if (!ok) throw new Error('删除失败');
      
      if (providerToDelete) {
        logOperation('provider_management', 'delete', id, providerToDelete, null, `删除代付商家: ${providerToDelete.name}`);
      }
      
      await queryClient.invalidateQueries({ queryKey: ['payment-providers', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to delete payment provider:', error);
      return false;
    }
  };

  const activeProviders = providers.filter(p => p.status === 'active');

  const updateProviderOrder = async (reorderedProviders: PaymentProvider[]): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      for (let i = 0; i < reorderedProviders.length; i++) {
        await updatePaymentProviderApi(tenantId, reorderedProviders[i].id, { sort_order: i });
      }
      await queryClient.invalidateQueries({ queryKey: ['payment-providers', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to update provider order:', error);
      return false;
    }
  };

  const updateProviderSortOrders = async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    if (!tenantId) return false;
    try {
      const results = await Promise.all(
        items.map((item) => updatePaymentProviderApi(tenantId, item.id, { sort_order: item.sortOrder })),
      );
      if (results.some(r => !r)) return false;
      await queryClient.invalidateQueries({ queryKey: ['payment-providers', tenantId] });
      return true;
    } catch (error) {
      logger.error('Failed to update provider sort orders:', error);
      return false;
    }
  };

  return {
    providers, activeProviders, loading,
    addProvider, updateProvider, deleteProvider,
    updateProviderOrder, updateProviderSortOrders,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['payment-providers', tenantId] }),
  };
}
