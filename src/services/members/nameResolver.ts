// ============= Unified Name Resolver Service =============
// 统一名称解析服务 - 合并了 useNameResolvers 和 useMerchantNameResolver
// 提供 ID 到名称的统一解析功能，配合 CacheManager 使用

import { apiGet } from '@/api/client';
import { 
  getCache, 
  setCache, 
  clearCache, 
  CACHE_CONFIG, 
  CACHE_KEYS,
  subscribeTableChanges,
} from '@/services/cacheManager';
import { getActivityTypesApi } from '@/services/staff/dataApi';
import { listCardsApi, listVendorsApi, listPaymentProvidersApi } from '@/services/shared/entityLookupService';
import { listEmployeesApi, getEmployeeApi } from '@/api/employees';

// ============= 类型定义 =============

export interface EmployeeInfo {
  id: string;
  username: string;
  realName: string;
  role: 'admin' | 'manager' | 'staff';
  status: string;
}

export interface ActivityTypeInfo {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
}

export interface MerchantInfo {
  id: string;
  name: string;
  status?: string;
}

interface EntityCache<T> {
  byId: Map<string, T>;
  byName: Map<string, T>;
  initialized: boolean;
}

// ============= 全局缓存数据 =============

let employeesData: EntityCache<EmployeeInfo> = { byId: new Map(), byName: new Map(), initialized: false };
let activityTypesData: EntityCache<ActivityTypeInfo> = { byId: new Map(), byName: new Map(), initialized: false };
let cardsData: EntityCache<MerchantInfo> = { byId: new Map(), byName: new Map(), initialized: false };
let vendorsData: EntityCache<MerchantInfo> = { byId: new Map(), byName: new Map(), initialized: false };
let providersData: EntityCache<MerchantInfo> = { byId: new Map(), byName: new Map(), initialized: false };

function asRows<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * UTF-8 文本曾被按 Latin-1/单字节解读时会产生「Ã¤Â¸Â­」类乱码；尝试按字节还原为 UTF-8。
 * 仅在有典型乱码特征或还原结果含中文且无替换符时替换，避免误伤正常西欧字符。
 */
/** 导出供会员订单等场景对库内已错编码的展示字段做兜底修复 */
export function tryRecoverMisdecodedUtf8(input: string): string {
  if (!input) return input;
  // eslint-disable-next-line no-control-regex -- ASCII-only fast path
  if (/^[\x00-\x7F]+$/.test(input)) return input;
  const hasCjk = /[\u4e00-\u9fff]/.test(input);
  const looksMojibake = /Ã[\x80-\xBF]|Â[\x80-\xBF]|Ä/.test(input);
  if (hasCjk && !looksMojibake && !input.includes('\uFFFD')) return input;
  try {
    const bytes = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      if (c > 255) return input;
      bytes[i] = c;
    }
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (
      decoded &&
      decoded !== input &&
      /[\u4e00-\u9fff]/.test(decoded) &&
      !decoded.includes('\uFFFD')
    ) {
      return decoded;
    }
  } catch {
    /* ignore */
  }
  try {
    const legacy = decodeURIComponent(escape(input));
    if (legacy !== input && /[\u4e00-\u9fff]/.test(legacy)) return legacy;
  } catch {
    /* ignore */
  }
  return input;
}

/** 会员门户：无员工端表代理权限，跳过 nameResolver 拉取，解析函数退回原始值 */
function isMemberPortalPath(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname;
  return p.startsWith('/member') || p.startsWith('/invite') || p === '/';
}

function markEmptyInitialized<T extends { byId: Map<string, unknown>; byName: Map<string, unknown>; initialized: boolean }>(
  cache: T,
): void {
  cache.byId.clear();
  cache.byName.clear();
  cache.initialized = true;
}

// 订阅者回调
const subscribers = new Set<() => void>();

// ============= 数据加载函数 =============

