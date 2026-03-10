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

// Fetch NGN/GHS from open.er-api.com (1 USD = X NGN/GHS)，用于积分设置与汇率海报
async function fetchForexRates(): Promise<{ ngnRate: number; ghsRate: number; available: boolean; error?: string }> {
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { 'Accept': 'application/json' },
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    const ngn = data?.rates?.NGN
    const ghs = data?.rates?.GHS
    if (typeof ngn === 'number' && ngn > 0 && typeof ghs === 'number' && ghs > 0) {
      return { ngnRate: ngn, ghsRate: ghs, available: true }
    }
    throw new Error('Invalid rates')
  } catch (e) {
    const err = String(e)
    console.warn('[Forex] fetch failed:', e)
    return { ngnRate: 0, ghsRate: 0, available: false, error: err }
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

    const response: RateResponse & { btc?: any; forex?: any } = {
      binance,
      okx,
      recommended: { bid: recommendedBid, ask: recommendedAsk, mid },
      source,
      timestamp: new Date().toISOString(),
      anomaly,
      anomalyDelta,
      ...(btcResult !== null && { btc: btcResult }),
      ...(forexResult !== null && { forex: forexResult }),
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
