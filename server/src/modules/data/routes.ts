/**
 * Data 路由 - 操作日志、公司文档（绕过 RLS）
 */
import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  getOperationLogsController,
  postOperationLogController,
  postOperationLogMarkRestoredController,
  getKnowledgeCategoriesController,
  getKnowledgeArticlesController,
  postKnowledgeCategoryController,
  patchKnowledgeCategoryController,
  deleteKnowledgeCategoryController,
  postKnowledgeArticleController,
  patchKnowledgeArticleController,
  deleteKnowledgeArticleController,
  getKnowledgeReadStatusController,
  getKnowledgeUnreadCountController,
  postKnowledgeMarkReadController,
  postKnowledgeMarkAllReadController,
  getLoginLogsController,
  getRolePermissionsController,
  saveRolePermissionsController,
  seedKnowledgeCategoriesController,
  repairKnowledgeFieldsController,
  getDataDebugController,
  getSharedDataController,
  postSharedDataController,
  getSharedDataBatchController,
  getActivityDataController,
  getActivityDataRetentionController,
  putActivityDataRetentionController,
  postActivityDataRetentionRunController,
  getCurrenciesController,
  getActivityTypesController,
  getCustomerSourcesController,
  getShiftReceiversController,
  getShiftHandoversController,
  getAuditRecordsController,
  getPendingAuditCountController,
  patchActivityGiftController,
  deleteActivityGiftController,
  postActivityDataRetentionPurgeAllController,
  getSpinCreditsDetailController,
} from './controller.js';

import {
  restoreOrderFromAuditController,
  restoreActivityGiftFromAuditController,
  restoreCardFromAuditController,
  restoreVendorFromAuditController,
  restorePaymentProviderFromAuditController,
  restoreActivityTypeFromAuditController,
  restoreCurrencyFromAuditController,
  restoreCustomerSourceFromAuditController,
  restoreReferralFromAuditController,
} from './restoreFromAuditController.js';

import {
  tableSelectController,
  tableInsertController,
  tableUpdateController,
  tableDeleteController,
  rpcProxyController,
} from './tableProxy.js';

import { EXTERNAL_API } from '../../config/externalApis.js';
import { dataRpcPostLimiter, memberGrantSpinShareLimiter, publicInviteSubmitLimiter } from '../../middlewares/rateLimit.js';

const router = Router();

// 无需认证的 RPC 白名单（仅允许不涉及用户数据的只读/注册操作）
const PUBLIC_RPC_WHITELIST = new Set([
  'get_maintenance_mode_status',
  'validate_invite_and_submit',
  'check_api_rate_limit',
  'get_tenant_feature_flag',
  'member_get_portal_settings',
]);

/** 分享凭证申请 — 与分享领奖共用限流（须在通用 /rpc/:fn 之前注册） */
router.post(
  '/rpc/member_request_share_nonce',
  memberGrantSpinShareLimiter,
  dataRpcPostLimiter,
  authMiddleware,
  rpcProxyController,
);

/** P0：分享领次数 — 额外限流（须在通用 /rpc/:fn 之前注册） */
router.post(
  '/rpc/member_grant_spin_for_share',
  memberGrantSpinShareLimiter,
  dataRpcPostLimiter,
  authMiddleware,
  rpcProxyController,
);

/**
 * 邀请注册 — 公开、无 JWT；须携带 p_register_token（由 POST /api/member/register-init 下发），
 * 不再接受仅凭 p_tenant_id + p_code 完成开户。
 */
router.post(
  '/rpc/validate_invite_and_submit',
  publicInviteSubmitLimiter,
  dataRpcPostLimiter,
  rpcProxyController,
);

router.post(
  '/rpc/:fn',
  dataRpcPostLimiter,
  (req, res, next) => {
    const fn = String(req.params.fn || '').trim().toLowerCase().replace(/-/g, '_');
    if (PUBLIC_RPC_WHITELIST.has(fn)) {
      return next();
    }
    authMiddleware(req as any, res, next);
  },
  rpcProxyController
);

router.use(authMiddleware);

// 通用表代理（需要认证）
router.get('/table/:table', tableSelectController);
router.post('/table/:table', tableInsertController);
router.patch('/table/:table', tableUpdateController);
router.delete('/table/:table', tableDeleteController);

