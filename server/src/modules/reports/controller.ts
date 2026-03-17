/**
 * Reports Controller
 */
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  getDashboardStatsService,
  getDashboardTrendService,
  getOrdersReportService,
  getActivityGiftsReportService,
  getReportBaseEmployeesService,
} from './service.js';

export async function getDashboardController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const queryTenantId = (req.query.tenant_id as string) || null;
  const isPlatformAdmin = !!authReq.user?.is_platform_super_admin;
  // 平台总管理：无 query 时用 null 显示全平台；有 query 时显示指定租户
  const tenantId = isPlatformAdmin ? queryTenantId : (authReq.user?.tenant_id ?? queryTenantId);
  const data = await getDashboardStatsService(tenantId, isPlatformAdmin);
  res.json({ success: true, data });
}

export async function getDashboardTrendController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const salesPerson = (req.query.salesPerson as string | undefined) ?? null;
  const queryTenantId = (req.query.tenant_id as string) || null;
  const isPlatformAdmin = !!authReq.user?.is_platform_super_admin;
  const tenantId = isPlatformAdmin ? queryTenantId : (authReq.user?.tenant_id ?? queryTenantId);

  if (!startDate || !endDate) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'startDate and endDate are required' } });
    return;
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
  const authReq = req as AuthenticatedRequest;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const creatorId = req.query.creatorId as string | undefined;
  const queryTenantId = req.query.tenant_id as string | undefined;
  const isPlatformAdmin = !!authReq.user?.is_platform_super_admin;
  const tenantId = isPlatformAdmin ? queryTenantId : (authReq.user?.tenant_id ?? queryTenantId);
  const data = await getOrdersReportService({ startDate, endDate, creatorId, tenantId });
  res.json({ success: true, data });
}

export async function getActivityGiftsReportController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const creatorId = req.query.creatorId as string | undefined;
  const queryTenantId = req.query.tenant_id as string | undefined;
  const isPlatformAdmin = !!authReq.user?.is_platform_super_admin;
  const tenantId = isPlatformAdmin ? queryTenantId : (authReq.user?.tenant_id ?? queryTenantId);
  const data = await getActivityGiftsReportService({ startDate, endDate, creatorId, tenantId });
  res.json({ success: true, data });
}

export async function getBaseDataController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const queryTenantId = (req.query.tenant_id as string) || null;
  const isPlatformAdmin = !!authReq.user?.is_platform_super_admin;
  const tenantId = isPlatformAdmin ? queryTenantId : (authReq.user?.tenant_id ?? queryTenantId);
  const employees = await getReportBaseEmployeesService(tenantId);
  res.json({ success: true, data: { employees } });
}