async function loadEmployees(): Promise<void> {
  if (isMemberPortalPath()) {
    markEmptyInitialized(employeesData);
    return;
  }
  try {
    const data = await listEmployeesApi();
    employeesData.byId.clear();
    employeesData.byName.clear();
    (data || []).forEach((emp: { id: string; username: string; real_name: string; role: string; status: string }) => {
      const info: EmployeeInfo = {
        id: emp.id,
        username: emp.username,
        realName: emp.real_name,
        role: emp.role as 'admin' | 'manager' | 'staff',
        status: emp.status,
      };
      employeesData.byId.set(emp.id, info);
      employeesData.byName.set(emp.username, info);
    });
    employeesData.initialized = true;
    setCache(CACHE_KEYS.EMPLOYEES, true, CACHE_CONFIG.ENTITY_DATA_TTL);
    console.log('[NameResolver] Employees loaded:', employeesData.byId.size);
  } catch (error) {
    console.error('[NameResolver] Failed to load employees:', error);
  }
}

async function loadActivityTypes(): Promise<void> {
  if (isMemberPortalPath()) {
    markEmptyInitialized(activityTypesData);
    return;
  }
  try {
    const data = await getActivityTypesApi();
    
    activityTypesData.byId.clear();
    activityTypesData.byName.clear();
    
    (data || []).forEach(type => {
      const info: ActivityTypeInfo = {
        id: type.id,
        value: type.value,
        label: type.label,
        isActive: type.is_active ?? true,
      };
      activityTypesData.byId.set(type.id, info);
      activityTypesData.byName.set(type.value, info);
    });
    
    activityTypesData.initialized = true;
    setCache(CACHE_KEYS.ACTIVITY_TYPES, true, CACHE_CONFIG.ENTITY_DATA_TTL);
    console.log('[NameResolver] Activity types loaded:', activityTypesData.byId.size);
  } catch (error) {
    console.error('[NameResolver] Failed to load activity types:', error);
  }
}

async function loadCards(): Promise<void> {
  if (isMemberPortalPath()) {
    markEmptyInitialized(cardsData);
    return;
  }
  try {
    // 优先使用 API（带 JWT 鉴权，返回租户数据），避免 RLS 导致 supabase 直连返回空
    try {
      const data = await listCardsApi();
      cardsData.byId.clear();
      cardsData.byName.clear();
      (data || []).forEach((card: { id: string; name: string; status?: string }) => {
        const info: MerchantInfo = { id: card.id, name: card.name, status: card.status || 'active' };
        cardsData.byId.set(card.id, info);
        cardsData.byName.set(card.name, info);
      });
      cardsData.initialized = true;
      setCache(CACHE_KEYS.CARDS, true, CACHE_CONFIG.ENTITY_DATA_TTL);
      console.log('[NameResolver] Cards loaded via API:', cardsData.byId.size);
      return;
    } catch (apiErr) {
      console.warn('[NameResolver] API load cards failed, fallback to table proxy:', apiErr);
    }
    const raw = asRows(
      await apiGet<Record<string, unknown>>(`/api/data/table/gift_cards?select=id,name,card_number,status&limit=5000`).catch(
        (err) => { console.warn('[nameResolver] gift_cards fallback fetch failed silently:', err); return []; },
      ),
    );
    cardsData.byId.clear();
    cardsData.byName.clear();
    raw.forEach((card) => {
      const nm = String(card.name ?? card.card_number ?? '').trim();
      if (!nm) return;
      const id = String(card.id);
      const st = String(card.status ?? 'active');
      const info: MerchantInfo = { id, name: nm, status: st };
      cardsData.byId.set(id, info);
      cardsData.byName.set(nm, info);
    });
    cardsData.initialized = true;
    setCache(CACHE_KEYS.CARDS, true, CACHE_CONFIG.ENTITY_DATA_TTL);
    console.log('[NameResolver] Cards loaded:', cardsData.byId.size);
  } catch (error) {
    console.error('[NameResolver] Failed to load cards:', error);
  }
}

