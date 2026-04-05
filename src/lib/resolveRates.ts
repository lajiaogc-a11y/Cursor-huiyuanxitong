/**
 * 统一汇率读取层 — 所有需要汇率的地方走这里。
 *
 * shared_data_store 中与汇率有关的 key：
 *   exchangeRateSettings  — USD基准 (API自动采集)
 *   calculatorInputRates  — 人民币基准手动输入 (NGN/GHS/USDT)
 *   usdtLiveRates         — P2P采集的 USDT/CNY 实时价
 *   calculatorUsdtRate    — 旧版 USDT 快照（仅 ReportManagement 读，无写端）
 *   currencyRatesToNGN    — 跨币种→NGN 的比值
 *   points_settings       — 积分相关汇率 (ngnToUsdRate, ghsToUsdRate)
 *
 * 本模块提供 resolveXxxRate() 系列函数，按统一优先级链读取；调用方无需关心数据来源。
 */

import {
  loadSharedData,
  type CalculatorInputRates,
} from '@/services/finance/sharedDataService';
import type { ExchangeRateSettings } from '@/services/finance/exchangeRateService';

// ---------- 内部缓存 / 类型 ----------

interface UsdtLiveRates {
  recommended?: { mid?: number; bid?: number; ask?: number };
  okx?: { buy?: number; sell?: number };
  binance?: { buy?: number; sell?: number };
}

interface CurrencyRatesToNGN {
  [key: string]: number | string | undefined;
  lastUpdated?: string;
}

let _ratesBatch: Promise<RatesBatch> | null = null;
let _batchTs = 0;
const BATCH_TTL = 8_000;

interface RatesBatch {
  exchangeRateSettings: ExchangeRateSettings | null;
  calculatorInputRates: CalculatorInputRates | null;
  usdtLiveRates: UsdtLiveRates | null;
  calculatorUsdtRate: { rate?: number } | null;
  currencyRatesToNGN: CurrencyRatesToNGN | null;
}

async function loadBatch(): Promise<RatesBatch> {
  const [exchangeRateSettings, calculatorInputRates, usdtLiveRates, calculatorUsdtRate, currencyRatesToNGN] =
    await Promise.all([
      loadSharedData<ExchangeRateSettings>('exchangeRateSettings'),
      loadSharedData<CalculatorInputRates>('calculatorInputRates'),
      loadSharedData<UsdtLiveRates>('usdtLiveRates'),
      loadSharedData<{ rate?: number }>('calculatorUsdtRate'),
      loadSharedData<CurrencyRatesToNGN>('currencyRatesToNGN'),
    ]);
  return { exchangeRateSettings, calculatorInputRates, usdtLiveRates, calculatorUsdtRate, currencyRatesToNGN };
}

/**
 * 获取所有汇率原始数据（带短时缓存，防止同一渲染帧多次 fetch）。
 * 外部一般不直接调用，推荐使用下面的 resolveXxx 系列。
 */
export async function getRatesBatch(): Promise<RatesBatch> {
  const now = Date.now();
  if (_ratesBatch && now - _batchTs < BATCH_TTL) return _ratesBatch;
  _ratesBatch = loadBatch();
  _batchTs = now;
  return _ratesBatch;
}

/** 手动清除批量缓存（设置页保存后可调用） */
export function invalidateRatesBatch(): void {
  _ratesBatch = null;
  _batchTs = 0;
}

// ---------- resolve 系列 ----------

/**
 * USDT/CNY 汇率（报表 / 利润计算用）。
 * 优先级：usdtLiveRates.recommended.mid → calculatorInputRates.usdtRate → calculatorUsdtRate.rate → 7.2 fallback
 */
