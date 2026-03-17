// Exchange Rate Store - USD基准汇率管理
// USD为基准货币，所有汇率由USD推导
// 迁移到数据库 - 使用 shared_data_store 表存储

import { CurrencyCode } from "@/config/currencies";
import { loadSharedData, saveSharedData, saveSharedDataSync, getSharedDataSync } from "@/services/finance/sharedDataService";

// 汇率折扣系数
const RATE_DISCOUNT_FACTOR = 0.98;

// 自动更新间隔（毫秒）：4小时
export const AUTO_UPDATE_INTERVAL = 4 * 60 * 60 * 1000;

// 基础汇率接口（采集的原始汇率）
export interface BaseExchangeRates {
  usdToNgn: number;  // USD → NGN
  usdToGhs: number;  // USD → GHS
  lastFetched: string;
}

// 最终使用汇率（应用折扣后）
export interface FinalExchangeRates {
  ngnRate: number;   // 1 USD = X NGN（含折扣）
  ghsRate: number;   // 1 USD = X GHS（含折扣）
  usdtRate: number;  // 1 USD = 0.98 USDT（固定）
  lastUpdated: string;
}

// 完整汇率设置
export interface ExchangeRateSettings {
  baseRates: BaseExchangeRates;
  finalRates: FinalExchangeRates;
  autoUpdateEnabled: boolean;
}

// 默认汇率设置
const DEFAULT_EXCHANGE_RATE_SETTINGS: ExchangeRateSettings = {
  baseRates: {
    usdToNgn: 1580,  // 默认值，将被自动更新
    usdToGhs: 15.5,  // 默认值，将被自动更新
    lastFetched: new Date().toISOString(),
  },
  finalRates: {
    ngnRate: 1580 * RATE_DISCOUNT_FACTOR,
    ghsRate: 15.5 * RATE_DISCOUNT_FACTOR,
    usdtRate: 1 * RATE_DISCOUNT_FACTOR,  // 1 USD = 0.98 USDT
    lastUpdated: new Date().toISOString(),
  },
  autoUpdateEnabled: true,
};

// 内存缓存
let settingsCache: ExchangeRateSettings | null = null;

/** 数据变更时重置缓存（由 dataRefreshManager 在 shared_data_store 变更时调用） */
export function resetExchangeRateCache(): void {
  settingsCache = null;
}

// 获取汇率设置
export function getExchangeRateSettings(): ExchangeRateSettings {
  if (settingsCache) {
    // 异步刷新缓存
    loadSharedData<ExchangeRateSettings>('exchangeRateSettings').then(data => {
      if (data) settingsCache = { ...DEFAULT_EXCHANGE_RATE_SETTINGS, ...data };
    }).catch(console.error);
    return settingsCache;
  }
  
  // 初次加载使用默认值，同时异步加载
  loadSharedData<ExchangeRateSettings>('exchangeRateSettings').then(data => {
    if (data) settingsCache = { ...DEFAULT_EXCHANGE_RATE_SETTINGS, ...data };
  }).catch(console.error);
  
  return DEFAULT_EXCHANGE_RATE_SETTINGS;
}

// 保存汇率设置
export function saveExchangeRateSettings(settings: ExchangeRateSettings): void {
  settingsCache = settings;
  saveSharedDataSync('exchangeRateSettings', settings);
}

// 从真实API获取汇率
export async function fetchBaseRates(): Promise<{ usdToNgn: number; usdToGhs: number }> {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    
    if (!response.ok) {
      throw new Error('API request failed');
    }
    
    const data = await response.json();
    
    if (data.result === 'success' && data.rates) {
      const ngnRate = data.rates.NGN || 1580;
      const ghsRate = data.rates.GHS || 15.5;
      
      console.log('Fetched exchange rates from API:', { NGN: ngnRate, GHS: ghsRate });
      
      return { usdToNgn: ngnRate, usdToGhs: ghsRate };
    }
    
    throw new Error('Invalid API response');
  } catch (error) {
    console.error('Failed to fetch exchange rates from API, using fallback:', error);
    const settings = getExchangeRateSettings();
    return {
      usdToNgn: settings.baseRates.usdToNgn || 1580,
      usdToGhs: settings.baseRates.usdToGhs || 15.5,
    };
  }
}