async function loadVendors(): Promise<void> {
  if (isMemberPortalPath()) {
    markEmptyInitialized(vendorsData);
    return;
  }
  try {
    try {
      const data = await listVendorsApi();
      vendorsData.byId.clear();
      vendorsData.byName.clear();
      (data || []).forEach((v: { id: string; name: string; status?: string }) => {
        const info: MerchantInfo = { id: v.id, name: v.name, status: v.status || 'active' };
        vendorsData.byId.set(v.id, info);
        vendorsData.byName.set(v.name, info);
      });
      vendorsData.initialized = true;
      setCache(CACHE_KEYS.VENDORS, true, CACHE_CONFIG.ENTITY_DATA_TTL);
      console.log('[NameResolver] Vendors loaded via API:', vendorsData.byId.size);
      return;
    } catch (apiErr) {
      console.warn('[NameResolver] API load vendors failed, fallback to table proxy:', apiErr);
    }
    const raw = asRows(
      await apiGet<Record<string, unknown>>(`/api/data/table/vendors?select=id,name,status&limit=5000`).catch((err) => { console.warn('[nameResolver] vendors fallback fetch failed silently:', err); return []; }),
    );
    vendorsData.byId.clear();
    vendorsData.byName.clear();
    raw.forEach((vendor) => {
      const id = String(vendor.id);
      const name = String(vendor.name ?? '');
      const st = String(vendor.status ?? 'active');
      const info: MerchantInfo = { id, name, status: st };
      vendorsData.byId.set(id, info);
      vendorsData.byName.set(name, info);
    });
    vendorsData.initialized = true;
    setCache(CACHE_KEYS.VENDORS, true, CACHE_CONFIG.ENTITY_DATA_TTL);
    console.log('[NameResolver] Vendors loaded:', vendorsData.byId.size);
  } catch (error) {
    console.error('[NameResolver] Failed to load vendors:', error);
  }
}

async function loadPaymentProviders(): Promise<void> {
  if (isMemberPortalPath()) {
    markEmptyInitialized(providersData);
    return;
  }
  try {
    try {
      const data = await listPaymentProvidersApi();
      providersData.byId.clear();
      providersData.byName.clear();
      (data || []).forEach((p: { id: string; name: string; status?: string }) => {
        const info: MerchantInfo = { id: p.id, name: p.name, status: p.status || 'active' };
        providersData.byId.set(p.id, info);
        providersData.byName.set(p.name, info);
      });
      providersData.initialized = true;
      setCache(CACHE_KEYS.PAYMENT_PROVIDERS, true, CACHE_CONFIG.ENTITY_DATA_TTL);
      console.log('[NameResolver] Payment providers loaded via API:', providersData.byId.size);
      return;
    } catch (apiErr) {
      console.warn('[NameResolver] API load providers failed, fallback to table proxy:', apiErr);
    }
    const raw = asRows(
      await apiGet<{ id: string; name: string; status?: string }>(
        `/api/data/table/payment_providers?select=id,name,status&limit=5000`,
      ).catch((err) => { console.warn('[nameResolver] payment_providers fallback fetch failed silently:', err); return []; }),
    );
    providersData.byId.clear();
    providersData.byName.clear();
    raw.forEach((provider) => {
      const info: MerchantInfo = {
        id: provider.id,
        name: provider.name,
        status: provider.status || 'active',
      };
      providersData.byId.set(provider.id, info);
      providersData.byName.set(provider.name, info);
    });
    providersData.initialized = true;
    setCache(CACHE_KEYS.PAYMENT_PROVIDERS, true, CACHE_CONFIG.ENTITY_DATA_TTL);
    console.log('[NameResolver] Payment providers loaded:', providersData.byId.size);
  } catch (error) {
    console.error('[NameResolver] Failed to load payment providers:', error);
  }
}

// ============= 确保数据已加载 =============

function ensureEmployees(): boolean {
  if (employeesData.initialized && getCache(CACHE_KEYS.EMPLOYEES)) return true;
  loadEmployees().catch(console.error);
  return employeesData.initialized;
}

function ensureActivityTypes(): boolean {
  if (activityTypesData.initialized && getCache(CACHE_KEYS.ACTIVITY_TYPES)) return true;
  loadActivityTypes().catch(console.error);
  return activityTypesData.initialized;
}

function ensureCards(): boolean {
  if (cardsData.initialized && getCache(CACHE_KEYS.CARDS)) return true;
  loadCards().catch(console.error);
  return cardsData.initialized;
}

