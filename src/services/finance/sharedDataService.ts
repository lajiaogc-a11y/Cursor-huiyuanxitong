// ============= Shared Data Service =============
// 租户隔离的共享数据服务 - 每个租户的配置独立存储
// 使用 shared_data_store 表（含 tenant_id 列）
// 由 SharedDataTenantProvider 设置当前 tenant_id
//
// 下方经 cacheManager 的 TTL 内存缓存仅作请求加速；读写的权威来源仍为后端 API / 数据库。

import { apiDelete } from '@/api/client';

// 当前有效的租户 ID（由 SharedDataTenantProvider 设置）
let _sharedDataTenantId: string | null = null;
export function setSharedDataTenantId(tenantId: string | null) {
  _sharedDataTenantId = tenantId;
}
/** 当前员工端生效租户（由 Auth/SharedDataTenantProvider 设置），供 Webhook 等需 tenant_id 的写入使用 */
export function getSharedDataTenantId(): string | null {
  return _sharedDataTenantId;
}
function getEffectiveTenantId(): string | null {
  return _sharedDataTenantId;
}
import { 
  getCache, 
  setCache, 
  clearCache as clearCacheKey, 
  clearCacheByPrefix,
  clearAllCache,
  CACHE_CONFIG,
  CACHE_KEYS,
} from '@/services/cacheManager';
import { throttle, isUserTyping } from '@/lib/performanceUtils';
import { getSharedDataApi, postSharedDataApi, getSharedDataBatchApi } from '@/services/staff/dataApi';
import { DEFAULT_COPY_SETTINGS, normalizeCopySettingsFromStorage } from '@/lib/copySettingsDefaults';

export type SharedDataKey = 
  | 'feeSettings'
  | 'trxSettings'
  | 'points_settings'
  | 'activitySettings'
  | 'systemSettings_usdtFee'
  | 'countries'
  | 'rateSettingEntries'
  | 'cardMerchantSettlements'
  | 'paymentProviderSettlements'
  | 'rewardTypeSettings'
  | 'workMemos'
  | 'memoSettings' // 备忘录自动清理设置
  | 'quickAmounts'
  | 'quickRates'
  // 新增迁移的数据键
  | 'copySettings'
  | 'exchangeRateSettings'
  | 'auditSettings'
  | 'auditItems'
  | 'employeePermissions'
  | 'retentionSettings'
  // 汇率采集设置
  | 'currencyRatesToNGN'
  | 'currencyRatesAutoUpdate'
  // 生产锁定状态
  | 'production_lock'
  // 三个独立计算器的表单数据
  | 'calculatorFormData_1'
  | 'calculatorFormData_2'
  | 'calculatorFormData_3'
  // 汇率计算器USDT汇率
  | 'calculatorUsdtRate'
  // 汇率计算页面手动输入的汇率（人民币基准）
  | 'calculatorInputRates'
  // USDT汇率计算配置（百分比模式）
  | 'usdtRateConfig'
  // 自定义权限模板
  | 'customPermissionTemplates'
  // 活动赠送分配比例设置
  | 'giftDistributionSettings'
  // 员工手动活动占比设置
  | 'employeeManualGiftRatios'
  // 表单持久化数据（数据库存储，替代 localStorage）
  | 'referralEntryForm'
  | 'shiftHandoverForm'
  | 'activityGiftForm'
  // BTC价格自动采集设置
  | 'btcPriceSettings'
  // USDT实时汇率数据和配置
  | 'usdtLiveRates'
  | 'usdtLiveRateConfig'
  // 马来西亚林吉特兑奈拉汇率（海报等）
  | 'myrToNgnRate'
  // 海报表格列勾选（勾选=生成海报时显示）
  | 'posterTableColumns';

// 汇率计算器手动输入汇率数据结构
export interface CalculatorInputRates {
  nairaRate: number;   // 奈拉汇率（如 210）
  cediRate: number;    // 赛地汇率（如 0.6）
  usdtRate: number;    // USDT 中间价/展示用（如 6.91，来自采集 mid）
  /** USDT 采集卖价（CNY/USDT，对应 usdtLiveRates.bid / 汇率页「卖出价」），活动赠送优先使用 */
  usdtSellRate?: number;
  lastUpdated: string; // 最后更新时间
}

