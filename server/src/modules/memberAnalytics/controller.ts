/**
 * 会员门户网站统计与数据清理 API
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveTenantIdForActivityDataList } from '../memberPortalSettings/activityDataTenant.js';
import {
  getWebsiteStatsService,
  getDataCleanupSettingsService,
  updateDataCleanupSettingsService,
  previewCleanupService,
  runCleanupService,
} from './service.js';

function isPortalAdmin(user: AuthenticatedRequest['user']): boolean {
  return !!(user?.role === 'admin' || user?.is_super_admin);
}

export async function getWebsiteStatsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const startDate = typeof req.query.start_date === 'string' ? req.query.start_date : null;
  const endDate = typeof req.query.end_date === 'string' ? req.query.end_date : null;
  try {
    const result = await getWebsiteStatsService({
      tenantId: resolved.tenantId,
      startDate,
      endDate,
    });
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: { code: result.errorCode ?? 'BAD_REQUEST', message: result.error },
      });
      return;
    }
    res.json({ success: true, data: result.data });
  } catch (e) {
    const msg = (e as Error)?.message || 'Stats query failed';
    console.error('[memberAnalytics] getWebsiteStatsController', e);
    res.status(500).json({
      success: false,
      error: { code: 'STATS_QUERY_FAILED', message: msg },
    });
  }
}

export async function getDataCleanupSettingsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  try {
    const result = await getDataCleanupSettingsService(resolved.tenantId);
    res.json({ success: true, data: result.data });
  } catch (e) {
    const msg = (e as Error)?.message || 'Load cleanup settings failed';
    console.error('[memberAnalytics] getDataCleanupSettingsController', e);
    res.status(500).json({
      success: false,
      error: { code: 'CLEANUP_SETTINGS_QUERY_FAILED', message: msg },
    });
  }
}

export async function putDataCleanupSettingsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!isPortalAdmin(req.user)) {
    res.status(403).json({
      success: false,
      error: { code: 'EMPLOYEE_ADMIN_REQUIRED', message: 'Admin required' },
    });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const body = req.body || {};
  const result = await updateDataCleanupSettingsService(resolved.tenantId, {
    enabled: !!body.enabled,
    no_trade_months: body.no_trade_months != null ? Number(body.no_trade_months) : null,
    no_login_months: body.no_login_months != null ? Number(body.no_login_months) : null,
    max_points_below: body.max_points_below != null ? Number(body.max_points_below) : null,
  });
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: { code: result.errorCode ?? 'VALIDATION_ERROR', message: result.error },
    });
    return;
  }
  res.json({ success: true });
}

export async function getCleanupPreviewController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const result = await previewCleanupService(resolved.tenantId);
  res.json({ success: true, data: result.data });
}

export async function postRunCleanupController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!isPortalAdmin(req.user)) {
    res.status(403).json({
      success: false,
      error: { code: 'EMPLOYEE_ADMIN_REQUIRED', message: 'Admin required' },
    });
    return;
  }
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const result = await runCleanupService(resolved.tenantId);
  res.json({ success: true, data: result.data });
}
