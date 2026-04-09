/**
 * 外部市场汇率采集 Service
 * 负责 USDT/CNY (OKX + Binance P2P) 和 BTC/USD (CoinGecko + Binance + CoinCap)
 */
import { EXTERNAL_API } from '../../config/externalApis.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* ──── Binance 熔断状态 ──── */
let binanceFailCount = 0;
let binanceLastFailTime = 0;
const BINANCE_SKIP_DURATION = 5 * 60 * 1000;

export interface RateSource {
  name: string;
  buy: number;
  sell: number;
  mid: number;
}

export interface FetchUsdtRatesResult {
  success: boolean;
  error?: string;
  sources: RateSource[];
  mid: number;
  avgBuy: number;
  avgSell: number;
  anomaly: boolean;
  anomalyMessage: string;
  binanceAvailable: boolean;
  okxAvailable: boolean;
  fetchedAt: string;
}

function bestAvg(ads: Record<string, unknown>[], side: 'buy' | 'sell', topN = 5): number {
  const prices = ads
    .map((a) => parseFloat(String(a.price ?? (a.adv as Record<string, unknown> | undefined)?.price ?? 0)))
    .filter((p) => p > 0);
  if (!prices.length) return 0;
  if (side === 'buy') prices.sort((a, b) => b - a);
  else prices.sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const filtered = prices.filter(p => Math.abs(p - median) / median < 0.03);
  const slice = (filtered.length >= topN ? filtered : prices).slice(0, topN);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function normalizeBuySellPair(buy: number, sell: number): { buy: number; sell: number } {
  if (buy > 0 && sell > 0 && sell > buy) return { buy: sell, sell: buy };
  return { buy, sell };
}

export async function fetchUsdtRates(lastConfirmedMid?: number, anomalyThresholdPercent = 5): Promise<FetchUsdtRatesResult> {
  const sources: RateSource[] = [];

  // 1. OKX C2C
  try {
    const okxResp = await fetch(
      'https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=cny&baseCurrency=usdt&side=all&paymentMethod=all&userType=all&showTrade=false&showFollow=false&showAlreadyTraded=false&isAbleFilter=false&receivingAds=false&urlId=0',
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) },
    );
    if (okxResp.ok) {
      const okxData = await okxResp.json();
      if (okxData.code === 0 && okxData.data) {
        const buyBest = bestAvg(okxData.data.buy || [], 'buy', 5);
        const sellBest = bestAvg(okxData.data.sell || [], 'sell', 5);
        if (buyBest > 0 && sellBest > 0) {
          const n = normalizeBuySellPair(buyBest, sellBest);
          sources.push({ name: 'OKX', buy: r4(n.buy), sell: r4(n.sell), mid: r4((n.buy + n.sell) / 2) });
        }
      }
    }
  } catch (e) { console.warn('[USDT] OKX P2P error:', (e as Error).message); }

  // 2. Binance P2P (with circuit breaker)
  const skipBinance = binanceFailCount >= 3 && (Date.now() - binanceLastFailTime < BINANCE_SKIP_DURATION);
  if (!skipBinance) {
    try {
      const [binBuyR, binSellR] = await Promise.all([
        fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
          body: JSON.stringify({ fiat: 'CNY', asset: 'USDT', tradeType: 'BUY', page: 1, rows: 20, payTypes: [] }),
          signal: AbortSignal.timeout(8000),
        }),
        fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
          body: JSON.stringify({ fiat: 'CNY', asset: 'USDT', tradeType: 'SELL', page: 1, rows: 20, payTypes: [] }),
          signal: AbortSignal.timeout(8000),
        }),
      ]);
      if (binBuyR.ok && binSellR.ok) {
        const buyData = await binBuyR.json();
        const sellData = await binSellR.json();
        const youBuyUsdtAvg = bestAvg(buyData.data || [], 'sell', 5);
        const youSellUsdtAvg = bestAvg(sellData.data || [], 'buy', 5);
        if (youBuyUsdtAvg > 0 && youSellUsdtAvg > 0) {
          const n = normalizeBuySellPair(youSellUsdtAvg, youBuyUsdtAvg);
          sources.push({ name: 'Binance', buy: r4(n.buy), sell: r4(n.sell), mid: r4((n.buy + n.sell) / 2) });
          binanceFailCount = 0;
        }
      }
    } catch (e) {
      binanceFailCount++;
      binanceLastFailTime = Date.now();
      console.warn(`[USDT] Binance P2P error (fail #${binanceFailCount}):`, (e as Error).message);
    }
  } else {
    console.log(`[USDT] Binance skipped (${binanceFailCount} failures, retry in ${Math.round((BINANCE_SKIP_DURATION - (Date.now() - binanceLastFailTime)) / 1000)}s)`);
  }

  // 3. CoinGecko fallback
  if (sources.length === 0) {
    try {
      const cgResp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cny', { signal: AbortSignal.timeout(8000) });
      if (cgResp.ok) {
        const cgData = await cgResp.json();
        const price = cgData?.tether?.cny;
        if (price && price > 0) sources.push({ name: 'CoinGecko', buy: price, sell: price, mid: price });
      }
    } catch (e) { console.warn('[USDT] CoinGecko error:', (e as Error).message); }
  }

  if (sources.length === 0) {
    return { success: false, error: 'All rate sources failed', sources: [], mid: lastConfirmedMid || 0, avgBuy: 0, avgSell: 0, anomaly: false, anomalyMessage: '', binanceAvailable: false, okxAvailable: false, fetchedAt: new Date().toISOString() };
  }

  const p2p = sources.filter(s => s.name === 'OKX' || s.name === 'Binance');
  const effective = p2p.length > 0 ? p2p : sources;
  const spreadNorm = normalizeBuySellPair(
    effective.reduce((a, s) => a + s.buy, 0) / effective.length,
    effective.reduce((a, s) => a + s.sell, 0) / effective.length,
  );
  const avgMid = (spreadNorm.buy + spreadNorm.sell) / 2;

  let anomaly = false;
  let anomalyMessage = '';
  if (lastConfirmedMid && lastConfirmedMid > 0) {
    const pct = Math.abs((avgMid - lastConfirmedMid) / lastConfirmedMid * 100);
    if (pct > (anomalyThresholdPercent || 5)) {
      anomaly = true;
      anomalyMessage = `Rate changed ${pct.toFixed(1)}% (threshold: ${anomalyThresholdPercent}%)`;
    }
  }

  return {
    success: true, sources,
    mid: r4(avgMid), avgBuy: r4(spreadNorm.buy), avgSell: r4(spreadNorm.sell),
    anomaly, anomalyMessage,
    binanceAvailable: sources.some(s => s.name === 'Binance'),
    okxAvailable: sources.some(s => s.name === 'OKX'),
    fetchedAt: new Date().toISOString(),
  };
}

