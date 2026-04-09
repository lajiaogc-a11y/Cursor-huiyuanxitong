/**
 * 第三方行情 / 汇率 HTTP 入口集中配置。
 * 修改时请同步 server/src/config/externalApis.ts（Node 与 Vite 未共用单文件）。
 */
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
