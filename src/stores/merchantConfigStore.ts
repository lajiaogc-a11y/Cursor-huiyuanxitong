// ============= Merchant Config Store =============
// 商家配置统一存储 - 使用数据库作为唯一数据源
// 此文件提供同步 API 兼容层，内部使用数据库 Hook

import { logOperation } from './auditLogStore';
import { fetchMerchantCards, fetchMerchantPaymentProviders, fetchMerchantVendors } from '@/services/finance/merchantConfigReadService';
import { listCardTypeNames, replaceCardTypes } from '@/services/finance/cardTypesService';
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

// ============= Types =============

export interface CardItem {
  id: string;
  name: string;
  type: string;
  status: string;
  remark: string;
  createdAt: string;
  cardVendors?: string[];
}

export interface Vendor {
  id: string;
  name: string;
  status: string;
  remark: string;
  createdAt: string;
}

export interface PaymentProvider {
  id: string;
  name: string;
  status: string;
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
    // 统一经由 merchantConfigReadService 读取，保证 Hook/Store/页面排序和字段一致
    const [cardsResult, vendorsResult, providersResult, typesResult] = await Promise.all([
      fetchMerchantCards(),
      fetchMerchantVendors(),
      fetchMerchantPaymentProviders(),
      listCardTypeNames().catch((err) => { console.warn('[merchantConfigStore] listCardTypeNames failed silently:', err); return []; }),
    ]);

    cardsCache = cardsResult.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      remark: c.remark,
      createdAt: c.createdAt,
      cardVendors: c.cardVendors || [],
    }));

    vendorsCache = vendorsResult.map(v => ({
      id: v.id,
      name: v.name,
      status: v.status,
      remark: v.remark,
      createdAt: v.createdAt,
    }));

    paymentProvidersCache = providersResult.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      remark: p.remark,
      createdAt: p.createdAt,
    }));

    cardTypesCache = Array.isArray(typesResult) ? typesResult : [];

    cacheInitialized = true;
    console.log('[MerchantConfig] Cache initialized from database');
  } catch (error) {
    console.error('[MerchantConfig] Failed to initialize cache:', error);
  }
}

// ============= 刷新缓存 =============
async function refreshCardsCache(): Promise<void> {
  try {
    const data = await fetchMerchantCards();
    cardsCache = data.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      remark: c.remark,
      createdAt: c.createdAt,
      cardVendors: c.cardVendors || [],
    }));
  } catch (error) {
    console.error('[MerchantConfig] Failed to refresh cards cache:', error);
  }
}

async function refreshVendorsCache(): Promise<void> {
  try {
    const data = await fetchMerchantVendors();
    vendorsCache = data.map(v => ({
      id: v.id,
      name: v.name,
      status: v.status,
      remark: v.remark,
      createdAt: v.createdAt,
    }));
  } catch (error) {
    console.error('[MerchantConfig] Failed to refresh vendors cache:', error);
  }
}

async function refreshPaymentProvidersCache(): Promise<void> {
  try {
    const data = await fetchMerchantPaymentProviders();
    paymentProvidersCache = data.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      remark: p.remark,
      createdAt: p.createdAt,
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
    await replaceCardTypes(types);
    cardTypesCache = types;
  } catch (error) {
    console.error('[MerchantConfig] Failed to save card types:', error);
  }
}

// ============= CRUD 操作 (数据库操作 + 审计日志) =============

export async function addCard(card: Omit<CardItem, 'id' | 'createdAt'>): Promise<CardItem | null> {
  try {
    const data = await createCardApi({
      name: card.name,
      type: card.type,
      status: card.status,
      remark: card.remark,
      card_vendors: card.cardVendors || [],
    });
    if (!data) return null;

    const newCard: CardItem = {
      id: data.id,
      name: data.name,
      type: data.type || '',
      status: data.status as "active" | "inactive",
      remark: data.remark || '',
      createdAt: data.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
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
    
    await updateCardApi(id, {
      name: updates.name,
      type: updates.type,
      status: updates.status,
      remark: updates.remark,
      card_vendors: updates.cardVendors,
    });

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

    await deleteCardApi(id);

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
    const data = await createVendorApi({
      name: vendor.name,
      status: vendor.status,
      remark: vendor.remark,
    });
    if (!data) return null;

    const newVendor: Vendor = {
      id: data.id,
      name: data.name,
      status: data.status as "active" | "inactive",
      remark: data.remark || '',
      createdAt: data.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
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
    
    await updateVendorApi(id, {
      name: updates.name,
      status: updates.status,
      remark: updates.remark,
    });

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

    await deleteVendorApi(id);

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
    const data = await createPaymentProviderApi({
      name: provider.name,
      status: provider.status,
      remark: provider.remark,
    });
    if (!data) return null;

    const newProvider: PaymentProvider = {
      id: data.id,
      name: data.name,
      status: data.status as "active" | "inactive",
      remark: data.remark || '',
      createdAt: data.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
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
    
    await updatePaymentProviderApi(id, {
      name: updates.name,
      status: updates.status,
      remark: updates.remark,
    });

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

    await deletePaymentProviderApi(id);

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
