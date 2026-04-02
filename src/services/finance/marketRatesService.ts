/**
 * 服务端代理的行情拉取（USDT/CNY、BTC/USD），统一走鉴权与 base URL
 */
import { apiClient, getBearerTokenStaffThenMember } from "@/lib/apiClient";

export async function fetchUsdtRatesViaApi(body: {
  lastConfirmedMid?: number;
  anomalyThresholdPercent?: number;
}): Promise<unknown> {
  return apiClient.post<unknown>("/api/data/fetch-usdt-rates", body);
}

export type FetchBtcPriceApiResult = { success: boolean; price?: number; source?: string };

export async function fetchBtcPriceViaApi(signal?: AbortSignal): Promise<FetchBtcPriceApiResult> {
  const base = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ?? "";
  const url = `${base.replace(/\/$/, "")}/api/data/fetch-btc-price`;
  const token = getBearerTokenStaffThenMember();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: signal ?? AbortSignal.timeout(12000),
  });
  if (!res.ok) return { success: false };
  const data = (await res.json()) as { success?: boolean; price?: number; source?: string };
  if (data?.success && data.price != null && data.price > 0) {
    return { success: true, price: data.price, source: data.source };
  }
  return { success: false };
}
