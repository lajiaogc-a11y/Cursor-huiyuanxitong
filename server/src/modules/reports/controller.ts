/**
 * Reports Controller
 */
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveAccessScope, resolveEffectiveTenantId } from '../../security/accessScope.js';
import {
  getDashboardStatsService,
  getDashboardTrendService,
  getOrdersReportService,
  getActivityGiftsReportService,
  getReportBaseEmployeesService,
} from './service.js';
import { getShanghaiDateString, getShanghaiDateMinusDays } from '../../lib/shanghaiTime.js';

/** 报表统一用 admin_all 模式：平台超管不传 tenant_id 时看全平台 */
function reportTenantId(req: Request, res: Response): string | null | false {
  const scope = resolveAccessScope(req);
  const t = resolveEffectiveTenantId(scope, (req.query.tenant_id as string) || null, 'admin_all');
  if ('forbidden' in t) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: t.message } });
    return false;
  }
  return t.tenantId;
}

export async function getDashboardController(req: Request, res: Response): Promise<void> {
  const isPlatformAdmin = !!(req as AuthenticatedRequest).user?.is_platform_super_admin;
  const tenantId = reportTenantId(req, res);
  if (tenantId === false) return;
  const data = await getDashboardStatsService(tenantId, isPlatformAdmin);
  res.json({ success: true, data });
}

export async function getDashboardTrendController(req: Request, res: Response): Promise<void> {
  let startDate = req.query.startDate as string | undefined;
  let endDate = req.query.endDate as string | undefined;
  const range = req.query.range as string | undefined;
  const salesPerson = (req.query.salesPerson as string | undefined) ?? null;
  const tenantId = reportTenantId(req, res);
  if (tenantId === false) return;

  if (!startDate || !endDate) {
    const now = new Date();
    endDate = getShanghaiDateString(now) + ' 23:59:59';
    let days = 7;
    if (range) {
      const m = range.match(/^(\d+)d$/);
      if (m) days = parseInt(m[1], 10);
    }
    startDate = getShanghaiDateMinusDays(days, now) + ' 00:00:00';
  }

  const data = await getDashboardTrendService({
    startDate,
    endDate,
    salesPerson,
    tenantId,
  });
  res.json({ success: true, data });
}

export async function getOrdersReportController(req: Request, res: Response): Promise<void> {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const creatorId = req.query.creatorId as string | undefined;
  const tenantId = reportTenantId(req, res);
  if (tenantId === false) return;
  const data = await getOrdersReportService({ startDate, endDate, creatorId, tenantId: tenantId ?? undefined });
  res.json({ success: true, data });
}

export async function getActivityGiftsReportController(req: Request, res: Response): Promise<void> {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const creatorId = req.query.creatorId as string | undefined;
  const tenantId = reportTenantId(req, res);
  if (tenantId === false) return;
  const data = await getActivityGiftsReportService({ startDate, endDate, creatorId, tenantId: tenantId ?? undefined });
  res.json({ success: true, data });
}

export async function getBaseDataController(req: Request, res: Response): Promise<void> {
  const tenantId = reportTenantId(req, res);
  if (tenantId === false) return;
  const employees = await getReportBaseEmployeesService(tenantId);
  res.json({ success: true, data: { employees } });
}
