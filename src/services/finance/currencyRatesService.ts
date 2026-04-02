/**
 * Currency rates service
 * Extracted from ExchangeRate.tsx – manages NGN cross-rate fetching, caching, and persistence.
 */
import { EXTERNAL_API } from "@/config/externalApis";
import {
  loadSharedData,
  saveSharedData,
  getSharedDataSync,
} from "@/services/finance/sharedDataService";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CurrencyRates {
  USD_NGN: number;
  MYR_NGN: number;
  GBP_NGN: number;
  CAD_NGN: number;
  EUR_NGN: number;
  CNY_NGN: number;
  lastUpdated: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
export const DEFAULT_CURRENCY_RATES: CurrencyRates = {
  USD_NGN: 1434.47,
  MYR_NGN: 304.5,
  GBP_NGN: 1931.23,
  CAD_NGN: 1045.02,
  EUR_NGN: 1681.42,
  CNY_NGN: 204.69,
  lastUpdated: new Date().toISOString(),
};

export const DEFAULT_INTERVAL = 7200; // 2 hours in seconds

// ─── Module-level cache ──────────────────────────────────────────────────────
// Survives component unmount/remount during navigation
let currencyRatesCache: CurrencyRates = DEFAULT_CURRENCY_RATES;
let currencyRatesCacheLoaded = false;

// ─── Cache operations ─────────────────────────────────────────────────────────
export async function initCurrencyRatesFromDb(): Promise<CurrencyRates> {
  const saved = await loadSharedData<CurrencyRates>('currencyRatesToNGN');
  if (saved) {
    const merged: CurrencyRates = { ...DEFAULT_CURRENCY_RATES, ...saved };
    currencyRatesCache = merged;
    currencyRatesCacheLoaded = true;
    return merged;
  }
  return DEFAULT_CURRENCY_RATES;
}

export function getSavedCurrencyRates(): CurrencyRates {
  const cached = getSharedDataSync<CurrencyRates | null>('currencyRatesToNGN', null);
  if (cached && typeof cached.USD_NGN === 'number') {
    currencyRatesCache = { ...DEFAULT_CURRENCY_RATES, ...cached };
    currencyRatesCacheLoaded = true;
    return currencyRatesCache;
  }
  if (currencyRatesCacheLoaded && currencyRatesCache) {
    return { ...DEFAULT_CURRENCY_RATES, ...currencyRatesCache };
  }
  void initCurrencyRatesFromDb();
  return DEFAULT_CURRENCY_RATES;
}

export async function saveCurrencyRates(rates: CurrencyRates): Promise<void> {
  currencyRatesCache = rates;
  currencyRatesCacheLoaded = true;
  await saveSharedData('currencyRatesToNGN', rates);
}

// ─── Auto-update settings ─────────────────────────────────────────────────────
type AutoUpdateConfig = boolean | { enabled?: boolean; interval?: number };

export function getCurrencyRatesAutoUpdate(): boolean {
  const raw = getSharedDataSync<AutoUpdateConfig>('currencyRatesAutoUpdate', true);
  if (typeof raw === 'boolean') return raw;
  return raw?.enabled ?? true;
}

export function getCurrencyRatesInterval(): number {
  const raw = getSharedDataSync<AutoUpdateConfig>('currencyRatesAutoUpdate', true);
  if (typeof raw === 'object' && raw !== null && typeof raw.interval === 'number' && raw.interval > 0) {
    return raw.interval;
  }
  return DEFAULT_INTERVAL;
}

export async function saveCurrencyRatesAutoUpdate(enabled: boolean, interval?: number): Promise<void> {
  const raw = await loadSharedData<AutoUpdateConfig>('currencyRatesAutoUpdate');
  const currentInterval = typeof raw === 'object' && raw !== null && typeof raw.interval === 'number'
    ? raw.interval
    : DEFAULT_INTERVAL;
  await saveSharedData('currencyRatesAutoUpdate', { enabled, interval: interval ?? currentInterval });
}

export async function saveCurrencyRatesInterval(interval: number): Promise<void> {
  const raw = await loadSharedData<AutoUpdateConfig>('currencyRatesAutoUpdate');
  const enabled = typeof raw === 'boolean' ? raw : (raw?.enabled ?? true);
  await saveSharedData('currencyRatesAutoUpdate', { enabled, interval });
}

// ─── Multi-source rate fetcher ────────────────────────────────────────────────
/**
 * Fetches current NGN cross-rates from multiple free APIs and returns the median.
 * Returns null if all sources fail.
 */
export async function fetchCurrencyRatesToNGN(): Promise<CurrencyRates | null> {
  type RawRates = Record<string, number>;
  const sources: RawRates[] = [];

  // AbortSignal.timeout was standardised in Node 17.3 / modern browsers.
  // Older environments (e.g. jsdom < 21, Node < 17.3) lack it – fall back gracefully.
  const makeSignal = (ms: number): AbortSignal | undefined => {
    try {
      return AbortSignal.timeout(ms);
    } catch {
      return undefined;
    }
  };

  // Source 1: open.er-api.com
  try {
    const signal = makeSignal(8000);
    const res = await fetch(EXTERNAL_API.EXCHANGE_RATE_USD_ER_API, signal ? { signal } : {});
    if (res.ok) {
      const data = await res.json() as { rates?: RawRates };
      if (data?.rates?.NGN) sources.push(data.rates);
    }
  } catch { /* skip */ }

  // Source 2: exchangerate-api.com
  try {
    const signal = makeSignal(8000);
    const res = await fetch(EXTERNAL_API.EXCHANGE_RATE_USD_EXCHANGERATE_API, signal ? { signal } : {});
    if (res.ok) {
      const data = await res.json() as { rates?: RawRates };
      if (data?.rates?.NGN) sources.push(data.rates);
    }
  } catch { /* skip */ }

  // Source 3: currency-api (fawazahmed0)
  try {
    const signal = makeSignal(8000);
    const res = await fetch(EXTERNAL_API.EXCHANGE_RATE_USD_CURRENCY_PAGES, signal ? { signal } : {});
    if (res.ok) {
      const data = await res.json() as { usd?: Record<string, number> };
      const usd = data?.usd;
      if (usd?.ngn) {
        const mapped: RawRates = {
          NGN: usd.ngn, MYR: usd.myr, GBP: usd.gbp, CAD: usd.cad, EUR: usd.eur, CNY: usd.cny,
        };
        sources.push(mapped);
      }
    }
  } catch { /* skip */ }

  if (sources.length === 0) return null;

  const median = (arr: number[]): number => {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  const ngnPerUsd = median(sources.map(r => r.NGN).filter(Boolean));
  if (!ngnPerUsd || ngnPerUsd < 100) return null;

  const crossRate = (currency: string): number => {
    const vals = sources.map(r => r[currency]).filter(v => v && v > 0);
    if (vals.length === 0) return 0;
    const perUsd = median(vals);
    return perUsd > 0 ? Math.round((ngnPerUsd / perUsd) * 100) / 100 : 0;
  };

  return {
    USD_NGN: Math.round(ngnPerUsd * 100) / 100,
    MYR_NGN: crossRate('MYR') || DEFAULT_CURRENCY_RATES.MYR_NGN,
    GBP_NGN: crossRate('GBP') || DEFAULT_CURRENCY_RATES.GBP_NGN,
    CAD_NGN: crossRate('CAD') || DEFAULT_CURRENCY_RATES.CAD_NGN,
    EUR_NGN: crossRate('EUR') || DEFAULT_CURRENCY_RATES.EUR_NGN,
    CNY_NGN: crossRate('CNY') || DEFAULT_CURRENCY_RATES.CNY_NGN,
    lastUpdated: new Date().toISOString(),
  };
}