function ensureVendors(): boolean {
  if (vendorsData.initialized && getCache(CACHE_KEYS.VENDORS)) return true;
  loadVendors().catch(console.error);
  return vendorsData.initialized;
}

function ensureProviders(): boolean {
  if (providersData.initialized && getCache(CACHE_KEYS.PAYMENT_PROVIDERS)) return true;
  loadPaymentProviders().catch(console.error);
  return providersData.initialized;
}

// ============= 同步解析函数（主要API）=============

/**
 * 通过 ID 获取员工姓名
 */
export function getEmployeeNameById(employeeId: string | null | undefined): string {
  if (!employeeId) return '-';
  ensureEmployees();
  return employeesData.byId.get(employeeId)?.realName || '-';
}

/**
 * 通过 ID 获取员工信息
 */
export function getEmployeeById(employeeId: string | null | undefined): EmployeeInfo | null {
  if (!employeeId) return null;
  ensureEmployees();
  return employeesData.byId.get(employeeId) || null;
}

/**
 * 通过 value 获取活动类型标签
 */
export function getActivityTypeLabelByValue(value: string | null | undefined): string {
  if (!value) return '-';
  ensureActivityTypes();
  return activityTypesData.byName.get(value)?.label || value;
}

/**
 * 解析卡片名称（传入 ID 或名称，返回当前最新名称）
 */
export function resolveCardName(storedValue: string | null | undefined): string {
  if (!storedValue) return '';
  ensureCards();
  
  // 先尝试作为 ID 查找
  const byId = cardsData.byId.get(storedValue);
  if (byId) return byId.name;
  
  // 再尝试作为名称查找
  const byName = cardsData.byName.get(storedValue);
  if (byName) return byName.name;

  return tryRecoverMisdecodedUtf8(storedValue);
}

/**
 * 解析卡商名称（传入 ID 或名称，返回当前最新名称）
 */
export function resolveVendorName(storedValue: string | null | undefined): string {
  if (!storedValue) return '';
  ensureVendors();
  
  const byId = vendorsData.byId.get(storedValue);
  if (byId) return byId.name;
  
  const byName = vendorsData.byName.get(storedValue);
  if (byName) return byName.name;

  return tryRecoverMisdecodedUtf8(storedValue);
}

/**
 * 解析代付商家名称（传入 ID 或名称，返回当前最新名称）
 */
export function resolveProviderName(storedValue: string | null | undefined): string {
  if (!storedValue) return '';
  ensureProviders();
  
  const byId = providersData.byId.get(storedValue);
  if (byId) return byId.name;
  
  const byName = providersData.byName.get(storedValue);
  if (byName) return byName.name;

  return tryRecoverMisdecodedUtf8(storedValue);
}

// ============= ID 获取函数（用于存储时将名称转为 ID）=============

/**
 * 通过名称获取卡片 ID
 */
export function getCardIdByName(name: string | null | undefined): string | null {
  if (!name) return null;
  ensureCards();
  
  // 先检查是否已经是 UUID
  if (cardsData.byId.has(name)) return name;
  
  // 通过名称查找
  return cardsData.byName.get(name)?.id || null;
}

/**
 * 通过名称获取卡商 ID
 */
export function getVendorId(name: string | null | undefined): string | null {
  if (!name) return null;
  ensureVendors();
  
  if (vendorsData.byId.has(name)) return name;
  return vendorsData.byName.get(name)?.id || null;
}

/**
 * 通过名称获取代付商家 ID
 */
export function getProviderId(name: string | null | undefined): string | null {
  if (!name) return null;
  ensureProviders();
  
  if (providersData.byId.has(name)) return name;
  return providersData.byName.get(name)?.id || null;
}

// ============= 异步获取函数 =============

/**
 * 异步获取员工姓名
 */
export async function getEmployeeNameByIdAsync(employeeId: string | null | undefined): Promise<string> {
  if (!employeeId) return '-';
  
  // 确保数据已加载
  if (!employeesData.initialized) {
    await loadEmployees();
  }
  
  const employee = employeesData.byId.get(employeeId);
  if (employee) return employee.realName;
  
  // 如果缓存中没有，直接查询
  try {
    const data = await getEmployeeApi(employeeId);
    return data?.real_name || '-';
  } catch (error) {
    console.error('[NameResolver] Failed to get employee name:', error);
    return '-';
  }
}

