/**
 * 市场汇率 Controller — HTTP 薄层，业务逻辑在 marketRatesService
 */
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { fetchUsdtRates, fetchBtcPrice } from './marketRatesService.js';
import { getNotificationsForUser } from './notificationsService.js';

export async function fetchUsdtRatesController(req: Request, res: Response): Promise<void> {
  try {
    const { lastConfirmedMid, anomalyThresholdPercent } = req.body || {};
    const result = await fetchUsdtRates(lastConfirmedMid, anomalyThresholdPercent);
    if (!result.success) {
      res.json(result);
      return;
    }
    res.json(result);
  } catch (e) {
    console.error('[USDT] fetch-usdt-rates error:', e);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
}

export async function fetchBtcPriceController(_req: Request, res: Response): Promise<void> {
  try {
    const result = await fetchBtcPrice();
    if (!result.success) {
      res.status(502).json(result);
      return;
    }
    res.json(result);
  } catch (e) {
    console.error('[BTC] fetch-btc-price error:', e);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
}

export async function getNotificationsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (req.user?.type === 'member' || !req.user?.id) {
      res.json({ data: [], error: null });
      return;
    }
    const data = await getNotificationsForUser(req.user.id);
    res.json({ data, error: null });
  } catch (err) {
    console.error('[notifications] query failed:', err);
    res.status(500).json({ data: null, error: 'Internal error loading notifications' });
  }
}
