// ============= Unified Cache Manager =============
// 统一缓存管理服务 - 集中管理所有内存缓存的 TTL 和生命周期（进程内 Map，非 localStorage）。
// 各业务模块仍以数据库 / API 为真源；此处仅减少重复请求。

// ============= 统一配置 =============
export const CACHE_CONFIG = {
  // 共享数据缓存 (feeSettings, exchangeRateSettings 等)
  SHARED_DATA_TTL: 30000, // 30秒（优化：提升数据新鲜度）
  
  // 静态配置数据缓存 (currencies, activity_types 等不常变化的数据)
  STATIC_CONFIG_TTL: 300000, // 300秒 / 5分钟（新增：静态配置可更长时间缓存）
  
  // 实体数据缓存 (employees, cards, vendors 等)
  ENTITY_DATA_TTL: 120000, // 120秒（配合 Realtime 订阅自动失效）
  
  // 操作员信息缓存
  OPERATOR_TTL: 60000, // 60秒
} as const;

// ============= 缓存类型定义 =============
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

type CacheKey = string;

// ============= 内存缓存存储 =============
const cacheStore = new Map<CacheKey, CacheEntry<any>>();

// ============= 订阅管理 =============
const subscriptions = new Map<string, () => void>();

// ============= 核心缓存操作 =============

/**
 * 获取缓存数据
 */
export function getCache<T>(key: CacheKey): T | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  
  // 检查是否过期
  if (Date.now() - entry.timestamp > entry.ttl) {
    cacheStore.delete(key);
    return null;
  }
  
  return entry.data as T;
}

/**
 * 设置缓存数据
 */
export function setCache<T>(key: CacheKey, data: T, ttl: number = CACHE_CONFIG.SHARED_DATA_TTL): void {
  cacheStore.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

/**
 * 检查缓存是否有效（未过期）
 */
export function isCacheValid(key: CacheKey): boolean {
  const entry = cacheStore.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp <= entry.ttl;
}

/**
 * 清除指定缓存
 */
export function clearCache(key: CacheKey): void {
  cacheStore.delete(key);
}

/**
 * 清除所有缓存
 */
export function clearAllCache(): void {
  cacheStore.clear();
}

/**
 * 清除指定前缀的所有缓存
 */
export function clearCacheByPrefix(prefix: string): void {
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}

// ============= 缓存键前缀常量 =============
export const CACHE_KEYS = {
  SHARED_DATA: 'shared:',
  EMPLOYEES: 'entity:employees',
  ACTIVITY_TYPES: 'entity:activity_types',
  VENDORS: 'entity:vendors',
  CARDS: 'entity:cards',
  PAYMENT_PROVIDERS: 'entity:payment_providers',
  OPERATOR: 'operator:current',
} as const;

// ============= Realtime 订阅管理 =============

/**
 * 订阅表变更，自动清除相关缓存（轮询实现，原 supabase realtime 已移除）
 */
export function subscribeTableChanges(
  tableName: string,
  cacheKey: CacheKey,
  onUpdate?: () => void
): void {
  const subscriptionKey = `table:${tableName}`;
  
  // 避免重复订阅
  if (subscriptions.has(subscriptionKey)) {
    return;
  }
  
  // 轮询：每 30 秒清除缓存并触发回调
  const timer = setInterval(() => {
    clearCache(cacheKey);
    onUpdate?.();
  }, 30000);
  
  const unsubscribe = () => {
    clearInterval(timer);
    subscriptions.delete(subscriptionKey);
  };
  
  subscriptions.set(subscriptionKey, unsubscribe);
}

/**
 * 取消所有订阅
 */
export function unsubscribeAll(): void {
  for (const unsubscribe of subscriptions.values()) {
    unsubscribe();
  }
  subscriptions.clear();
}

// ============= 缓存统计（调试用）=============

export function getCacheStats(): {
  size: number;
  keys: string[];
  validKeys: string[];
  expiredKeys: string[];
} {
  const now = Date.now();
  const validKeys: string[] = [];
  const expiredKeys: string[] = [];
  
  for (const [key, entry] of cacheStore.entries()) {
    if (now - entry.timestamp <= entry.ttl) {
      validKeys.push(key);
    } else {
      expiredKeys.push(key);
    }
  }
  
  return {
    size: cacheStore.size,
    keys: Array.from(cacheStore.keys()),
    validKeys,
    expiredKeys,
  };
}

// ============= 高级缓存操作 =============

/**
 * 获取或加载缓存数据
 * 如果缓存存在且有效，返回缓存；否则执行加载函数并缓存结果
 */
export async function getOrLoad<T>(
  key: CacheKey,
  loader: () => Promise<T>,
  ttl: number = CACHE_CONFIG.SHARED_DATA_TTL
): Promise<T> {
  const cached = getCache<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  const data = await loader();
  setCache(key, data, ttl);
  return data;
}

/**
 * 获取缓存或返回默认值，同时异步刷新
 */
export function getOrDefault<T>(
  key: CacheKey,
  defaultValue: T,
  loader: () => Promise<T>,
  ttl: number = CACHE_CONFIG.SHARED_DATA_TTL
): T {
  const cached = getCache<T>(key);
  
  // 无论是否有缓存，都异步刷新
  loader().then(data => {
    setCache(key, data, ttl);
  }).catch(console.error);
  
  return cached ?? defaultValue;
}

// ============= 初始化 =============

let initialized = false;

/**
 * 初始化缓存管理器
 * 设置核心表的 Realtime 订阅
 */
export function initializeCacheManager(): void {
  if (initialized) return;
  
  // 订阅核心实体表变更
  subscribeTableChanges('employees', CACHE_KEYS.EMPLOYEES);
  subscribeTableChanges('activity_types', CACHE_KEYS.ACTIVITY_TYPES);
  subscribeTableChanges('vendors', CACHE_KEYS.VENDORS);
  subscribeTableChanges('cards', CACHE_KEYS.CARDS);
  subscribeTableChanges('payment_providers', CACHE_KEYS.PAYMENT_PROVIDERS);
  
  initialized = true;
  console.log('[CacheManager] Initialized with Realtime subscriptions');
}

/**
 * 清理缓存管理器
 */
export function cleanupCacheManager(): void {
  unsubscribeAll();
  clearAllCache();
  initialized = false;
  console.log('[CacheManager] Cleaned up');
}

// ============= 统一广播订阅（减少连接开销）=============

/**
 * 订阅核心表变更（轮询实现，原 supabase realtime 已移除）
 */
export function subscribeCoreTables(onUpdate: () => void): () => void {
  const timer = setInterval(onUpdate, 30000);
  return () => clearInterval(timer);
}