/** 操作日志审计恢复（管理员） */
router.post('/restore/order', restoreOrderFromAuditController);
router.post('/restore/activity-gift', restoreActivityGiftFromAuditController);
router.post('/restore/card', restoreCardFromAuditController);
router.post('/restore/vendor', restoreVendorFromAuditController);
router.post('/restore/payment-provider', restorePaymentProviderFromAuditController);
router.post('/restore/activity-type', restoreActivityTypeFromAuditController);
router.post('/restore/currency', restoreCurrencyFromAuditController);
router.post('/restore/customer-source', restoreCustomerSourceFromAuditController);
router.post('/restore/referral', restoreReferralFromAuditController);

// 以下接口要求认证，按 tenant_id 过滤数据
router.get('/knowledge/categories', getKnowledgeCategoriesController);
router.get('/knowledge/articles/:categoryId', getKnowledgeArticlesController);
router.post('/knowledge/categories', postKnowledgeCategoryController);
router.patch('/knowledge/categories/:id', patchKnowledgeCategoryController);
router.delete('/knowledge/categories/:id', deleteKnowledgeCategoryController);
router.post('/knowledge/articles', postKnowledgeArticleController);
router.patch('/knowledge/articles/:id', patchKnowledgeArticleController);
router.delete('/knowledge/articles/:id', deleteKnowledgeArticleController);
router.get('/knowledge/read-status', getKnowledgeReadStatusController);
router.get('/knowledge/unread-count', getKnowledgeUnreadCountController);
router.post('/knowledge/read-status', postKnowledgeMarkReadController);
router.post('/knowledge/read-status/mark-all', postKnowledgeMarkAllReadController);
router.get('/operation-logs', getOperationLogsController);
router.post('/operation-logs/:id/mark-restored', postOperationLogMarkRestoredController);
router.get('/login-logs', getLoginLogsController);
router.get('/currencies', getCurrenciesController);
router.get('/activity-types', getActivityTypesController);
router.get('/customer-sources', getCustomerSourcesController);
router.get('/shift-receivers', getShiftReceiversController);
router.get('/shift-handovers', getShiftHandoversController);
router.get('/audit-records', getAuditRecordsController);
router.get('/audit-records/pending-count', getPendingAuditCountController);

