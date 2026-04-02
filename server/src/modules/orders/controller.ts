/**
 * Orders Controller
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  listOrdersService,
  getOrdersFullService,
  getUsdtOrdersFullService,
  createOrderService,
  updateOrderPointsService,
} from './service.js';

function resolveTenantId(req: AuthenticatedRequest, requestedTenantId?: string | null, allowPlatformAll = false) {
  if (req.user?.is_platform_super_admin) {
    if (requestedTenantId) return requestedTenantId;
    return allowPlatformAll ? undefined : undefined;
  }
  return req.user?.tenant_id ?? undefined;
}

export async function listOrdersController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const queryTenantId = req.query.tenant_id as string | undefined;
  const tenantId = resolveTenantId(req, queryTenantId, true);
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const data = await listOrdersService(tenantId, limit);
  res.json({ success: true, data });
}

export async function getOrdersFullController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const token = req.user?.token;
  if (!token) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token required' } });
    return;
  }
  const queryTenantId = req.query.tenant_id as string | undefined;
  const tenantId = resolveTenantId(req, queryTenantId, true);
  const data = await getOrdersFullService(token, tenantId);
  res.json({ success: true, data });
}

export async function getUsdtOrdersFullController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const token = req.user?.token;
  if (!token) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token required' } });
    return;
  }
  const queryTenantId = req.query.tenant_id as string | undefined;
  const tenantId = resolveTenantId(req, queryTenantId, true);
  const data = await getUsdtOrdersFullService(token, tenantId);
  res.json({ success: true, data });
}

export async function createOrderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body;
  const tenantId = resolveTenantId(
    req,
    ((req.query.tenant_id as string) ?? (body?.tenant_id as string | undefined)) ?? undefined
  );
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant_id required' } });
    return;
  }
  const data = await createOrderService({ ...body, tenant_id: tenantId });
  res.status(201).json({ success: true, data });
}

export async function updateOrderPointsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  const body = req.body as { points_status?: string; order_points?: number };
  const data = await updateOrderPointsService(id, body);
  res.json({ success: true, data });
}