export async function resolveUsdtCnyRate(): Promise<number> {
  const b = await getRatesBatch();
  const mid = b.usdtLiveRates?.recommended?.mid;
  if (mid && mid > 0) return mid;
  if (b.calculatorInputRates?.usdtRate && b.calculatorInputRates.usdtRate > 0) return b.calculatorInputRates.usdtRate;
  if (b.calculatorUsdtRate?.rate && b.calculatorUsdtRate.rate > 0) return b.calculatorUsdtRate.rate;
  return 7.2;
}

/**
 * USDT 活动赠送用卖出价。
 * 优先级：calculatorInputRates.usdtSellRate → calculatorInputRates.usdtRate → usdtLiveRates.recommended.bid → 0
 */
export async function resolveUsdtSellRate(): Promise<number> {
  const b = await getRatesBatch();
  const inp = b.calculatorInputRates;
  if (inp?.usdtSellRate && inp.usdtSellRate > 0) return inp.usdtSellRate;
  if (inp?.usdtRate && inp.usdtRate > 0) return inp.usdtRate;
  const bid = b.usdtLiveRates?.recommended?.bid;
  if (bid && bid > 0) return bid;
  return 0;
}

/**
 * 奈拉汇率（人民币 → NGN，手动输入优先，API采集兜底）。
 * 用于汇率计算器 / 活动赠送等 RMB 基准场景。
 */
export async function resolveNairaRate(): Promise<number> {
  const b = await getRatesBatch();
  if (b.calculatorInputRates?.nairaRate && b.calculatorInputRates.nairaRate > 0) return b.calculatorInputRates.nairaRate;
  const ngn = b.currencyRatesToNGN?.USD_NGN;
  if (ngn && Number(ngn) > 0) return Number(ngn);
  if (b.exchangeRateSettings?.finalRates?.ngnRate && b.exchangeRateSettings.finalRates.ngnRate > 0) {
    return b.exchangeRateSettings.finalRates.ngnRate;
  }
  return 0;
}

/**
 * 赛地汇率（人民币 → GHS）。
 */
export async function resolveCediRate(): Promise<number> {
  const b = await getRatesBatch();
  if (b.calculatorInputRates?.cediRate && b.calculatorInputRates.cediRate > 0) return b.calculatorInputRates.cediRate;
  if (b.exchangeRateSettings?.finalRates?.ghsRate && b.exchangeRateSettings.finalRates.ghsRate > 0) {
    return b.exchangeRateSettings.finalRates.ghsRate;
  }
  return 0;
}

/**
 * USD → NGN (API 自动采集，不含折扣)。用于积分 / 美元基准报表。
 */
export async function resolveUsdToNgn(): Promise<number> {
  const b = await getRatesBatch();
  if (b.exchangeRateSettings?.baseRates?.usdToNgn && b.exchangeRateSettings.baseRates.usdToNgn > 0) {
    return b.exchangeRateSettings.baseRates.usdToNgn;
  }
  return 1580;
}

/**
 * USD → GHS (API 自动采集，不含折扣)。
 */
export async function resolveUsdToGhs(): Promise<number> {
  const b = await getRatesBatch();
  if (b.exchangeRateSettings?.baseRates?.usdToGhs && b.exchangeRateSettings.baseRates.usdToGhs > 0) {
    return b.exchangeRateSettings.baseRates.usdToGhs;
  }
  return 15.5;
}

export interface ResolvedRatesSummary {
  usdtCny: number;
  usdtSell: number;
  naira: number;
  cedi: number;
  usdToNgn: number;
  usdToGhs: number;
}

/**
 * 一次性获取所有常用汇率快照（适合总览页）。
 */
export async function resolveAllRates(): Promise<ResolvedRatesSummary> {
  const [usdtCny, usdtSell, naira, cedi, usdToNgn, usdToGhs] = await Promise.all([
    resolveUsdtCnyRate(),
    resolveUsdtSellRate(),
    resolveNairaRate(),
    resolveCediRate(),
    resolveUsdToNgn(),
    resolveUsdToGhs(),
  ]);
  return { usdtCny, usdtSell, naira, cedi, usdToNgn, usdToGhs };
}
