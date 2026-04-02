/**
 * 第三方行情 / 汇率 HTTP 入口（服务端）。
 * 修改时请同步根目录 src/config/externalApis.ts。
 *
 * 以下为历史 Edge slug 常量名；当前由本进程路由提供（如 /api/data/fetch-usdt-rates），不请求 Supabase。
 */
export const SUPABASE_EDGE_FUNCTIONS = {
  FETCH_USDT_RATES: "fetch-usdt-rates",
  GET_CLIENT_IP: "get-client-ip",
  VALIDATE_IP_COUNTRY: "validate-ip-country",
  GET_IP_LOCATION: "get-ip-location",
  EXTERNAL_API: "external-api",
} as const;

export type SupabaseEdgeFunctionSlug =
  (typeof SUPABASE_EDGE_FUNCTIONS)[keyof typeof SUPABASE_EDGE_FUNCTIONS];

export function buildSupabaseEdgeUrl(
  supabaseBaseUrl: string | undefined,
  slug: SupabaseEdgeFunctionSlug
): string {
  const base = String(supabaseBaseUrl || "").replace(/\/$/, "");
  return `${base}/functions/v1/${slug}`;
}

export const EXTERNAL_API = {
  EXCHANGE_RATE_USD_ER_API: "https://open.er-api.com/v6/latest/USD",
  EXCHANGE_RATE_USD_EXCHANGERATE_API: "https://api.exchangerate-api.com/v4/latest/USD",
  EXCHANGE_RATE_USD_CURRENCY_PAGES: "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
  EXCHANGE_RATE_FRANKFURTER_USD_TO_NGN_GHS: "https://api.frankfurter.app/latest?from=USD&to=NGN,GHS",

  COINGECKO_BTC_USD: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
  COINGECKO_TETHER_CNY: "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cny",
  BINANCE_BTC_USDT_TICKER: "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
  COINCAP_BITCOIN: "https://api.coincap.io/v2/assets/bitcoin",
} as const;
