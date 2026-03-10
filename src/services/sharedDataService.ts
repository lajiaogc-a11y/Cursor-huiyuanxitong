// ============= Shared Data Service =============
// 租户隔离的共享数据服务 - 每个租户的配置独立存储
// 使用 shared_data_store 表（含 tenant_id 列）
// 由 SharedDataTenantProvider 设置当前 tenant_id

import { supabase } from '@/integrations/supabase/client';

// 当前有效的租户 ID（由 SharedDataTenantProvider 设置）
let _sharedDataTenantId: string | null = null;
export function setSharedDataTenantId(tenantId: string | null) {
  _sharedDataTenantId = tenantId;
}
function getEffectiveTenantId(): string | null {
  return _sharedDataTenantId;
}
import { 
  getCache, 
  setCache, 
  clearCache as clearCacheKey, 
  clearAllCache,
  CACHE_CONFIG,
  CACHE_KEYS,
} from './cacheManager';
import { throttle, isUserTyping } from '@/lib/performanceUtils';

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
  usdtRate: number;    // USDT汇率（如 6.91）
  lastUpdated: string; // 最后更新时间
}

// 获取共享数据的缓存键（含租户维度）
function getSharedCacheKey(dataKey: SharedDataKey, tenantId?: string | null): string {
  const tid = tenantId ?? getEffectiveTenantId();
  return `${CACHE_KEYS.SHARED_DATA}${tid ?? 'global'}::${dataKey}`;
}

// ============= 核心读写函数 =============

// 从数据库读取共享数据（按当前租户）
export async function loadSharedData<T>(dataKey: SharedDataKey): Promise<T | null> {
  try {
    const tenantId = getEffectiveTenantId();
    if (!tenantId) {
      return null;
    }
    const cacheKey = getSharedCacheKey(dataKey, tenantId);
    
    const cached = getCache<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const { data, error } = await supabase
      .from('shared_data_store')
      .select('data_value')
      .eq('data_key', dataKey)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const result = data.data_value as T;
    setCache(cacheKey, result, CACHE_CONFIG.SHARED_DATA_TTL);
    return result;
  } catch (error) {
    console.error(`[SharedData] Failed to load ${dataKey}:`, error);
    return null;
  }
}