/**
 * 活动赠送 / 积分兑换 USDT 计价：必须使用汇率计算页 USDT **采集卖出价**（CNY/USDT，对应采集 bid / 界面「卖出价」）。
 * 无卖价时回退 `usdtRate`（中间价），兼容仅手输中间价、尚未采集的旧数据。
 */
export function resolveUsdtRateForActivityGift(rates: CalculatorInputRates | null | undefined): number {
  if (!rates) return 0;
  const sell = rates.usdtSellRate;
  if (sell != null && sell > 0) return sell;
  return rates.usdtRate > 0 ? rates.usdtRate : 0;
}

// 获取共享数据的缓存键（含租户维度）
function getSharedCacheKey(dataKey: SharedDataKey, tenantId?: string | null): string {
  const tid = tenantId ?? getEffectiveTenantId();
  return `${CACHE_KEYS.SHARED_DATA}${tid ?? 'global'}::${dataKey}`;
}

// ============= 核心读写函数 =============

// 从数据库读取共享数据（按当前租户）- 使用后端 API（JWT 认证，租户员工可正确获取）
export async function loadSharedData<T>(dataKey: SharedDataKey): Promise<T | null> {
  const tenantId = getEffectiveTenantId();
  const cacheKey = getSharedCacheKey(dataKey, tenantId);
  const cached = getCache<T>(cacheKey);
  if (cached !== null) {
    if (dataKey === 'copySettings') {
      return normalizeCopySettingsFromStorage(cached) as T;
    }
    return cached;
  }

  try {
    // 传 null 时后端使用 req.user.tenant_id（租户员工）
    const result = await getSharedDataApi<T>(dataKey, tenantId || undefined);
    if (result !== null && result !== undefined) {
      const toStore =
        dataKey === 'copySettings' ? normalizeCopySettingsFromStorage(result) : result;
      setCache(cacheKey, toStore, CACHE_CONFIG.SHARED_DATA_TTL);
      return toStore as T;
    }
    return null;
  } catch (error) {
    console.error(`[SharedData] Failed to load ${dataKey}:`, error);
    return null;
  }
}

// 保存共享数据到数据库（按当前租户）- 使用后端 API（JWT 认证）
export async function saveSharedData<T>(dataKey: SharedDataKey, value: T): Promise<boolean> {
  const tenantId = getEffectiveTenantId();
  const cacheKey = getSharedCacheKey(dataKey, tenantId);
  // Optimistically update local cache BEFORE the API call so any concurrent
  // reads (polling, event-driven reload) see the latest data even if the HTTP
  // round-trip is still in-flight or fails transiently.
  setCache(cacheKey, value, CACHE_CONFIG.SHARED_DATA_TTL);
  try {
    const ok = await postSharedDataApi(dataKey, value, tenantId || undefined);
    if (!ok) {
      console.warn(`[SharedData] postSharedDataApi returned false for ${dataKey} – local cache already updated`);
    }
    return ok;
  } catch (error) {
    console.error(`[SharedData] Failed to save ${dataKey}:`, error);
    return false;
  }
}

