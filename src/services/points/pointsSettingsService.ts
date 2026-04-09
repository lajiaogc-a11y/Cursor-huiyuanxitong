// Points Settings Store - 积分规则配置
// 所有数据存储在线上数据库，不使用本地存储

import { loadSharedData, saveSharedData, saveSharedDataSync } from '@/services/finance/sharedDataService';
import { EXTERNAL_API } from '@/config/externalApis';
import { externalGet } from '@/lib/externalHttpClient';
import { logOperation } from '@/services/audit/auditLogService';
import { pickBilingual } from '@/lib/appLocale';

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
  /** 自动采集奈拉/赛地汇率间隔（毫秒），默认 4 小时 */
  autoUpdateIntervalMs?: number;
}

const DEFAULT_SETTINGS: PointsSettings = {
  mode: 'auto',
  /** 1 USD ≈ NGN（用于 amount/ngn → USD）；默认取近似市场中间价，采集成功后会覆盖 */
  ngnToUsdRate: 1620,
  /** 1 USD ≈ GHS */
  ghsToUsdRate: 12.8,
  usdToPointsRate: 1,
  ngnFormulaMultiplier: 1,
  ghsFormulaMultiplier: 1,
  usdtFormulaMultiplier: 1,
  usdtCoefficient: 1,
  lastAutoUpdate: '',
  lastManualUpdate: '',
  lastFetchedNgnRate: 1620,
  lastFetchedGhsRate: 12.8,
  autoUpdateIntervalMs: 4 * 60 * 60 * 1000,
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
    pickBilingual('修改积分设置', 'Update points settings')
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

// 多源采集国际市场汇率，取中间值以提高准确性
async function fetchRealExchangeRates(): Promise<{ ngnRate: number; ghsRate: number }> {
  const settings = getPointsSettings();
  const fallback = {
    ngnRate: settings.lastFetchedNgnRate || DEFAULT_SETTINGS.ngnToUsdRate,
    ghsRate: settings.lastFetchedGhsRate || DEFAULT_SETTINGS.ghsToUsdRate,
  };

  const NGN_MIN = 500;
  const NGN_MAX = 5000;
  const GHS_MIN = 5;
  const GHS_MAX = 30;

  const isValidNgn = (v: number) => v >= NGN_MIN && v <= NGN_MAX;
  const isValidGhs = (v: number) => v >= GHS_MIN && v <= GHS_MAX;

  const applyAdjustment = (ngn: number, ghs: number): { ngnRate: number; ghsRate: number } => {
    let resultNgn = ngn;
    let resultGhs = ghs;
    const adjNgn = settings.ngnRateAdjustment;
    const adjGhs = settings.ghsRateAdjustment;
    if (typeof adjNgn === 'number' && adjNgn > 0 && adjNgn !== 1) {
      resultNgn = Math.round(ngn * adjNgn * 100) / 100;
    }
    if (typeof adjGhs === 'number' && adjGhs > 0 && adjGhs !== 1) {
      resultGhs = Math.round(ghs * adjGhs * 100) / 100;
    }
    return { ngnRate: resultNgn, ghsRate: resultGhs };
  };

  const sources: Array<{ ngn: number; ghs: number; src: string }> = [];

  // Source 1: open.er-api.com
  try {
    const d = await externalGet<{ rates?: Record<string, number> }>(
      EXTERNAL_API.EXCHANGE_RATE_USD_ER_API, { timeoutMs: 8000 },
    );
    if (d?.rates?.NGN && d?.rates?.GHS) {
      const ngn = Number(d.rates.NGN);
      const ghs = Number(d.rates.GHS);
      if (isValidNgn(ngn) && isValidGhs(ghs)) {
        sources.push({ ngn, ghs, src: 'open.er-api' });
      }
    }
  } catch { /* skip */ }

  // Source 2: exchangerate-api.com (free, no key)
  try {
    const d = await externalGet<{ rates?: Record<string, number> }>(
      EXTERNAL_API.EXCHANGE_RATE_USD_EXCHANGERATE_API, { timeoutMs: 8000 },
    );
    if (d?.rates?.NGN && d?.rates?.GHS) {
      const ngn = Number(d.rates.NGN);
      const ghs = Number(d.rates.GHS);
      if (isValidNgn(ngn) && isValidGhs(ghs)) {
        sources.push({ ngn, ghs, src: 'exchangerate-api' });
      }
    }
  } catch { /* skip */ }

  // Source 3: Frankfurter（欧洲央行参考，稳定）
  try {
    const d = await externalGet<{ rates?: Record<string, number> }>(
      EXTERNAL_API.EXCHANGE_RATE_FRANKFURTER_USD_TO_NGN_GHS, { timeoutMs: 8000 },
    );
    const ngn = Number(d?.rates?.NGN);
    const ghs = Number(d?.rates?.GHS);
    if (isValidNgn(ngn) && isValidGhs(ghs)) {
      sources.push({ ngn, ghs, src: 'frankfurter' });
    }
  } catch { /* skip */ }

  // Source 4: currency-api (fawazahmed0, GitHub CDN, market rates)
  try {
    const d = await externalGet<{ usd?: Record<string, number> }>(
      EXTERNAL_API.EXCHANGE_RATE_USD_CURRENCY_PAGES, { timeoutMs: 8000 },
    );
    if (d?.usd?.ngn && d?.usd?.ghs) {
      const ngn = Number(d.usd.ngn);
      const ghs = Number(d.usd.ghs);
      if (isValidNgn(ngn) && isValidGhs(ghs)) {
        sources.push({ ngn, ghs, src: 'currency-api-pages' });
      }
    }
  } catch { /* skip */ }

  console.log('[PointsSettings] Collected rates from', sources.length, 'source(s):', sources);

  if (sources.length === 0) {
    console.warn('[PointsSettings] All sources failed, using fallback:', fallback);
    return fallback;
  }

  // Take median for best accuracy (resistant to single-source outliers)
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  const ngnMedian = median(sources.map(s => s.ngn));
  const ghsMedian = median(sources.map(s => s.ghs));

  const finalNgn = isValidNgn(ngnMedian) ? Math.round(ngnMedian * 100) / 100 : fallback.ngnRate;
  const finalGhs = isValidGhs(ghsMedian) ? Math.round(ghsMedian * 100) / 100 : fallback.ghsRate;

  const result = applyAdjustment(finalNgn, finalGhs);
  console.log('[PointsSettings] Final rates (median of', sources.length, 'sources):', result);
  return result;
}

// 检查是否应该自动更新
export function shouldAutoUpdatePoints(): boolean {
  const settings = getPointsSettings();
  const intervalMs = settings.autoUpdateIntervalMs || POINTS_AUTO_UPDATE_INTERVAL;

  if (settings.mode !== 'auto') return false;
  if (!settings.lastAutoUpdate) return true;

  const lastUpdate = new Date(settings.lastAutoUpdate).getTime();
  const now = Date.now();

  return (now - lastUpdate) >= intervalMs;
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
    rates.hasChange ? pickBilingual('自动更新积分汇率（检测到汇率波动）', 'Auto-update points rate (rate change detected)') : pickBilingual('自动更新积分汇率（汇率无变化）', 'Auto-update points rate (no rate change)')
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
      pickBilingual('修改积分设置', 'Update points settings')
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