// 保存共享数据到数据库（按当前租户）
export async function saveSharedData<T>(dataKey: SharedDataKey, value: T): Promise<boolean> {
  try {
    const tenantId = getEffectiveTenantId();
    if (!tenantId) {
      console.warn('[SharedData] No tenant context, skip save');
      return false;
    }

    const { error } = await supabase
      .from('shared_data_store')
      .upsert(
        {
          tenant_id: tenantId,
          data_key: dataKey,
          data_value: value as any,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,data_key' }
      );

    if (error) throw error;

    const cacheKey = getSharedCacheKey(dataKey, tenantId);
    setCache(cacheKey, value, CACHE_CONFIG.SHARED_DATA_TTL);
    return true;
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

    const { error } = await supabase
      .from('shared_data_store')
      .delete()
      .eq('data_key', dataKey)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    clearCacheKey(getSharedCacheKey(dataKey, tenantId));
    return true;
  } catch (error) {
    console.error(`[SharedData] Failed to delete ${dataKey}:`, error);
    return false;
  }
}

// ============= 同步版本（带缓存）=============

// 同步获取（优先使用缓存，异步加载更新缓存）
export function getSharedDataSync<T>(dataKey: SharedDataKey, defaultValue: T): T {
  const tenantId = getEffectiveTenantId();
  const cacheKey = getSharedCacheKey(dataKey, tenantId);
  const cached = getCache<T>(cacheKey);
  
  if (cached !== null) {
    loadSharedData<T>(dataKey).catch(console.error);
    return cached;
  }
  if (tenantId) loadSharedData<T>(dataKey).catch(console.error);
  return defaultValue;
}

// 同步保存（立即更新缓存，异步写入数据库）
export function saveSharedDataSync<T>(dataKey: SharedDataKey, value: T): void {
  const tenantId = getEffectiveTenantId();
  const cacheKey = getSharedCacheKey(dataKey, tenantId);
  setCache(cacheKey, value, CACHE_CONFIG.SHARED_DATA_TTL);
  if (tenantId) saveSharedData(dataKey, value).catch(console.error);
}

// ============= 批量操作 =============

// 批量加载多个共享数据（按当前租户）
export async function loadMultipleSharedData(keys: SharedDataKey[]): Promise<Record<string, any>> {
  try {
    const tenantId = getEffectiveTenantId();
    if (!tenantId) return {};

    const { data, error } = await supabase
      .from('shared_data_store')
      .select('data_key, data_value')
      .eq('tenant_id', tenantId)
      .in('data_key', keys);

    if (error) throw error;

    const result: Record<string, any> = {};
    data?.forEach(item => {
      result[item.data_key] = item.data_value;
      setCache(getSharedCacheKey(item.data_key as SharedDataKey, tenantId), item.data_value, CACHE_CONFIG.SHARED_DATA_TTL);
    });
    return result;
  } catch (error) {
    console.error('[SharedData] Failed to load multiple:', error);
    return {};
  }
}

// ============= 实时订阅 =============

// 订阅共享数据变更 - 使用节流优化
export function subscribeToSharedData(
  callback: (key: SharedDataKey, value: any) => void
): () => void {
  // 使用节流包装回调，减少高频更新（优化：200ms节流，提升响应速度）
  const throttledCallback = throttle((key: SharedDataKey, value: any) => {
    // 如果用户正在输入，延迟执行
    if (isUserTyping()) {
      setTimeout(() => throttledCallback(key, value), 300);
      return;
    }
    callback(key, value);
  }, 200);

  const channel = supabase
    .channel('shared_data_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shared_data_store',
      },
      (payload) => {
        const newData = payload.new as { data_key: string; data_value: any; tenant_id?: string } | undefined;
        if (newData && newData.tenant_id === getEffectiveTenantId()) {
          const key = newData.data_key as SharedDataKey;
          setCache(getSharedCacheKey(key, newData.tenant_id), newData.data_value, CACHE_CONFIG.SHARED_DATA_TTL);
          throttledCallback(key, newData.data_value);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ============= 缓存管理 =============

// 清除所有共享数据缓存
export function clearCache(): void {
  // 只清除共享数据前缀的缓存
  import('./cacheManager').then(({ clearCacheByPrefix, CACHE_KEYS }) => {
    clearCacheByPrefix(CACHE_KEYS.SHARED_DATA);
  });
}

// 清除指定共享数据缓存
export function clearSharedCacheKey(dataKey: SharedDataKey): void {
  clearCacheKey(getSharedCacheKey(dataKey));
}

// 租户切换时清除缓存（由 SharedDataTenantProvider 在 tenant 变化时调用）
export function clearSharedDataCacheForTenantSwitch(): void {
  import('./cacheManager').then(({ clearCacheByPrefix, CACHE_KEYS }) => {
    clearCacheByPrefix(CACHE_KEYS.SHARED_DATA);
  });
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
    nairaThresholdFee: 200,
    cediThreshold: 500,
    cediThresholdFee: 2,
    usdtFee: 1,
  },
  trxSettings: {
    rate: 0,
    quantity: 0,
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
  copySettings: {
    template: '',
    includeRate: true,
    includeTime: true,
  },
  workMemos: [],
  production_lock: {
    isLocked: false,
    lockedBy: null,
    lockedAt: null,
  },
  auditSettings: {
    requireApproval: false,
    approvers: [],
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

// 确保默认数据存在（按当前租户，登录后调用）
export async function ensureDefaultSharedData(): Promise<void> {
  try {
    const tenantId = getEffectiveTenantId();
    if (!tenantId) return;

    const { data: existingData, error } = await supabase
      .from('shared_data_store')
      .select('data_key')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[SharedData] Failed to check existing data:', error);
      return;
    }

    const existingKeys = new Set(existingData?.map(d => d.data_key) || []);
    const keysToInit = Object.keys(DEFAULT_SHARED_DATA).filter(
      key => !existingKeys.has(key)
    ) as SharedDataKey[];

    if (keysToInit.length === 0) return;

    const insertData = keysToInit.map(key => ({
      tenant_id: tenantId,
      data_key: key,
      data_value: DEFAULT_SHARED_DATA[key],
    }));

    const { error: insertError } = await supabase
      .from('shared_data_store')
      .insert(insertData);

    if (insertError) {
      console.error('[SharedData] Failed to insert default data:', insertError);
      return;
    }
    console.log('[SharedData] Initialized', keysToInit.length, 'keys for tenant');
  } catch (error) {
    console.error('[SharedData] Error in ensureDefaultSharedData:', error);
  }
}
