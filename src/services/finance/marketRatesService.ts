/**
 * 服务端代理的行情拉取（USDT/CNY、BTC/USD），统一走鉴权与 base URL
 */
import { getBearerTokenStaffThenMember } from "@/lib/apiClient";
import { financeApi } from "@/api/finance";
import { EXTERNAL_API } from "@/config/externalApis";
import { externalGet, internalAuthGet } from "@/lib/externalHttpClient";

export async function fetchUsdtRatesViaApi(body: {
  lastConfirmedMid?: number;
  anomalyThresholdPercent?: number;
}): Promise<unknown> {
  return financeApi.fetchUsdtRates(body);
}

export type FetchBtcPriceApiResult = { success: boolean; price?: number; source?: string };

export async function fetchBtcPriceViaApi(signal?: AbortSignal): Promise<FetchBtcPriceApiResult> {
  const base = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ?? "";
  const url = `${base.replace(/\/$/, "")}/api/data/fetch-btc-price`;
  const token = getBearerTokenStaffThenMember();
  try {
    const data = await internalAuthGet<{ success?: boolean; price?: number; source?: string }>(
      url, token, { signal: signal ?? AbortSignal.timeout(12000) },
    );
    if (data?.success && data.price != null && data.price > 0) {
      return { success: true, price: data.price, source: data.source };
    }
  } catch { /* fallthrough */ }
  return { success: false };
}

/* ---- USD 汇率（外部 API） ---- */

export interface UsdExchangeRates {
  usdToNgn: number;
  usdToGhs: number;
  usdtRate: number;
  lastUpdated: string;
}

export async function fetchUsdExchangeRates(signal?: AbortSignal): Promise<UsdExchangeRates | null> {
  try {
    const data = await externalGet<{ result?: string; rates?: Record<string, number> }>(
      EXTERNAL_API.EXCHANGE_RATE_USD_ER_API,
      { signal: signal ?? AbortSignal.timeout(10_000) },
    );
    if (data.result === 'success' && data.rates) {
      return {
        usdToNgn: data.rates.NGN || 0,
        usdToGhs: data.rates.GHS || 0,
        usdtRate: 0.98,
        lastUpdated: new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/* ---- BTC 实时价格（多源容灾） ---- */

export async function fetchRealTimeBtcPrice(): Promise<number> {
  try {
    const r = await fetchBtcPriceViaApi(AbortSignal.timeout(12000));
    if (r.success && r.price != null && r.price > 0) return r.price;
  } catch { /* try direct */ }

  try {
    const data = await externalGet<{ bitcoin?: { usd?: number } }>(
      EXTERNAL_API.COINGECKO_BTC_USD, { signal: AbortSignal.timeout(8000) },
    );
    const price = data?.bitcoin?.usd;
    if (price && price > 0) return price;
  } catch { /* try fallback */ }

  try {
    const data = await externalGet<{ price?: string }>(
      EXTERNAL_API.BINANCE_BTC_USDT_TICKER, { signal: AbortSignal.timeout(8000) },
    );
    const price = parseFloat(data?.price ?? '');
    if (price && price > 0) return price;
  } catch { /* skip */ }

  throw new Error('BTC price unavailable from all sources');
}
