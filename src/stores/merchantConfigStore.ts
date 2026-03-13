// ============= Merchant Config Store =============
// 商家配置统一存储 - 使用数据库作为唯一数据源
// 此文件提供同步 API 兼容层，内部使用数据库 Hook

import { supabase } from '@/integrations/supabase/client';
import { logOperation } from './auditLogStore';

// ============= Types =============

export interface CardItem {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
  cardVendors?: string[];
}

export interface Vendor {
  id: string;
  name: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
}

export interface PaymentProvider {
  id: string;
  name: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
}

// ============= 内存缓存 =============
let cardsCache: CardItem[] = [];
let vendorsCache: Vendor[] = [];
let paymentProvidersCache: PaymentProvider[] = [];
let cardTypesCache: string[] = [];
let cacheInitialized = false;

// ============= 缓存初始化 =============
export async function initializeMerchantConfigCache(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    // 并行加载所有数据 - 使用 sort_order 升序排列（1在最上面），名称作为第二排序
    const [cardsResult, vendorsResult, providersResult, typesResult] = await Promise.all([
      supabase.from('cards').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name', { ascending: true }),
      supabase.from('vendors').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name', { ascending: true }),
      supabase.from('payment_providers').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name', { ascending: true }),
      supabase.from('card_types').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name', { ascending: true }),
    ]);

    if (cardsResult.data) {
      cardsCache = cardsResult.data.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type || '',
        status: c.status as "active" | "inactive",
        remark: c.remark || '',
        createdAt: c.created_at.split('T')[0],
        cardVendors: c.card_vendors || [],
      }));
    }

    if (vendorsResult.data) {
      vendorsCache = vendorsResult.data.map(v => ({
        id: v.id,
        name: v.name,
        status: v.status as "active" | "inactive",
        remark: v.remark || '',
        createdAt: v.created_at.split('T')[0],
      }));
    }

    if (providersResult.data) {
      paymentProvidersCache = providersResult.data.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status as "active" | "inactive",
        remark: p.remark || '',
        createdAt: p.created_at.split('T')[0],
      }));
    }

    if (typesResult.data) {
      cardTypesCache = typesResult.data.map(t => t.name);
    }

    cacheInitialized = true;
    console.log('[MerchantConfig] Cache initialized from database');
  } catch (error) {
    console.error('[MerchantConfig] Failed to initialize cache:', error);
  }
}

// ============= 刷新缓存 =============
async function refreshCardsCache(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    cardsCache = (data || []).map(c => ({
      id: c.id,
      name: c.name,
      type: c.type || '',
      status: c.status as "active" | "inactive",
      remark: c.remark || '',
      createdAt: c.created_at.split('T')[0],
      cardVendors: c.card_vendors || [],
    }));
  } catch (error) {
    console.error('[MerchantConfig] Failed to refresh cards cache:', error);
  }
}

async function refreshVendorsCache(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    vendorsCache = (data || []).map(v => ({
      id: v.id,
      name: v.name,
      status: v.status as "active" | "inactive",
      remark: v.remark || '',
      createdAt: v.created_at.split('T')[0],
    }));
  } catch (error) {
    console.error('[MerchantConfig] Failed to refresh vendors cache:', error);
  }
}

async function refreshPaymentProvidersCache(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('payment_providers')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    paymentProvidersCache = (data || []).map(p => ({
      id: p.id,
      name: p.name,
      status: p.status as "active" | "inactive",
      remark: p.remark || '',
      createdAt: p.created_at.split('T')[0],
    }));
  } catch (error) {
    console.error('[MerchantConfig] Failed to refresh payment providers cache:', error);
  }
}

// ============= 读取函数 (从缓存读取) =============

export function getCards(): CardItem[] {
  if (!cacheInitialized) {
    initializeMerchantConfigCache();
  }
  return cardsCache;
}

export function getActiveCards(): CardItem[] {
  return getCards().filter(c => c.status === 'active');
}

export function getVendors(): Vendor[] {
  if (!cacheInitialized) {
    initializeMerchantConfigCache();
  }
  return vendorsCache;
}

export function getActiveVendors(): Vendor[] {
  return getVendors().filter(v => v.status === 'active');
}

export function getPaymentProviders(): PaymentProvider[] {
  if (!cacheInitialized) {
    initializeMerchantConfigCache();
  }
  return paymentProvidersCache;
}

export function getActivePaymentProviders(): PaymentProvider[] {
  return getPaymentProviders().filter(p => p.status === 'active');
}

export function getCardTypes(): string[] {
  if (!cacheInitialized) {
    initializeMerchantConfigCache();
  }
  return cardTypesCache;
}