// 计算最终汇率（应用折扣系数）
export function calculateFinalRates(baseRates: BaseExchangeRates): FinalExchangeRates {
  return {
    ngnRate: Number((baseRates.usdToNgn * RATE_DISCOUNT_FACTOR).toFixed(2)),
    ghsRate: Number((baseRates.usdToGhs * RATE_DISCOUNT_FACTOR).toFixed(4)),
    usdtRate: Number((1 * RATE_DISCOUNT_FACTOR).toFixed(2)), // 1 USD = 0.98 USDT
    lastUpdated: new Date().toISOString(),
  };
}

// 更新基础汇率并重新计算最终汇率
export async function updateExchangeRates(): Promise<ExchangeRateSettings> {
  const settings = getExchangeRateSettings();
  
  // 获取新的基础汇率
  const newBaseRates = await fetchBaseRates();
  
  settings.baseRates = {
    ...newBaseRates,
    lastFetched: new Date().toISOString(),
  };
  
  // 计算最终汇率
  settings.finalRates = calculateFinalRates(settings.baseRates);
  
  saveExchangeRateSettings(settings);
  return settings;
}

// 手动设置基础汇率（覆盖自动采集）
export function setManualBaseRates(usdToNgn: number, usdToGhs: number): ExchangeRateSettings {
  const settings = getExchangeRateSettings();
  
  settings.baseRates = {
    usdToNgn,
    usdToGhs,
    lastFetched: new Date().toISOString(),
  };
  
  settings.finalRates = calculateFinalRates(settings.baseRates);
  
  saveExchangeRateSettings(settings);
  return settings;
}

// 切换自动更新状态
export function toggleAutoUpdate(enabled: boolean): ExchangeRateSettings {
  const settings = getExchangeRateSettings();
  settings.autoUpdateEnabled = enabled;
  saveExchangeRateSettings(settings);
  return settings;
}

// 获取当前最终汇率
export function getFinalRates(): FinalExchangeRates {
  const settings = getExchangeRateSettings();
  return settings.finalRates;
}

// 将USD金额换算为指定币种金额
export function convertUsdToCurrency(usdAmount: number, currency: CurrencyCode): number {
  const rates = getFinalRates();
  
  switch (currency) {
    case 'NGN':
      return Number((usdAmount * rates.ngnRate).toFixed(2));
    case 'GHS':
      return Number((usdAmount * rates.ghsRate).toFixed(2));
    case 'USDT':
      return Number((usdAmount * rates.usdtRate).toFixed(2));
    default:
      return usdAmount;
  }
}

// 将指定币种金额换算为USD
export function convertCurrencyToUsd(amount: number, currency: CurrencyCode): number {
  const rates = getFinalRates();
  
  switch (currency) {
    case 'NGN':
      return Number((amount / rates.ngnRate).toFixed(4));
    case 'GHS':
      return Number((amount / rates.ghsRate).toFixed(4));
    case 'USDT':
      return Number((amount / rates.usdtRate).toFixed(4));
    default:
      return amount;
  }
}

// 检查是否需要自动更新（距离上次更新超过4小时）
export function shouldAutoUpdate(): boolean {
  const settings = getExchangeRateSettings();
  
  if (!settings.autoUpdateEnabled) return false;
  
  const lastFetched = new Date(settings.baseRates.lastFetched).getTime();
  const now = Date.now();
  
  return (now - lastFetched) >= AUTO_UPDATE_INTERVAL;
}

// 格式化上次更新时间
export function formatLastUpdated(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// 异步初始化
export async function initializeExchangeRateSettings(): Promise<void> {
  try {
    const data = await loadSharedData<ExchangeRateSettings>('exchangeRateSettings');
    if (data) {
      settingsCache = { ...DEFAULT_EXCHANGE_RATE_SETTINGS, ...data };
    }
    console.log('[ExchangeRateSettings] Initialized from database');
  } catch (error) {
    console.error('[ExchangeRateSettings] Failed to initialize:', error);
  }
}

// 异步获取
export async function getExchangeRateSettingsAsync(): Promise<ExchangeRateSettings> {
  const data = await loadSharedData<ExchangeRateSettings>('exchangeRateSettings');
  if (data) {
    settingsCache = { ...DEFAULT_EXCHANGE_RATE_SETTINGS, ...data };
    return settingsCache;
  }
  return DEFAULT_EXCHANGE_RATE_SETTINGS;
}
