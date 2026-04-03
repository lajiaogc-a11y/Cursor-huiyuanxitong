import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Fetch BTC/USDT real-time price (Binance primary, OKX fallback)
async function fetchBtcPrice(): Promise<{ price: number; source: string; available: boolean; error?: string }> {
  const sources = [
    {
      name: 'binance',
      url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      parse: (d: any) => parseFloat(d.price),
    },
    {
      name: 'okx',
      url: 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',
      parse: (d: any) => parseFloat(d.data?.[0]?.last),
    },
  ]
  let lastError = ''
  for (const src of sources) {
    try {
      const resp = await fetch(src.url, { headers: { 'Accept': 'application/json' } })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const price = src.parse(data)
      if (price > 0) return { price, source: src.name, available: true }
      throw new Error('Invalid price')
    } catch (e) {
      lastError = String(e)
      console.warn(`[BTC] ${src.name} failed:`, e)
    }
  }
  return { price: 0, source: 'none', available: false, error: lastError }
}

interface ExchangeRate {
  bid: number
  ask: number
  available: boolean
  error?: string
}

interface RateResponse {
  binance: ExchangeRate
  okx: ExchangeRate
  recommended: { bid: number; ask: number; mid: number }
  source: string
  timestamp: string
  anomaly: boolean
  anomalyDelta: number
}

// Fetch Binance P2P USDT/CNY rates
async function fetchBinanceRates(): Promise<ExchangeRate> {
  try {
    // Fetch BUY side (user wants to buy USDT, pays CNY) → this gives us the ASK price
    const buyResponse = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset: 'USDT',
        fiat: 'CNY',
        tradeType: 'BUY',
        page: 1,
        rows: 10,
        publisherType: null,
        payTypes: [],
      }),
    })

    // Fetch SELL side (user wants to sell USDT, receives CNY) → this gives us the BID price
    const sellResponse = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset: 'USDT',
        fiat: 'CNY',
        tradeType: 'SELL',
        page: 1,
        rows: 10,
        publisherType: null,
        payTypes: [],
      }),
    })

    if (!buyResponse.ok || !sellResponse.ok) {
      throw new Error(`Binance API error: buy=${buyResponse.status}, sell=${sellResponse.status}`)
    }

    const buyData = await buyResponse.json()
    const sellData = await sellResponse.json()

    const buyAds = buyData?.data || []
    const sellAds = sellData?.data || []

    if (buyAds.length === 0 && sellAds.length === 0) {
      throw new Error('No Binance P2P ads found')
    }

    // ASK = lowest price someone is willing to sell USDT for (from BUY ads, user perspective)
    const askPrices = buyAds
      .map((ad: any) => parseFloat(ad.adv?.price || '0'))
      .filter((p: number) => p > 0)
    const ask = askPrices.length > 0 ? Math.min(...askPrices) : 0

    // BID = highest price someone is willing to buy USDT at (from SELL ads, user perspective)
    const bidPrices = sellAds
      .map((ad: any) => parseFloat(ad.adv?.price || '0'))
      .filter((p: number) => p > 0)
    const bid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0

    return { bid, ask, available: bid > 0 || ask > 0 }
  } catch (error) {
    console.error('Binance fetch error:', error)
    return { bid: 0, ask: 0, available: false, error: String(error) }
  }
}

// 汇率海报所需完整结构
interface CurrencyRatesToNGN {
  USD_NGN: number
  MYR_NGN: number
  GBP_NGN: number
  CAD_NGN: number
  EUR_NGN: number
  CNY_NGN: number
  lastUpdated: string
}

// Binance P2P 获取 USDT/法币 中间价（市场交易汇率）
async function fetchBinanceP2PMid(asset: string, fiat: string): Promise<{ mid: number; available: boolean }> {
  try {
    const [buyResp, sellResp] = await Promise.all([
      fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, fiat, tradeType: 'BUY', page: 1, rows: 10, publisherType: null, payTypes: [] }),
      }),
      fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, fiat, tradeType: 'SELL', page: 1, rows: 10, publisherType: null, payTypes: [] }),
      }),
    ])
    if (!buyResp.ok || !sellResp.ok) return { mid: 0, available: false }
    const buyData = await buyResp.json()
    const sellData = await sellResp.json()
    const buyAds = buyData?.data || []
    const sellAds = sellData?.data || []
    const askPrices = buyAds.map((ad: any) => parseFloat(ad.adv?.price || '0')).filter((p: number) => p > 0)
    const bidPrices = sellAds.map((ad: any) => parseFloat(ad.adv?.price || '0')).filter((p: number) => p > 0)
    const ask = askPrices.length > 0 ? Math.min(...askPrices) : 0
    const bid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0
    const mid = ask > 0 && bid > 0 ? (ask + bid) / 2 : ask || bid
    return { mid, available: mid > 0 }
  } catch (e) {
    console.warn(`[P2P] ${asset}/${fiat} failed:`, e)
    return { mid: 0, available: false }
  }
}

