// ============= Merchant Config Hook - react-query Migration =============
// react-query 缓存确保页面切换不重复请求
import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logOperation } from '@/stores/auditLogStore';
import { fetchMerchantCards, fetchMerchantVendors, fetchMerchantPaymentProviders } from '@/services/merchantConfigReadService';

export interface CardItem {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
  cardVendors?: string[];
  sortOrder?: number;
}

export interface Vendor {
  id: string;
  name: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
  paymentProviders?: string[];
  sortOrder?: number;
}

export interface PaymentProvider {
  id: string;
  name: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
  sortOrder?: number;
}

// ============= Standalone fetch functions =============
export async function fetchCardsFromDb(): Promise<CardItem[]> {
  const rows = await fetchMerchantCards();
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

export async function fetchVendorsFromDb(): Promise<Vendor[]> {
  const rows = await fetchMerchantVendors();
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

export async function fetchPaymentProvidersFromDb(): Promise<PaymentProvider[]> {
  const rows = await fetchMerchantPaymentProviders();
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

  const { data: cards = [], isLoading: loading } = useQuery({
    queryKey: ['cards'],
    queryFn: fetchCardsFromDb,
  });

  useEffect(() => {
    const channel = supabase
      .channel('cards-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cards'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const addCard = async (card: Omit<CardItem, 'id' | 'createdAt'>): Promise<CardItem | null> => {
    try {
      const { data, error } = await supabase
        .from('cards')
        .insert({
          name: card.name, type: card.type, status: card.status,
          remark: card.remark, card_vendors: card.cardVendors || [],
        })
        .select().single();
      if (error) throw error;
      const newCard: CardItem = {
        id: data.id, name: data.name, type: data.type || '',
        status: data.status as "active" | "inactive",
        remark: data.remark || '', createdAt: data.created_at.split('T')[0],
        cardVendors: data.card_vendors || [],
      };
      logOperation('merchant_management', 'create', data.id, null, data, `新增卡片: ${card.name}`);
      await queryClient.invalidateQueries({ queryKey: ['cards'] });
      return newCard;
    } catch (error) {
      console.error('Failed to add card:', error);
      toast.error('创建卡片失败');
      return null;
    }
  };

  const updateCard = async (id: string, updates: Partial<CardItem>): Promise<boolean> => {
    try {
      const oldCard = cards.find(c => c.id === id);
      const { error } = await supabase
        .from('cards')
        .update({
          name: updates.name, type: updates.type,
          status: updates.status, remark: updates.remark,
          card_vendors: updates.cardVendors,
        })
        .eq('id', id);
      if (error) throw error;
      if (oldCard) {
        logOperation('card_management', 'update', id, oldCard, updates, `更新卡片: ${oldCard.name}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['cards'] });
      return true;
    } catch (error) {
      console.error('Failed to update card:', error);
      return false;
    }
  };

  const deleteCard = async (id: string): Promise<boolean> => {
    try {
      const cardToDelete = cards.find(c => c.id === id);
      const { error } = await supabase.from('cards').delete().eq('id', id);
      if (error) throw error;
      if (cardToDelete) {
        const { logOperation } = await import('@/stores/auditLogStore');
        logOperation('card_management', 'delete', id, cardToDelete, null, `删除卡片: ${cardToDelete.name}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['cards'] });
      return true;
    } catch (error) {
      console.error('Failed to delete card:', error);
      return false;
    }
  };

  const activeCards = cards.filter(c => c.status === 'active');

  const updateCardSortOrder = async (id: string, sortOrder: number): Promise<boolean> => {
    try {
      const { error } = await supabase.from('cards').update({ sort_order: sortOrder }).eq('id', id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['cards'] });
      return true;
    } catch (error) {
      console.error('Failed to update card sort order:', error);
      return false;
    }
  };

  const updateCardSortOrders = async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    try {
      const updates = items.map(item =>
        supabase.from('cards').update({ sort_order: item.sortOrder }).eq('id', item.id)
      );
      const results = await Promise.all(updates);
      if (results.some(r => r.error)) return false;
      await queryClient.invalidateQueries({ queryKey: ['cards'] });
      return true;
    } catch (error) {
      console.error('Failed to update card sort orders:', error);
      return false;
    }
  };

  return {
    cards, activeCards, loading,
    addCard, updateCard, deleteCard,
    updateCardSortOrder, updateCardSortOrders,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['cards'] }),
  };
}

// ============= Vendors Hook =============
export function useVendors() {
  const queryClient = useQueryClient();

  const { data: vendors = [], isLoading: loading } = useQuery({
    queryKey: ['vendors'],
    queryFn: fetchVendorsFromDb,
  });

  useEffect(() => {
    const channel = supabase
      .channel('vendors-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => {
        queryClient.invalidateQueries({ queryKey: ['vendors'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const addVendor = async (vendor: Omit<Vendor, 'id' | 'createdAt'>): Promise<Vendor | null> => {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert({ name: vendor.name, status: vendor.status, remark: vendor.remark })
        .select().single();
      if (error) throw error;
      const newVendor: Vendor = {
        id: data.id, name: data.name,
        status: data.status as "active" | "inactive",
        remark: data.remark || '', createdAt: data.created_at.split('T')[0],
      };
      logOperation('merchant_management', 'create', data.id, null, data, `新增卡商: ${vendor.name}`);
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      return newVendor;
    } catch (error) {
      console.error('Failed to add vendor:', error);
      toast.error('创建卡商失败');
      return null;
    }
  };

  const updateVendor = async (id: string, updates: Partial<Vendor & { sortOrder?: number }>): Promise<boolean> => {
    try {
      const oldVendor = vendors.find(v => v.id === id);
      const oldName = oldVendor?.name;
      
      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.remark !== undefined) updateData.remark = updates.remark;
      if (updates.paymentProviders !== undefined) updateData.payment_providers = updates.paymentProviders;
      if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;

      const { error } = await supabase.from('vendors').update(updateData).eq('id', id);
      if (error) throw error;
      
      if (oldVendor) {
        logOperation('vendor_management', 'update', id, oldVendor, updates, `更新卡商: ${oldVendor.name}`);
      }
      
      // Sync name changes across related tables
      if (updates.name && oldName && updates.name !== oldName) {
        const newName = updates.name;
        
        const { data: cardsWithVendor } = await supabase
          .from('cards').select('id, card_vendors').contains('card_vendors', [oldName]);
        if (cardsWithVendor) {
          for (const card of cardsWithVendor) {
            const updatedVendors = (card.card_vendors || []).map((v: string) => v === oldName ? newName : v);
            await supabase.from('cards').update({ card_vendors: updatedVendors }).eq('id', card.id);
          }
        }
        
        await supabase.from('ledger_transactions').update({ account_id: newName })
          .eq('account_type', 'card_vendor').eq('account_id', oldName);
        await supabase.from('balance_change_logs').update({ merchant_name: newName })
          .eq('merchant_type', 'card_vendor').eq('merchant_name', oldName);
        
        const { renameVendorSettlement } = await import('@/stores/merchantSettlementStore');
        await renameVendorSettlement(oldName, newName);
      }
      
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      return true;
    } catch (error) {
      console.error('Failed to update vendor:', error);
      return false;
    }
  };

  const deleteVendor = async (id: string): Promise<boolean> => {
    try {
      const vendorToDelete = vendors.find(v => v.id === id);
      const vendorName = vendorToDelete?.name;
      
      const { error } = await supabase.from('vendors').delete().eq('id', id);
      if (error) throw error;
      
      if (vendorToDelete) {
        const { logOperation } = await import('@/stores/auditLogStore');
        logOperation('vendor_management', 'delete', id, vendorToDelete, null, `删除卡商: ${vendorName}`);
      }
      
      if (vendorName) {
        const { data: cardsWithVendor } = await supabase
          .from('cards').select('id, card_vendors').contains('card_vendors', [vendorName]);
        if (cardsWithVendor) {
          for (const card of cardsWithVendor) {
            const updatedVendors = (card.card_vendors || []).filter((v: string) => v !== vendorName);
            await supabase.from('cards').update({ card_vendors: updatedVendors }).eq('id', card.id);
          }
        }
      }
      
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      return true;
    } catch (error) {
      console.error('Failed to delete vendor:', error);
      return false;
    }
  };

  const activeVendors = vendors.filter(v => v.status === 'active');

  const updateVendorOrder = async (reorderedVendors: Vendor[]): Promise<boolean> => {
    try {
      for (let i = 0; i < reorderedVendors.length; i++) {
        await supabase.from('vendors').update({ sort_order: i }).eq('id', reorderedVendors[i].id);
      }
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      return true;
    } catch (error) {
      console.error('Failed to update vendor order:', error);
      return false;
    }
  };

  const updateVendorSortOrders = async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    try {
      const updates = items.map(item =>
        supabase.from('vendors').update({ sort_order: item.sortOrder }).eq('id', item.id)
      );
      const results = await Promise.all(updates);
      if (results.some(r => r.error)) return false;
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      return true;
    } catch (error) {
      console.error('Failed to update vendor sort orders:', error);
      return false;
    }
  };

  return {
    vendors, activeVendors, loading,
    addVendor, updateVendor, deleteVendor,
    updateVendorOrder, updateVendorSortOrders,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['vendors'] }),
  };
}

// ============= Payment Providers Hook =============
export function usePaymentProviders() {
  const queryClient = useQueryClient();

  const { data: providers = [], isLoading: loading } = useQuery({
    queryKey: ['payment-providers'],
    queryFn: fetchPaymentProvidersFromDb,
  });

  useEffect(() => {
    const channel = supabase
      .channel('payment-providers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_providers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['payment-providers'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const addProvider = async (provider: Omit<PaymentProvider, 'id' | 'createdAt'>): Promise<PaymentProvider | null> => {
    try {
      const { data, error } = await supabase
        .from('payment_providers')
        .insert({ name: provider.name, status: provider.status, remark: provider.remark })
        .select().single();
      if (error) throw error;
      const newProvider: PaymentProvider = {
        id: data.id, name: data.name,
        status: data.status as "active" | "inactive",
        remark: data.remark || '', createdAt: data.created_at.split('T')[0],
      };
      logOperation('merchant_management', 'create', data.id, null, data, `新增代付商家: ${provider.name}`);
      await queryClient.invalidateQueries({ queryKey: ['payment-providers'] });
      return newProvider;
    } catch (error) {
      console.error('Failed to add payment provider:', error);
      toast.error('创建代付商家失败');
      return null;
    }
  };

  const updateProvider = async (id: string, updates: Partial<PaymentProvider & { sortOrder?: number }>): Promise<boolean> => {
    try {
      const oldProvider = providers.find(p => p.id === id);
      const oldName = oldProvider?.name;
      
      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.remark !== undefined) updateData.remark = updates.remark;
      if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;

      const { error } = await supabase.from('payment_providers').update(updateData).eq('id', id);
      if (error) throw error;
      
      if (oldProvider) {
        logOperation('provider_management', 'update', id, oldProvider, updates, `更新代付商家: ${oldProvider.name}`);
      }
      
      if (updates.name && oldName && updates.name !== oldName) {
        const newName = updates.name;
        
        const { data: vendorsWithProvider } = await supabase
          .from('vendors').select('id, payment_providers').contains('payment_providers', [oldName]);
        if (vendorsWithProvider) {
          for (const vendor of vendorsWithProvider) {
            const updatedProviders = (vendor.payment_providers || []).map((p: string) => p === oldName ? newName : p);
            await supabase.from('vendors').update({ payment_providers: updatedProviders }).eq('id', vendor.id);
          }
        }
        
        await supabase.from('ledger_transactions').update({ account_id: newName })
          .eq('account_type', 'payment_provider').eq('account_id', oldName);
        await supabase.from('activity_gifts').update({ payment_agent: newName })
          .eq('payment_agent', oldName);
        await supabase.from('balance_change_logs').update({ merchant_name: newName })
          .eq('merchant_type', 'payment_provider').eq('merchant_name', oldName);
        
        const { renameProviderSettlement } = await import('@/stores/merchantSettlementStore');
        await renameProviderSettlement(oldName, newName);
      }
      
      await queryClient.invalidateQueries({ queryKey: ['payment-providers'] });
      return true;
    } catch (error) {
      console.error('Failed to update payment provider:', error);
      return false;
    }
  };

  const deleteProvider = async (id: string): Promise<boolean> => {
    try {
      const providerToDelete = providers.find(p => p.id === id);
      const providerName = providerToDelete?.name;
      
      const { error } = await supabase.from('payment_providers').delete().eq('id', id);
      if (error) throw error;
      
      if (providerToDelete) {
        const { logOperation } = await import('@/stores/auditLogStore');
        logOperation('provider_management', 'delete', id, providerToDelete, null, `删除代付商家: ${providerName}`);
      }
      
      if (providerName) {
        const { data: vendorsWithProvider } = await supabase
          .from('vendors').select('id, payment_providers').contains('payment_providers', [providerName]);
        if (vendorsWithProvider) {
          for (const vendor of vendorsWithProvider) {
            const updatedProviders = (vendor.payment_providers || []).filter((p: string) => p !== providerName);
            await supabase.from('vendors').update({ payment_providers: updatedProviders }).eq('id', vendor.id);
          }
        }
      }
      
      await queryClient.invalidateQueries({ queryKey: ['payment-providers'] });
      return true;
    } catch (error) {
      console.error('Failed to delete payment provider:', error);
      return false;
    }
  };

  const activeProviders = providers.filter(p => p.status === 'active');

  const updateProviderOrder = async (reorderedProviders: PaymentProvider[]): Promise<boolean> => {
    try {
      for (let i = 0; i < reorderedProviders.length; i++) {
        await supabase.from('payment_providers').update({ sort_order: i }).eq('id', reorderedProviders[i].id);
      }
      await queryClient.invalidateQueries({ queryKey: ['payment-providers'] });
      return true;
    } catch (error) {
      console.error('Failed to update provider order:', error);
      return false;
    }
  };

  const updateProviderSortOrders = async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    try {
      const updates = items.map(item =>
        supabase.from('payment_providers').update({ sort_order: item.sortOrder }).eq('id', item.id)
      );
      const results = await Promise.all(updates);
      if (results.some(r => r.error)) return false;
      await queryClient.invalidateQueries({ queryKey: ['payment-providers'] });
      return true;
    } catch (error) {
      console.error('Failed to update provider sort orders:', error);
      return false;
    }
  };

  return {
    providers, activeProviders, loading,
    addProvider, updateProvider, deleteProvider,
    updateProviderOrder, updateProviderSortOrders,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['payment-providers'] }),
  };
}
