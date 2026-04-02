/**
 * 第三方行情 / 汇率 HTTP 入口集中配置。
 * 修改时请同步 server/src/config/externalApis.ts（Node 与 Vite 未共用单文件）。
 *
 * 历史 Edge 函数 slug 常量（仅供文档/兼容引用）；实际请求由 Node 提供，例如 USDT：`GET /api/data/fetch-usdt-rates`。
 */
/** 历史 Edge slug 名（与旧 Supabase 部署对齐；当前请走 Node `/api/data/*`） */
export const LEGACY_EDGE_SLUGS = {
  FETCH_USDT_RATES: "fetch-usdt-rates",
  GET_CLIENT_IP: "get-client-ip",
  VALIDATE_IP_COUNTRY: "validate-ip-country",
  GET_IP_LOCATION: "get-ip-location",
  EXTERNAL_API: "external-api",
} as const;

export type LegacyEdgeSlug = (typeof LEGACY_EDGE_SLUGS)[keyof typeof LEGACY_EDGE_SLUGS];

/** @deprecated 不再连接 Supabase；请使用 getApiBaseUrl() + `/api/...` */
export function buildSupabaseEdgeUrl(
  _supabaseBaseUrl: string | undefined,
  slug: LegacyEdgeSlug
): string {
  return `/api/data/${slug}`;
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