export interface FetchBtcPriceResult {
  success: boolean;
  price?: number;
  source?: string;
  error?: string;
}

export async function fetchBtcPrice(): Promise<FetchBtcPriceResult> {
  const timeout = 8000;

  // 1. CoinGecko
  try {
    const r = await fetch(EXTERNAL_API.COINGECKO_BTC_USD, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
    if (r.ok) {
      const data = await r.json();
      const price = data?.bitcoin?.usd;
      if (price && price > 0) return { success: true, price, source: 'CoinGecko' };
    }
  } catch { /* try next */ }

  // 2. Binance
  try {
    const r = await fetch(EXTERNAL_API.BINANCE_BTC_USDT_TICKER, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
    if (r.ok) {
      const data = await r.json();
      const price = parseFloat(data?.price);
      if (price && price > 0) return { success: true, price, source: 'Binance' };
    }
  } catch { /* try next */ }

  // 3. CoinCap
  try {
    const r = await fetch(EXTERNAL_API.COINCAP_BITCOIN, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
    if (r.ok) {
      const data = await r.json();
      const price = parseFloat(data?.data?.priceUsd);
      if (price && price > 0) return { success: true, price: Math.round(price * 100) / 100, source: 'CoinCap' };
    }
  } catch { /* all failed */ }

  return { success: false, error: 'BTC price unavailable from all sources' };
}

function r4(n: number): number { return Math.round(n * 10000) / 10000; }