// ============= 保存函数 (写入数据库) =============

export async function saveCards(cards: CardItem[]): Promise<void> {
  // 批量更新数据库 - 这个函数不常用，通常使用 addCard/updateCard
  console.warn('[MerchantConfig] saveCards called - use addCard/updateCard instead');
  cardsCache = cards;
}

export async function saveVendors(vendors: Vendor[]): Promise<void> {
  console.warn('[MerchantConfig] saveVendors called - use addVendor/updateVendor instead');
  vendorsCache = vendors;
}

export async function savePaymentProviders(providers: PaymentProvider[]): Promise<void> {
  console.warn('[MerchantConfig] savePaymentProviders called - use addProvider/updateProvider instead');
  paymentProvidersCache = providers;
}

export async function saveCardTypes(types: string[]): Promise<void> {
  try {
    // 删除旧数据，插入新数据
    await supabase.from('card_types').delete().neq('id', '');
    
    const insertData = types.map((name, index) => ({
      name,
      sort_order: index + 1,
    }));
    
    if (insertData.length > 0) {
      await supabase.from('card_types').insert(insertData);
    }
    
    cardTypesCache = types;
  } catch (error) {
    console.error('[MerchantConfig] Failed to save card types:', error);
  }
}

// ============= CRUD 操作 (数据库操作 + 审计日志) =============

export async function addCard(card: Omit<CardItem, 'id' | 'createdAt'>): Promise<CardItem | null> {
  try {
    const { data, error } = await supabase
      .from('cards')
      .insert({
        name: card.name,
        type: card.type,
        status: card.status,
        remark: card.remark,
        card_vendors: card.cardVendors || [],
      })
      .select()
      .single();

    if (error) throw error;

    const newCard: CardItem = {
      id: data.id,
      name: data.name,
      type: data.type || '',
      status: data.status as "active" | "inactive",
      remark: data.remark || '',
      createdAt: data.created_at.split('T')[0],
      cardVendors: data.card_vendors || [],
    };

    await refreshCardsCache();
    logOperation('merchant_management', 'create', newCard.id, null, newCard, `新增卡片: ${newCard.name}`);
    return newCard;
  } catch (error) {
    console.error('[MerchantConfig] Failed to add card:', error);
    return null;
  }
}

export async function updateCard(id: string, updates: Partial<CardItem>): Promise<CardItem | null> {
  try {
    const beforeCard = cardsCache.find(c => c.id === id);
    
    const { error } = await supabase
      .from('cards')
      .update({
        name: updates.name,
        type: updates.type,
        status: updates.status,
        remark: updates.remark,
        card_vendors: updates.cardVendors,
      })
      .eq('id', id);

    if (error) throw error;

    await refreshCardsCache();
    const updatedCard = cardsCache.find(c => c.id === id);
    
    if (updatedCard) {
      logOperation('merchant_management', 'update', id, beforeCard, updatedCard, `修改卡片: ${updatedCard.name}`);
    }
    
    return updatedCard || null;
  } catch (error) {
    console.error('[MerchantConfig] Failed to update card:', error);
    return null;
  }
}

export async function deleteCard(id: string): Promise<boolean> {
  try {
    const cardToDelete = cardsCache.find(c => c.id === id);
    if (!cardToDelete) return false;

    const { error } = await supabase
      .from('cards')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await refreshCardsCache();
    logOperation('merchant_management', 'delete', id, cardToDelete, null, `删除卡片: ${cardToDelete.name}`);
    return true;
  } catch (error) {
    console.error('[MerchantConfig] Failed to delete card:', error);
    return false;
  }
}

export async function addVendor(vendor: Omit<Vendor, 'id' | 'createdAt'>): Promise<Vendor | null> {
  try {
    const { data, error } = await supabase
      .from('vendors')
      .insert({
        name: vendor.name,
        status: vendor.status,
        remark: vendor.remark,
      })
      .select()
      .single();

    if (error) throw error;

    const newVendor: Vendor = {
      id: data.id,
      name: data.name,
      status: data.status as "active" | "inactive",
      remark: data.remark || '',
      createdAt: data.created_at.split('T')[0],
    };

    await refreshVendorsCache();
    logOperation('merchant_management', 'create', newVendor.id, null, newVendor, `新增卡商: ${newVendor.name}`);
    return newVendor;
  } catch (error) {
    console.error('[MerchantConfig] Failed to add vendor:', error);
    return null;
  }
}

