import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveAccessScope, resolveEffectiveTenantId } from '../../security/accessScope.js';
import {
  getQuotaStatusService,
  checkQuotaRemainingService,
  listAllQuotasService,
  upsertQuotaService,
  type Resource,
} from './service.js';

/**
 * POST /api/tenant/quota/check
 * Body: { p_resource, p_increment }
 */
export async function checkQuotaController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id;
  if (!tenantId) {
    return res.json({ success: true, remaining: 999999, message: 'OK' });
  }
  const resource = req.body?.p_resource as Resource;
  const increment = Number(req.body?.p_increment ?? 1);
  const result = await checkQuotaRemainingService(tenantId, resource, increment);
  return res.json(result);
}

/**
 * POST /api/tenant/quota/status
 */
export async function getQuotaStatusController(req: AuthenticatedRequest, res: Response) {
  const scope = resolveAccessScope(req);
  const t = resolveEffectiveTenantId(scope, req.body?.p_tenant_id, 'admin_delegate');
  if ('forbidden' in t) {
    return res.status(403).json({ success: false, message: t.message });
  }
  if (!t.tenantId) {
    return res.status(400).json({ error: 'TENANT_REQUIRED' });
  }
  const status = await getQuotaStatusService(t.tenantId);
  return res.json(status);
}

/**
 * POST /api/tenant/quota/list
 */
export async function listQuotasController(req: AuthenticatedRequest, res: Response) {
  if (!req.user?.is_platform_super_admin) {
    return res.status(403).json({ success: false, message: 'NO_PERMISSION' });
  }
  const rows = await listAllQuotasService();
  return res.json(rows);
}

/**
 * POST /api/tenant/quota/set
 */
export async function setQuotaController(req: AuthenticatedRequest, res: Response) {
  const {
    p_tenant_id,
    p_max_employees,
    p_max_members,
    p_max_daily_orders,
    p_exceed_strategy,
  } = req.body || {};

  if (!p_tenant_id) {
    return res.status(400).json({ success: false, message: 'TENANT_REQUIRED' });
  }
  if (!req.user?.is_platform_super_admin) {
    return res.status(403).json({ success: false, message: 'NO_PERMISSION' });
  }

  const maxEmp = (typeof p_max_employees === 'number' && p_max_employees > 0) ? p_max_employees : null;
  const maxMem = (typeof p_max_members === 'number' && p_max_members > 0) ? p_max_members : null;
  const maxOrd = (typeof p_max_daily_orders === 'number' && p_max_daily_orders > 0) ? p_max_daily_orders : null;
  const strategy = p_exceed_strategy === 'WARN' ? 'WARN' : 'BLOCK';

  await upsertQuotaService(p_tenant_id, {
    max_employees: maxEmp,
    max_members: maxMem,
    max_daily_orders: maxOrd,
    exceed_strategy: strategy,
  });
  return res.json({ success: true });
}