// 采集市场交易汇率：优先 Binance P2P，fallback 官方汇率
async function fetchForexRates(): Promise<{
  ngnRate: number
  ghsRate: number
  available: boolean
  error?: string
  currencyRatesToNGN?: CurrencyRatesToNGN
}> {
  const fallback = async (): Promise<{ ngn: number; ghs: number; rates: CurrencyRatesToNGN }> => {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', { headers: { 'Accept': 'application/json' } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    const rates = data?.rates
    if (!rates) throw new Error('Invalid API response')
    const ngn = rates.NGN || 1400
    const ghs = rates.GHS || 18
    const myrToUsd = 1 / (rates.MYR || 4.71)
    const gbpToUsd = 1 / (rates.GBP || 0.743)
    const cadToUsd = 1 / (rates.CAD || 1.37)
    const eurToUsd = 1 / (rates.EUR || 0.85)
    const cnyToUsd = 1 / (rates.CNY || 7.01)
    return {
      ngn,
      ghs,
      rates: {
        USD_NGN: ngn,
        MYR_NGN: myrToUsd * ngn,
        GBP_NGN: gbpToUsd * ngn,
        CAD_NGN: cadToUsd * ngn,
        EUR_NGN: eurToUsd * ngn,
        CNY_NGN: cnyToUsd * ngn,
        lastUpdated: new Date().toISOString(),
      },
    }
  }

  try {
    // 并行获取 P2P 市场汇率 与 官方汇率
    const [usdtNgn, usdtCny, usdtMyr, usdtGbp, usdtCad, usdtEur, officialRates] = await Promise.all([
      fetchBinanceP2PMid('USDT', 'NGN'),
      fetchBinanceP2PMid('USDT', 'CNY'),
      fetchBinanceP2PMid('USDT', 'MYR'),
      fetchBinanceP2PMid('USDT', 'GBP'),
      fetchBinanceP2PMid('USDT', 'CAD'),
      fetchBinanceP2PMid('USDT', 'EUR'),
      fetch('https://open.er-api.com/v6/latest/USD', { headers: { 'Accept': 'application/json' } })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
    ])

    const rates = officialRates?.rates || {}
    const ngn = rates.NGN || 1400
    const ghs = rates.GHS || 18

    // USD/NGN: P2P USDT/NGN ≈ 1:1
    const usdNgn = usdtNgn.available ? usdtNgn.mid : ngn
    // CNY/NGN: 1 CNY = (USDT/NGN) / (USDT/CNY)
    const cnyNgn = usdtNgn.available && usdtCny.available && usdtCny.mid > 0
      ? usdtNgn.mid / usdtCny.mid
      : (1 / (rates.CNY || 7.01)) * ngn
    // MYR/NGN: P2P 有则用，否则官方
    const myrNgn = usdtMyr.available && usdtNgn.available && usdtMyr.mid > 0
      ? usdtNgn.mid / usdtMyr.mid
      : (1 / (rates.MYR || 4.71)) * ngn
    // GBP/NGN, CAD/NGN, EUR/NGN: P2P 有则用，否则官方
    const gbpToUsd = 1 / (rates.GBP || 0.743)
    const cadToUsd = 1 / (rates.CAD || 1.37)
    const eurToUsd = 1 / (rates.EUR || 0.85)
    const gbpNgnP2P = usdtGbp.available && usdtNgn.available && usdtGbp.mid > 0
      ? usdtNgn.mid / usdtGbp.mid
      : gbpToUsd * ngn
    const cadNgnP2P = usdtCad.available && usdtNgn.available && usdtCad.mid > 0
      ? usdtNgn.mid / usdtCad.mid
      : cadToUsd * ngn
    const eurNgnP2P = usdtEur.available && usdtNgn.available && usdtEur.mid > 0
      ? usdtNgn.mid / usdtEur.mid
      : eurToUsd * ngn

    const currencyRatesToNGN: CurrencyRatesToNGN = {
      USD_NGN: usdNgn,
      MYR_NGN: myrNgn,
      GBP_NGN: gbpNgnP2P,
      CAD_NGN: cadNgnP2P,
      EUR_NGN: eurNgnP2P,
      CNY_NGN: cnyNgn,
      lastUpdated: new Date().toISOString(),
    }

    return {
      ngnRate: usdNgn,
      ghsRate: ghs,
      available: usdNgn > 0 && ghs > 0,
      currencyRatesToNGN,
    }
  } catch (e) {
    const err = String(e)
    console.warn('[Forex] fetch failed:', e)
    try {
      const fb = await fallback()
      return { ngnRate: fb.ngn, ghsRate: fb.ghs, available: fb.ngn > 0, currencyRatesToNGN: fb.rates }
    } catch {
      return { ngnRate: 0, ghsRate: 0, available: false, error: err }
    }
  }
}