// 删除共享数据（按当前租户）
export async function deleteSharedData(dataKey: SharedDataKey): Promise<boolean> {
  try {
    const tenantId = getEffectiveTenantId();
    if (!tenantId) return false;

    await apiDelete(
      `/api/data/table/shared_data_store?data_key=eq.${encodeURIComponent(dataKey)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
    );
    clearCacheKey(getSharedCacheKey(dataKey, tenantId));
    return true;
  } catch (error) {
    console.error(`[SharedData] Failed to delete ${dataKey}:`, error);
    return false;
  }
}

// ============= 同步版本（带缓存）=============

// 同步获取（优先使用缓存，异步加载更新缓存）
// 无 tenant 时也会触发 loadSharedData，由 RPC 在服务端解析 tenant
export function getSharedDataSync<T>(dataKey: SharedDataKey, defaultValue: T): T {
  const tenantId = getEffectiveTenantId();
  const cacheKey = getSharedCacheKey(dataKey, tenantId);
  const cached = getCache<T>(cacheKey);
  
  if (cached !== null) {
    loadSharedData<T>(dataKey).catch(console.error);
    return cached;
  }
  loadSharedData<T>(dataKey).catch(console.error);
  return defaultValue;
}

// 同步保存（立即更新缓存，异步写入数据库）
// 无 tenant 时也会调用 saveSharedData，由 RPC 在服务端解析 tenant
export function saveSharedDataSync<T>(dataKey: SharedDataKey, value: T): void {
  const tenantId = getEffectiveTenantId();
  const cacheKey = getSharedCacheKey(dataKey, tenantId);
  setCache(cacheKey, value, CACHE_CONFIG.SHARED_DATA_TTL);
  saveSharedData(dataKey, value).catch(console.error);
}

// ============= 批量操作 =============

// 批量加载多个共享数据（按当前租户）- 使用后端 API
export async function loadMultipleSharedData(keys: SharedDataKey[]): Promise<Record<string, any>> {
  try {
    const tenantId = getEffectiveTenantId();
    if (keys.length === 0) return {};

    const data = await getSharedDataBatchApi(keys as string[], tenantId || undefined);
    const result: Record<string, any> = {};
    Object.entries(data).forEach(([k, v]) => {
      const val =
        k === 'copySettings' ? normalizeCopySettingsFromStorage(v) : v;
      result[k] = val;
      setCache(getSharedCacheKey(k as SharedDataKey, tenantId), val, CACHE_CONFIG.SHARED_DATA_TTL);
    });
    return result;
  } catch (error) {
    console.error('[SharedData] Failed to load multiple:', error);
    return {};
  }
}

// ============= 实时订阅 =============

// 订阅共享数据变更 - 定时轮询（无推送时的兜底刷新）
export function subscribeToSharedData(
  callback: (key: SharedDataKey, value: any) => void
): () => void {
  // 使用节流包装回调，减少高频更新
  const throttledCallback = throttle((key: SharedDataKey, value: any) => {
    if (isUserTyping()) {
      setTimeout(() => throttledCallback(key, value), 300);
      return;
    }
    callback(key, value);
  }, 200);

  // 轮询：每 30 秒重新加载常用 key 并对比变化
  const timer = setInterval(async () => {
    try {
      const tenantId = getEffectiveTenantId();
      if (!tenantId) return;
      const commonKeys: SharedDataKey[] = [
        'feeSettings', 'trxSettings', 'points_settings', 'activitySettings',
        'exchangeRateSettings', 'rewardTypeSettings', 'copySettings',
        'employeePermissions', 'auditSettings', 'production_lock',
      ];
      for (const key of commonKeys) {
        const cacheKey = getSharedCacheKey(key, tenantId);
        const oldCached = getCache(cacheKey);
        const fresh = await loadSharedData(key);
        if (fresh !== null && JSON.stringify(fresh) !== JSON.stringify(oldCached)) {
          throttledCallback(key, fresh);
        }
      }
    } catch { /* polling: ignore transient failures */ }
  }, 30000);

  return () => {
    clearInterval(timer);
  };
}

// ============= 缓存管理 =============

// 清除所有共享数据缓存
export function clearCache(): void {
  clearCacheByPrefix(CACHE_KEYS.SHARED_DATA);
}

// 清除指定共享数据缓存
export function clearSharedCacheKey(dataKey: SharedDataKey): void {
  clearCacheKey(getSharedCacheKey(dataKey));
}

// 租户切换时清除缓存（由 SharedDataTenantProvider 在 tenant 变化时调用）
export function clearSharedDataCacheForTenantSwitch(): void {
  clearCacheByPrefix(CACHE_KEYS.SHARED_DATA);
}

// 预加载常用数据
export async function preloadSharedData(): Promise<void> {
  const commonKeys: SharedDataKey[] = [
    'feeSettings',
    'trxSettings',
    'points_settings',
    'activitySettings',
    'copySettings',
    'exchangeRateSettings',
    'auditSettings',
    'employeePermissions',
    'rewardTypeSettings',
    'currencyRatesToNGN',
    'currencyRatesAutoUpdate',
    'rateSettingEntries',
  ];
  
  await loadMultipleSharedData(commonKeys);
}

// ============= 默认数据定义 =============

const DEFAULT_SHARED_DATA: Partial<Record<SharedDataKey, any>> = {
  feeSettings: {
    nairaThreshold: 100000,
    nairaFeeAbove: 0,
    nairaFeeBelow: 200,
    cediThreshold: 500,
    cediFeeAbove: 0,
    cediFeeBelow: 2,
    usdtExchangeRate: 0,
  },
  trxSettings: {
    trxRate: 0,
    trxQuantity: 0,
    lastUpdated: new Date().toISOString(),
  },
  points_settings: {
    mode: 'auto',
    ngnToUsdRate: 1580,
    ghsToUsdRate: 15.5,
    usdToPointsRate: 1,
    ngnFormulaMultiplier: 1,
    ghsFormulaMultiplier: 1,
    usdtFormulaMultiplier: 1,
    usdtCoefficient: 1,
    lastAutoUpdate: '',
    lastManualUpdate: '',
    lastFetchedNgnRate: 1580,
    lastFetchedGhsRate: 15.5,
    referralPointsPerAction: 1,
    consumptionPointsPerAction: 1,
    referralMode1Enabled: true,
    referralMode: 'mode1',
    referralMode2Percentage: 10,
    referralMode2Enabled: false,
    referralActivityEnabled: true,
  },
  activitySettings: {
    accumulatedRewardTiers: [],
    referralReward: {
      isEnabled: true,
      pointsPerReferral: 5,
    },
    activity2Config: {
      pointsToNGN: 1000,
      pointsToGHS: 10,
    },
  },
  exchangeRateSettings: {
    usdToNgn: 1650,
    usdToGhs: 16,
    autoUpdate: false,
  },
  rewardTypeSettings: [
    { id: 'gift', name: '赠送奖励', isActive: true },
    { id: 'referral', name: '推荐奖励', isActive: true },
    { id: 'consumption', name: '消费奖励', isActive: true },
  ],
  copySettings: { ...DEFAULT_COPY_SETTINGS },
  workMemos: [],
  production_lock: {
    isLocked: false,
    lockedBy: null,
    lockedAt: null,
  },
  auditSettings: {
    orderFields: [],
    memberFields: [],
    activityFields: [],
    orderOperations: [],
    allow_manual_member_level: false,
  },
  employeePermissions: {},
  quickAmounts: [1000, 5000, 10000, 50000, 100000],
  quickRates: [],
  currencyRatesToNGN: {
    GHS: 100,
    USDT: 1650,
  },
  currencyRatesAutoUpdate: {
    enabled: false,
    interval: 3600,
  },
  retentionSettings: {
    days: 30,
  },
  auditItems: [],
  countries: [],
  systemSettings_usdtFee: 1,
  rateSettingEntries: [],
  cardMerchantSettlements: [],
  paymentProviderSettlements: [],
  giftDistributionSettings: {
    distributionRatio: 100,
    enabled: false,
  },
  employeeManualGiftRatios: {},
};

// ============= 数据初始化 =============

// 确保默认数据存在（按当前租户，登录后调用）- 通过 load/save 逐个检查并插入
export async function ensureDefaultSharedData(): Promise<void> {
  try {
    const tenantId = getEffectiveTenantId();
    if (!tenantId) return;

    const keysToInit = Object.keys(DEFAULT_SHARED_DATA) as SharedDataKey[];
    let initialized = 0;
    for (const key of keysToInit) {
      const existing = await loadSharedData(key);
      if (existing === null || existing === undefined) {
        const defaultValue = DEFAULT_SHARED_DATA[key];
        if (defaultValue !== undefined && (await saveSharedData(key, defaultValue))) {
          initialized++;
        }
      }
    }
    if (initialized > 0) {
      console.log('[SharedData] Initialized', initialized, 'keys for tenant');
    }
  } catch (error) {
    console.error('[SharedData] Error in ensureDefaultSharedData:', error);
  }
}