// ============= 刷新函数 =============

export async function refreshEmployees(): Promise<void> {
  clearCache(CACHE_KEYS.EMPLOYEES);
  employeesData.initialized = false;
  await loadEmployees();
  notifySubscribers();
}

export async function refreshActivityTypes(): Promise<void> {
  clearCache(CACHE_KEYS.ACTIVITY_TYPES);
  activityTypesData.initialized = false;
  await loadActivityTypes();
  notifySubscribers();
}

export async function refreshCards(): Promise<void> {
  clearCache(CACHE_KEYS.CARDS);
  cardsData.initialized = false;
  await loadCards();
  notifySubscribers();
}

export async function refreshVendors(): Promise<void> {
  clearCache(CACHE_KEYS.VENDORS);
  vendorsData.initialized = false;
  await loadVendors();
  notifySubscribers();
}

export async function refreshProviders(): Promise<void> {
  clearCache(CACHE_KEYS.PAYMENT_PROVIDERS);
  providersData.initialized = false;
  await loadPaymentProviders();
  notifySubscribers();
}

export async function refreshMerchants(): Promise<void> {
  await Promise.all([refreshCards(), refreshVendors(), refreshProviders()]);
}

export async function refreshAll(): Promise<void> {
  await Promise.all([
    refreshEmployees(),
    refreshActivityTypes(),
    refreshCards(),
    refreshVendors(),
    refreshProviders(),
  ]);
}

// ============= 订阅者管理 =============

function notifySubscribers(): void {
  subscribers.forEach(callback => callback());
}

export function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

// ============= 初始化 =============

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * 初始化名称解析器（应用启动时调用）
 */
export async function initNameResolver(): Promise<void> {
  if (initialized) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  
  initPromise = (async () => {
    console.log('[NameResolver] Initializing...');
    
    // 并行加载所有数据
    await Promise.all([
      loadEmployees(),
      loadActivityTypes(),
      loadCards(),
      loadVendors(),
      loadPaymentProviders(),
    ]);
    
    // 设置 Realtime 订阅
    subscribeTableChanges('employees', CACHE_KEYS.EMPLOYEES, () => {
      employeesData.initialized = false;
      loadEmployees().then(notifySubscribers);
    });
    subscribeTableChanges('activity_types', CACHE_KEYS.ACTIVITY_TYPES, () => {
      activityTypesData.initialized = false;
      loadActivityTypes().then(notifySubscribers);
    });
    subscribeTableChanges('cards', CACHE_KEYS.CARDS, () => {
      cardsData.initialized = false;
      loadCards().then(notifySubscribers);
    });
    subscribeTableChanges('vendors', CACHE_KEYS.VENDORS, () => {
      vendorsData.initialized = false;
      loadVendors().then(notifySubscribers);
    });
    subscribeTableChanges('payment_providers', CACHE_KEYS.PAYMENT_PROVIDERS, () => {
      providersData.initialized = false;
      loadPaymentProviders().then(notifySubscribers);
    });
    
    initialized = true;
    console.log('[NameResolver] Initialized with Realtime subscriptions');
  })();
  
  await initPromise;
}

/**
 * 检查解析器是否已就绪
 */
export function isReady(): boolean {
  return initialized && 
    employeesData.initialized && 
    activityTypesData.initialized &&
    cardsData.initialized &&
    vendorsData.initialized &&
    providersData.initialized;
}


// ============= Reset Function (账号切换时调用) =============

export function resetNameResolver(): void {
  employeesData = { byId: new Map(), byName: new Map(), initialized: false };
  activityTypesData = { byId: new Map(), byName: new Map(), initialized: false };
  cardsData = { byId: new Map(), byName: new Map(), initialized: false };
  vendorsData = { byId: new Map(), byName: new Map(), initialized: false };
  providersData = { byId: new Map(), byName: new Map(), initialized: false };
  initialized = false;
  initPromise = null;
  console.log('[NameResolver] Reset complete');
}