// 通知接口（前端频繁请求；列名与 Supabase 对齐：recipient_id / message）
router.get('/notifications', async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.type === 'member' || !req.user?.id) {
      res.json({ data: [], error: null });
      return;
    }
    const { query: dbQuery } = await import('../../database/index.js');
    const rows = await dbQuery(
      `SELECT id, user_id AS recipient_id, title, content AS message, type,
      category, metadata, is_read, link, created_at
      FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id],
    );
    const mapped = (rows as Record<string, unknown>[]).map((r) => {
      let meta: Record<string, unknown> = {};
      const raw = r.metadata;
      if (raw != null && typeof raw === 'object' && !Buffer.isBuffer(raw)) {
        meta = raw as Record<string, unknown>;
      } else if (typeof raw === 'string' && raw.trim()) {
        try {
          meta = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          meta = {};
        }
      }
      return {
        ...r,
        category: r.category ?? 'system',
        metadata: meta,
      };
    });
    res.json({ data: mapped, error: null });
  } catch {
    res.json({ data: [], error: null });
  }
});

router.get('/data-debug', getDataDebugController);
router.post('/operation-logs', postOperationLogController);
router.get('/permissions', getRolePermissionsController);
router.post('/permissions', saveRolePermissionsController);
router.post('/seed-knowledge', seedKnowledgeCategoriesController);
/** 公司文档字段修复（与 migrate 中 knowledge UPDATE 相同；不便重启时可手动调用） */
router.post('/repair-knowledge-fields', repairKnowledgeFieldsController);
router.get('/shared-data', getSharedDataController);
router.post('/shared-data', postSharedDataController);
router.get('/shared-data/batch', getSharedDataBatchController);
router.get('/activity-data', getActivityDataController);
router.get('/spin-credits-detail/:memberId', getSpinCreditsDetailController);
router.get('/activity-data-retention', getActivityDataRetentionController);
router.put('/activity-data-retention', putActivityDataRetentionController);
router.post('/activity-data-retention/run', postActivityDataRetentionRunController);
router.post('/activity-data-retention/purge-all', postActivityDataRetentionPurgeAllController);
router.patch('/activity-gifts/:id', patchActivityGiftController);
router.delete('/activity-gifts/:id', deleteActivityGiftController);

// USDT/CNY 汇率采集 — OKX P2P + Binance P2P
// 取两家交易所最优价格的平均值，买卖价差通常 < 1%
let binanceFailCount = 0;
let binanceLastFailTime = 0;
const BINANCE_SKIP_DURATION = 5 * 60 * 1000;

router.post('/fetch-usdt-rates', async (req, res) => {
  try {
    const { lastConfirmedMid, anomalyThresholdPercent = 5 } = req.body || {};
    const sources: { name: string; buy: number; sell: number; mid: number }[] = [];
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    /**
     * 从广告列表提取最优价格均值（CNY / USDT）
     * - side 'buy': 取前 topN 条**最高**价再平均 → 用于「你卖 USDT、对手收购」场景（价越高越好）
     * - side 'sell': 取前 topN 条**最低**价再平均 → 用于「你买 USDT、对手出货」场景（价越低越好）
     */
    function bestAvg(ads: any[], side: 'buy' | 'sell', topN = 5): number {
      const prices = ads
        .map((a: any) => parseFloat(a.price ?? a.adv?.price ?? 0))
        .filter((p: number) => p > 0);
      if (!prices.length) return 0;
      if (side === 'buy') {
        prices.sort((a, b) => b - a);
      } else {
        prices.sort((a, b) => a - b);
      }
      // 去除离群值: 偏离中位数 > 3% 的价格
      const median = prices[Math.floor(prices.length / 2)];
      const filtered = prices.filter(p => Math.abs(p - median) / median < 0.03);
      const slice = (filtered.length >= topN ? filtered : prices).slice(0, topN);
      return slice.reduce((a: number, b: number) => a + b, 0) / slice.length;
    }

    /** 约定：buy=你卖 USDT（收 CNY/枚，较高），sell=你买 USDT（付 CNY/枚，较低）。若数据源颠倒则交换。 */
    function normalizeBuySellPair(buy: number, sell: number): { buy: number; sell: number } {
      if (buy > 0 && sell > 0 && sell > buy) {
        return { buy: sell, sell: buy };
      }
      return { buy, sell };
    }

    // ---- 1. OKX C2C USDT/CNY (paymentMethod=all 获取更窄的价差) ----
    try {
      const okxResp = await fetch(
        'https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=cny&baseCurrency=usdt&side=all&paymentMethod=all&userType=all&showTrade=false&showFollow=false&showAlreadyTraded=false&isAbleFilter=false&receivingAds=false&urlId=0',
        { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) }
      );
      if (okxResp.ok) {
        const okxData = await okxResp.json();
        if (okxData.code === 0 && okxData.data) {
          const buyBest = bestAvg(okxData.data.buy || [], 'buy', 5);
          const sellBest = bestAvg(okxData.data.sell || [], 'sell', 5);
          if (buyBest > 0 && sellBest > 0) {
            const okxNorm = normalizeBuySellPair(buyBest, sellBest);
            sources.push({
              name: 'OKX',
              buy: Math.round(okxNorm.buy * 10000) / 10000,
              sell: Math.round(okxNorm.sell * 10000) / 10000,
              mid: Math.round((okxNorm.buy + okxNorm.sell) / 2 * 10000) / 10000,
            });
          }
        }
      }
    } catch (e) { console.warn('[USDT] OKX P2P error:', (e as Error).message); }

    // ---- 2. Binance P2P USDT/CNY ----
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
          // Binance tradeType=BUY：广告是「你买 USDT」——应付 CNY/USDT 越低越好 → bestAvg(..., 'sell') 取低价均值
          // tradeType=SELL：广告是「你卖 USDT」——应收 CNY/USDT 越高越好 → bestAvg(..., 'buy') 取高价均值
          const youBuyUsdtAvg = bestAvg(buyData.data || [], 'sell', 5);
          const youSellUsdtAvg = bestAvg(sellData.data || [], 'buy', 5);
          if (youBuyUsdtAvg > 0 && youSellUsdtAvg > 0) {
            const binNorm = normalizeBuySellPair(youSellUsdtAvg, youBuyUsdtAvg);
            sources.push({
              name: 'Binance',
              buy: Math.round(binNorm.buy * 10000) / 10000,
              sell: Math.round(binNorm.sell * 10000) / 10000,
              mid: Math.round((binNorm.buy + binNorm.sell) / 2 * 10000) / 10000,
            });
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

    // ---- 3. CoinGecko 兜底 ----
    if (sources.length === 0) {
      try {
        const cgResp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cny', { signal: AbortSignal.timeout(8000) });
        if (cgResp.ok) {
          const cgData = await cgResp.json();
          const price = cgData?.tether?.cny;
          if (price && price > 0) {
            sources.push({ name: 'CoinGecko', buy: price, sell: price, mid: price });
          }
        }
      } catch (e) { console.warn('[USDT] CoinGecko error:', (e as Error).message); }
    }

    if (sources.length === 0) {
      res.json({ success: false, error: 'All rate sources failed', sources: [], mid: lastConfirmedMid || 0 });
      return;
    }

    const p2pSources = sources.filter(s => s.name === 'OKX' || s.name === 'Binance');
    const effectiveSources = p2pSources.length > 0 ? p2pSources : sources;
    let avgBuy = effectiveSources.reduce((a, s) => a + s.buy, 0) / effectiveSources.length;
    let avgSell = effectiveSources.reduce((a, s) => a + s.sell, 0) / effectiveSources.length;
    const spreadNorm = normalizeBuySellPair(avgBuy, avgSell);
    avgBuy = spreadNorm.buy;
    avgSell = spreadNorm.sell;
    const avgMid = (avgBuy + avgSell) / 2;

    let anomaly = false;
    let anomalyMessage = '';
    if (lastConfirmedMid && lastConfirmedMid > 0) {
      const changePercent = Math.abs((avgMid - lastConfirmedMid) / lastConfirmedMid * 100);
      if (changePercent > (anomalyThresholdPercent || 5)) {
        anomaly = true;
        anomalyMessage = `Rate changed ${changePercent.toFixed(1)}% (threshold: ${anomalyThresholdPercent}%)`;
      }
    }

    res.json({
      success: true,
      sources,
      mid: Math.round(avgMid * 10000) / 10000,
      avgBuy: Math.round(avgBuy * 10000) / 10000,
      avgSell: Math.round(avgSell * 10000) / 10000,
      anomaly,
      anomalyMessage,
      binanceAvailable: sources.some(s => s.name === 'Binance'),
      okxAvailable: sources.some(s => s.name === 'OKX'),
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[USDT] fetch-usdt-rates error:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
});

// ─── BTC 价格采集（服务端代理，避免前端 CSP / CORS 问题）────────────────
router.get('/fetch-btc-price', async (_req, res) => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const timeout = 8000;

  // 1. CoinGecko
  try {
    const r = await fetch(EXTERNAL_API.COINGECKO_BTC_USD, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(timeout),
    });
    if (r.ok) {
      const data = await r.json();
      const price = data?.bitcoin?.usd;
      if (price && price > 0) {
        res.json({ success: true, price, source: 'CoinGecko' });
        return;
      }
    }
  } catch { /* try next */ }

  // 2. Binance
  try {
    const r = await fetch(EXTERNAL_API.BINANCE_BTC_USDT_TICKER, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(timeout),
    });
    if (r.ok) {
      const data = await r.json();
      const price = parseFloat(data?.price);
      if (price && price > 0) {
        res.json({ success: true, price, source: 'Binance' });
        return;
      }
    }
  } catch { /* try next */ }

  // 3. CoinCap
  try {
    const r = await fetch(EXTERNAL_API.COINCAP_BITCOIN, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(timeout),
    });
    if (r.ok) {
      const data = await r.json();
      const price = parseFloat(data?.data?.priceUsd);
      if (price && price > 0) {
        res.json({ success: true, price: Math.round(price * 100) / 100, source: 'CoinCap' });
        return;
      }
    }
  } catch { /* all failed */ }

  res.status(502).json({ success: false, error: 'BTC price unavailable from all sources' });
});

export default router;
