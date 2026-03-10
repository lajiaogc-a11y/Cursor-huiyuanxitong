// Points Settings Store - 积分规则配置
// 所有数据存储在线上数据库，不使用本地存储

import { loadSharedData, saveSharedData, saveSharedDataSync } from '@/services/sharedDataService';
import { logOperation } from './auditLogStore';

export type PointsMode = 'auto' | 'manual';

export type ReferralMode = 'mode1' | 'mode2';

export interface PointsSettings {
  mode: PointsMode;
  // 各币种兑美元汇率（用于积分计算）
  ngnToUsdRate: number;
  ghsToUsdRate: number;
  // 1 USD = X 积分的配置
  usdToPointsRate: number;
  // 公式系数（可自定义调整）
  ngnFormulaMultiplier: number;
  ghsFormulaMultiplier: number;
  usdtFormulaMultiplier: number;
  usdtCoefficient: number;
  lastAutoUpdate: string;
  lastManualUpdate: string;
  // 存储上次采集的原始汇率
  lastFetchedNgnRate: number;
  lastFetchedGhsRate: number;
  // 自动采集后的微调系数（1=不调整，1.1=采集值×1.1，用于校正与官方汇率的偏差）
  ngnRateAdjustment?: number;
  ghsRateAdjustment?: number;
  // 推荐积分和消费积分设置
  referralPointsPerAction: number;     // 推荐模式1：固定积分
  consumptionPointsPerAction: number;
  // 推荐模式1开关
  referralMode1Enabled: boolean;       // 推荐模式1活动开关
  // 推荐模式2设置
  referralMode: ReferralMode;          // 推荐模式选择
  referralMode2Percentage: number;     // 推荐模式2：百分比
  referralMode2Enabled: boolean;       // 推荐模式2活动开关
  // 活动开关
  referralActivityEnabled: boolean;
}

const DEFAULT_SETTINGS: PointsSettings = {
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
};

// 自动更新间隔：4小时
export const POINTS_AUTO_UPDATE_INTERVAL = 4 * 60 * 60 * 1000;

// 内存缓存
let settingsCache: PointsSettings | null = null;

// ========== Settings Functions ==========

export function getPointsSettings(): PointsSettings {
  if (settingsCache) {
    // 异步刷新缓存
    loadSharedData<PointsSettings>('points_settings').then(data => {
      if (data) settingsCache = { ...DEFAULT_SETTINGS, ...data };
    }).catch(console.error);
    return settingsCache;
  }
  
  // 初次加载使用默认值，同时异步加载
  loadSharedData<PointsSettings>('points_settings').then(data => {
    if (data) settingsCache = { ...DEFAULT_SETTINGS, ...data };
  }).catch(console.error);
  
  return DEFAULT_SETTINGS;
}

export function savePointsSettings(settings: PointsSettings): PointsSettings {
  const beforeData = settingsCache || DEFAULT_SETTINGS;
  settingsCache = settings;
  saveSharedDataSync('points_settings', settings);
  
  // Audit log
  logOperation(
    'system_settings',
    'update',
    'points_settings',
    beforeData,
    settings,
    '修改积分设置'
  );
  
  return settings;
}

export function setPointsMode(mode: PointsMode): PointsSettings {
  const settings = getPointsSettings();
  const newSettings = { ...settings, mode };
  return savePointsSettings(newSettings);
}

export function updateManualRates(ngnToUsdRate: number, ghsToUsdRate: number): PointsSettings {
  const settings = getPointsSettings();
  const newSettings = {
    ...settings,
    ngnToUsdRate,
    ghsToUsdRate,
    lastManualUpdate: new Date().toISOString(),
  };
  return savePointsSettings(newSettings);
}