// Fetch OKX USDT/CNY rates
async function fetchOkxRates(): Promise<ExchangeRate> {
  try {
    // OKX C2C endpoint
    const buyResponse = await fetch('https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=CNY&baseCurrency=USDT&side=buy&paymentMethod=all&userType=all&showTrade=false&showFollow=false&showAlreadyTraded=false&isAbleFilter=false&receivingAds=false&urlId=0', {
      headers: { 'Accept': 'application/json' },
    })
    
    const sellResponse = await fetch('https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=CNY&baseCurrency=USDT&side=sell&paymentMethod=all&userType=all&showTrade=false&showFollow=false&showAlreadyTraded=false&isAbleFilter=false&receivingAds=false&urlId=0', {
      headers: { 'Accept': 'application/json' },
    })

    if (!buyResponse.ok || !sellResponse.ok) {
      throw new Error(`OKX API error: buy=${buyResponse.status}, sell=${sellResponse.status}`)
    }

    const buyData = await buyResponse.json()
    const sellData = await sellResponse.json()

    const buyAds = buyData?.data?.buy || buyData?.data || []
    const sellAds = sellData?.data?.sell || sellData?.data || []

    // ASK = price to buy USDT (pay more CNY)
    const askPrices = (Array.isArray(buyAds) ? buyAds : [])
      .map((ad: any) => parseFloat(ad.price || '0'))
      .filter((p: number) => p > 0)
    const ask = askPrices.length > 0 ? Math.min(...askPrices) : 0

    // BID = price to sell USDT (receive less CNY)
    const bidPrices = (Array.isArray(sellAds) ? sellAds : [])
      .map((ad: any) => parseFloat(ad.price || '0'))
      .filter((p: number) => p > 0)
    const bid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0

    return { bid, ask, available: bid > 0 || ask > 0 }
  } catch (error) {
    console.error('OKX fetch error:', error)
    return { bid: 0, ask: 0, available: false, error: String(error) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse request body first to check if BTC price is needed
    let body: any = {}
    try { body = await req.json() } catch { /* no body */ }

    // Fetch USDT rates, optionally BTC price, and optionally forex (NGN/GHS) in parallel
    const [binance, okx, btcResult, forexResult] = await Promise.all([
      fetchBinanceRates(),
      fetchOkxRates(),
      body?.includeBtc ? fetchBtcPrice() : Promise.resolve(null),
      body?.includeForex ? fetchForexRates() : Promise.resolve(null),
    ])

    // Calculate recommended rates (average of available sources)
    let recommendedBid = 0
    let recommendedAsk = 0
    let source = 'none'
    let sourceCount = 0

    if (binance.available && binance.bid > 0 && binance.ask > 0) {
      recommendedBid += binance.bid
      recommendedAsk += binance.ask
      sourceCount++
    }
    if (okx.available && okx.bid > 0 && okx.ask > 0) {
      recommendedBid += okx.bid
      recommendedAsk += okx.ask
      sourceCount++
    }

    if (sourceCount > 0) {
      recommendedBid = parseFloat((recommendedBid / sourceCount).toFixed(4))
      recommendedAsk = parseFloat((recommendedAsk / sourceCount).toFixed(4))
    }

    if (binance.available && okx.available) source = 'binance+okx'
    else if (binance.available) source = 'binance'
    else if (okx.available) source = 'okx'

    const mid = sourceCount > 0 ? parseFloat(((recommendedBid + recommendedAsk) / 2).toFixed(4)) : 0

    // Anomaly detection: check against last confirmed mid from request body
    let anomaly = false
    let anomalyDelta = 0

    try {
      const lastConfirmedMid = body?.lastConfirmedMid || 0
      const threshold = body?.anomalyThresholdPercent || 2

      if (lastConfirmedMid > 0 && mid > 0) {
        anomalyDelta = parseFloat((Math.abs(mid - lastConfirmedMid) / lastConfirmedMid * 100).toFixed(4))
        anomaly = anomalyDelta > threshold
      }
    } catch {
      // No body or invalid body, skip anomaly check
    }

    const response: RateResponse & { btc?: any; forex?: any; currencyRatesToNGN?: CurrencyRatesToNGN } = {
      binance,
      okx,
      recommended: { bid: recommendedBid, ask: recommendedAsk, mid },
      source,
      timestamp: new Date().toISOString(),
      anomaly,
      anomalyDelta,
      ...(btcResult !== null && { btc: btcResult }),
      ...(forexResult !== null && {
        forex: { ngnRate: forexResult.ngnRate, ghsRate: forexResult.ghsRate, available: forexResult.available, error: forexResult.error },
        ...(forexResult.currencyRatesToNGN && { currencyRatesToNGN: forexResult.currencyRatesToNGN }),
      }),
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('fetch-usdt-rates error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch rates', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
