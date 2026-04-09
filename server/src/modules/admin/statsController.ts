/**
 * Stats Controller — 管理仪表盘统计 API
 */
import type { Request, Response } from 'express';
import {
  getTableRowCounts,
  countFilteredRows,
  getApiLogStatsSince,
} from './statsRepository.js';

export async function tableCountsController(req: Request, res: Response): Promise<void> {
  const tablesParam = String(req.query.tables || '');
  if (!tablesParam) {
    res.status(400).json({ error: 'MISSING_TABLES', message: 'tables query param required' });
    return;
  }
  const tables = tablesParam.split(',').map((t) => t.trim()).filter(Boolean);
  const counts = await getTableRowCounts(tables);
  res.json({ success: true, counts });
}

export async function filteredCountController(req: Request, res: Response): Promise<void> {
  const table = String(req.query.table || '');
  if (!table) {
    res.status(400).json({ error: 'MISSING_TABLE' });
    return;
  }
  const rawFilters = req.query.filters;
  let filters: { column: string; op: string; value: string }[] = [];
  if (typeof rawFilters === 'string') {
    try {
      filters = JSON.parse(rawFilters);
    } catch {
      res.status(400).json({ error: 'INVALID_FILTERS' });
      return;
    }
  }
  const count = await countFilteredRows(table, filters);
  res.json({ success: true, count });
}

export async function apiLogStatsController(req: Request, res: Response): Promise<void> {
  const since = String(req.query.since || new Date(Date.now() - 86400000).toISOString());
  const limit = Math.min(10000, Math.max(1, Number(req.query.limit) || 10000));
  const { rows, total } = await getApiLogStatsSince(since, limit);

  const totalMs = rows.reduce((s, r) => s + (Number(r.response_time_ms) || 0), 0);
  const avgMs = rows.length > 0 ? Math.round(totalMs / rows.length) : 0;
  const errorCount = rows.filter((r) => Number(r.status_code) >= 400).length;
  const errorRate = rows.length > 0 ? Math.round((errorCount / rows.length) * 100) : 0;
  const callsByEndpoint: Record<string, number> = {};
  for (const r of rows) {
    const ep = r.path || 'unknown';
    callsByEndpoint[ep] = (callsByEndpoint[ep] || 0) + 1;
  }

  res.json({
    success: true,
    stats: {
      total_calls: total,
      avg_response_ms: avgMs,
      error_rate: errorRate,
      calls_by_endpoint: callsByEndpoint,
    },
  });
}