// 采集 NGN/GHS 汇率：优先直连 open.er-api.com，失败时通过 Supabase Edge Function 代理（避免国内网络拦截）
async function fetchRealExchangeRates(): Promise<{ ngnRate: number; ghsRate: number }> {
  const settings = getPointsSettings();
  const fallback = {
    ngnRate: settings.lastFetchedNgnRate || 1580,
    ghsRate: settings.lastFetchedGhsRate || 15.5,
  };

  const NGN_MIN = 500;
  const NGN_MAX = 3500;
  const GHS_MIN = 5;
  const GHS_MAX = 25;

  const applyResult = (ngn: number, ghs: number): { ngnRate: number; ghsRate: number } => {
    const finalNgn = ngn >= NGN_MIN && ngn <= NGN_MAX ? ngn : fallback.ngnRate;
    const finalGhs = ghs >= GHS_MIN && ghs <= GHS_MAX ? ghs : fallback.ghsRate;
    let resultNgn = finalNgn;
    let resultGhs = finalGhs;
    const adjNgn = settings.ngnRateAdjustment;
    const adjGhs = settings.ghsRateAdjustment;
    if (typeof adjNgn === 'number' && adjNgn > 0 && adjNgn !== 1) {
      resultNgn = Math.round(finalNgn * adjNgn * 100) / 100;
    }
    if (typeof adjGhs === 'number' && adjGhs > 0 && adjGhs !== 1) {
      resultGhs = Math.round(finalGhs * adjGhs * 100) / 100;
    }
    return { ngnRate: resultNgn, ghsRate: resultGhs };
  };

  // 1. 尝试直连 open.er-api.com（与汇率海报相同源）
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      if (data?.rates?.NGN != null && data?.rates?.GHS != null) {
        const result = applyResult(data.rates.NGN, data.rates.GHS);
        console.log('[PointsSettings] Fetched rates (direct):', result);
        return result;
      }
    }
  } catch (e) {
    console.warn('[PointsSettings] Direct fetch failed, trying Edge Function:', e);
  }

  // 2. 直连失败时通过 Supabase Edge Function 代理采集
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (projectId && anonKey) {
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/fetch-usdt-rates`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(10000),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
          },
          body: JSON.stringify({ includeForex: true }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        const forex = data?.forex;
        if (forex?.available && forex.ngnRate > 0 && forex.ghsRate > 0) {
          const result = applyResult(forex.ngnRate, forex.ghsRate);
          console.log('[PointsSettings] Fetched rates (Edge Function):', result);
          return result;
        }
      }
    }
  } catch (e) {
    console.warn('[PointsSettings] Edge Function fetch failed:', e);
  }

  console.warn('[PointsSettings] All sources failed, using fallback:', fallback);
  return fallback;
}

// 检查是否应该自动更新
export function shouldAutoUpdatePoints(): boolean {
  const settings = getPointsSettings();
  
  if (settings.mode !== 'auto') return false;
  if (!settings.lastAutoUpdate) return true;
  
  const lastUpdate = new Date(settings.lastAutoUpdate).getTime();
  const now = Date.now();
  
  return (now - lastUpdate) >= POINTS_AUTO_UPDATE_INTERVAL;
}

// 自动获取汇率
export async function fetchAutoRates(): Promise<{ ngnToUsd: number; ghsToUsd: number; hasChange: boolean }> {
  const settings = getPointsSettings();
  const realRates = await fetchRealExchangeRates();
  
  const ngnChanged = Math.abs(realRates.ngnRate - settings.lastFetchedNgnRate) > 0.01;
  const ghsChanged = Math.abs(realRates.ghsRate - settings.lastFetchedGhsRate) > 0.01;
  
  return {
    ngnToUsd: realRates.ngnRate,
    ghsToUsd: realRates.ghsRate,
    hasChange: ngnChanged || ghsChanged,
  };
}

export async function updateAutoRates(): Promise<{ settings: PointsSettings; hasChange: boolean }> {
  const settings = getPointsSettings();
  if (settings.mode !== 'auto') {
    return { settings, hasChange: false };
  }
  
  const rates = await fetchAutoRates();
  const beforeData = { ...settings };
  
  const newSettings: PointsSettings = {
    ...settings,
    lastAutoUpdate: new Date().toISOString(),
    lastFetchedNgnRate: rates.ngnToUsd,
    lastFetchedGhsRate: rates.ghsToUsd,
  };
  
  if (rates.hasChange) {
    newSettings.ngnToUsdRate = rates.ngnToUsd;
    newSettings.ghsToUsdRate = rates.ghsToUsd;
  }
  
  settingsCache = newSettings;
  await saveSharedData('points_settings', newSettings);
  
  logOperation(
    'system_settings',
    'update',
    'points_settings_auto',
    beforeData,
    newSettings,
    rates.hasChange ? '自动更新积分汇率（检测到汇率波动）' : '自动更新积分汇率（汇率无变化）'
  );
  
  return { settings: newSettings, hasChange: rates.hasChange };
}

// ========== Points Calculation ==========

export function calculatePointsPreview(currency: string, amount: number): {
  fxRate: number;
  usdAmount: number;
  pointsRate: number;
  formulaMultiplier: number;
  points: number;
} {
  const settings = getPointsSettings();
  const usdToPointsRate = settings.usdToPointsRate || 1;
  
  let fxRate: number;
  let formulaMultiplier: number;
  
  switch (currency) {
    case 'NGN':
      fxRate = settings.ngnToUsdRate;
      formulaMultiplier = settings.ngnFormulaMultiplier || 1;
      break;
    case 'GHS':
      fxRate = settings.ghsToUsdRate;
      formulaMultiplier = settings.ghsFormulaMultiplier || 1;
      break;
    case 'USDT':
      fxRate = 1;
      formulaMultiplier = settings.usdtFormulaMultiplier || 1;
      break;
    default:
      fxRate = 1;
      formulaMultiplier = 1;
  }
  
  const usdAmount = Number((amount / fxRate).toFixed(2));
  const points = Math.floor(usdAmount * usdToPointsRate * formulaMultiplier);
  
  return {
    fxRate,
    usdAmount,
    pointsRate: usdToPointsRate,
    formulaMultiplier,
    points,
  };
}

// ========== Async Functions ==========

export async function getPointsSettingsAsync(): Promise<PointsSettings> {
  const data = await loadSharedData<PointsSettings>('points_settings');
  if (data) {
    settingsCache = { ...DEFAULT_SETTINGS, ...data };
    return settingsCache;
  }
  return DEFAULT_SETTINGS;
}

export async function savePointsSettingsAsync(settings: PointsSettings): Promise<boolean> {
  const beforeData = settingsCache || DEFAULT_SETTINGS;
  settingsCache = settings;
  
  const success = await saveSharedData('points_settings', settings);
  
  if (success) {
    logOperation(
      'system_settings',
      'update',
      'points_settings',
      beforeData,
      settings,
      '修改积分设置'
    );
  }
  
  return success;
}

// ========== Initialize ==========

export async function initializePointsSettings(): Promise<void> {
  try {
    const data = await loadSharedData<PointsSettings>('points_settings');
    if (data) {
      settingsCache = { ...DEFAULT_SETTINGS, ...data };
    }
    console.log('[PointsSettings] Initialized from database');
  } catch (error) {
    console.error('[PointsSettings] Failed to initialize:', error);
  }
}

// ========== Reset Function (账号切换时调用) ==========

export function resetPointsSettingsCache(): void {
  settingsCache = null;
  console.log('[PointsSettings] Cache reset complete');
}