export async function updateVendor(id: string, updates: Partial<Vendor>): Promise<Vendor | null> {
  try {
    const beforeVendor = vendorsCache.find(v => v.id === id);
    
    const { error } = await supabase
      .from('vendors')
      .update({
        name: updates.name,
        status: updates.status,
        remark: updates.remark,
      })
      .eq('id', id);

    if (error) throw error;

    await refreshVendorsCache();
    const updatedVendor = vendorsCache.find(v => v.id === id);
    
    if (updatedVendor) {
      logOperation('merchant_management', 'update', id, beforeVendor, updatedVendor, `修改卡商: ${updatedVendor.name}`);
    }
    
    return updatedVendor || null;
  } catch (error) {
    console.error('[MerchantConfig] Failed to update vendor:', error);
    return null;
  }
}

export async function deleteVendor(id: string): Promise<boolean> {
  try {
    const vendorToDelete = vendorsCache.find(v => v.id === id);
    if (!vendorToDelete) return false;

    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await refreshVendorsCache();
    logOperation('merchant_management', 'delete', id, vendorToDelete, null, `删除卡商: ${vendorToDelete.name}`);
    return true;
  } catch (error) {
    console.error('[MerchantConfig] Failed to delete vendor:', error);
    return false;
  }
}

export async function addPaymentProvider(provider: Omit<PaymentProvider, 'id' | 'createdAt'>): Promise<PaymentProvider | null> {
  try {
    const { data, error } = await supabase
      .from('payment_providers')
      .insert({
        name: provider.name,
        status: provider.status,
        remark: provider.remark,
      })
      .select()
      .single();

    if (error) throw error;

    const newProvider: PaymentProvider = {
      id: data.id,
      name: data.name,
      status: data.status as "active" | "inactive",
      remark: data.remark || '',
      createdAt: data.created_at.split('T')[0],
    };

    await refreshPaymentProvidersCache();
    logOperation('merchant_management', 'create', newProvider.id, null, newProvider, `新增代付商家: ${newProvider.name}`);
    return newProvider;
  } catch (error) {
    console.error('[MerchantConfig] Failed to add payment provider:', error);
    return null;
  }
}

export async function updatePaymentProvider(id: string, updates: Partial<PaymentProvider>): Promise<PaymentProvider | null> {
  try {
    const beforeProvider = paymentProvidersCache.find(p => p.id === id);
    
    const { error } = await supabase
      .from('payment_providers')
      .update({
        name: updates.name,
        status: updates.status,
        remark: updates.remark,
      })
      .eq('id', id);

    if (error) throw error;

    await refreshPaymentProvidersCache();
    const updatedProvider = paymentProvidersCache.find(p => p.id === id);
    
    if (updatedProvider) {
      logOperation('merchant_management', 'update', id, beforeProvider, updatedProvider, `修改代付商家: ${updatedProvider.name}`);
    }
    
    return updatedProvider || null;
  } catch (error) {
    console.error('[MerchantConfig] Failed to update payment provider:', error);
    return null;
  }
}

export async function deletePaymentProvider(id: string): Promise<boolean> {
  try {
    const providerToDelete = paymentProvidersCache.find(p => p.id === id);
    if (!providerToDelete) return false;

    const { error } = await supabase
      .from('payment_providers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await refreshPaymentProvidersCache();
    logOperation('merchant_management', 'delete', id, providerToDelete, null, `删除代付商家: ${providerToDelete.name}`);
    return true;
  } catch (error) {
    console.error('[MerchantConfig] Failed to delete payment provider:', error);
    return false;
  }
}

export function resetMerchantConfigCache(): void {
  cardsCache = [];
  vendorsCache = [];
  paymentProvidersCache = [];
  cardTypesCache = [];
  cacheInitialized = false;
}

// ============= 辅助函数 =============

export function getCardById(id: string): CardItem | undefined {
  return getCards().find(c => c.id === id);
}

export function getCardByName(name: string): CardItem | undefined {
  return getCards().find(c => c.name === name);
}

export function getVendorById(id: string): Vendor | undefined {
  return getVendors().find(v => v.id === id);
}

export function getVendorByName(name: string): Vendor | undefined {
  return getVendors().find(v => v.name === name);
}

export function getPaymentProviderById(id: string): PaymentProvider | undefined {
  return getPaymentProviders().find(p => p.id === id);
}

export function getPaymentProviderByName(name: string): PaymentProvider | undefined {
  return getPaymentProviders().find(p => p.name === name);
}

// ============= 兼容性函数 (已废弃) =============

export function needsInitialization(): { cards: boolean; vendors: boolean; paymentProviders: boolean } {
  return { cards: false, vendors: false, paymentProviders: false };
}

export function markAsInitialized(_type: 'cards' | 'vendors' | 'paymentProviders'): void {
  // 不再需要，数据库是唯一数据源
}
