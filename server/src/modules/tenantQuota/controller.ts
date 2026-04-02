import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveAccessScope, resolveEffectiveTenantId } from '../../security/accessScope.js';
import {
  getQuotaByTenantId,
  upsertQuota,
  listAllQuotas,
  countEmployees,
  countMembers,
  countDailyOrders,
} from './repository.js';

type Resource = 'employees' | 'members' | 'daily_orders';

async function buildStatus(tenantId: string) {
  const quota = await getQuotaByTenantId(tenantId);
  const [empCount, memCount, orderCount] = await Promise.all([
    countEmployees(tenantId),
    countMembers(tenantId),
    countDailyOrders(tenantId),
  ]);

  const maxEmp = quota?.max_employees ?? null;
  const maxMem = quota?.max_members ?? null;
  const maxOrd = quota?.max_daily_orders ?? null;
  const strategy = quota?.exceed_strategy || 'BLOCK';

  return {
    tenant_id: tenantId,
    max_employees: maxEmp,
    max_members: maxMem,
    max_daily_orders: maxOrd,
    exceed_strategy: strategy,
    employees_count: empCount,
    members_count: memCount,
    daily_orders_count: orderCount,
    employees_reached: maxEmp !== null && empCount >= maxEmp,
    members_reached: maxMem !== null && memCount >= maxMem,
    daily_orders_reached: maxOrd !== null && orderCount >= maxOrd,
  };
}

/**
 * POST /api/tenant/quota/check
 * Body: { p_resource, p_increment }
 * Called before creating orders/employees/members to check quota
 */
export async function checkQuotaController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id;
  if (!tenantId) {
    return res.json({ success: true, remaining: 999999, message: 'OK' });
  }

  const resource = req.body?.p_resource as Resource;
  const increment = Number(req.body?.p_increment ?? 1);

  const quota = await getQuotaByTenantId(tenantId);
  if (!quota) {
    // No quota record = unlimited
    return res.json({ success: true, remaining: 999999, message: 'OK' });
  }

  const strategy = quota.exceed_strategy || 'BLOCK';
  let maxVal: number | null = null;
  let currentCount = 0;

  if (resource === 'employees') {
    maxVal = quota.max_employees;
    currentCount = await countEmployees(tenantId);
  } else if (resource === 'members') {
    maxVal = quota.max_members;
    currentCount = await countMembers(tenantId);
  } else {
    // daily_orders or default
    maxVal = quota.max_daily_orders;
    currentCount = await countDailyOrders(tenantId);
  }

  // null = unlimited
  if (maxVal === null || maxVal <= 0) {
    return res.json({ success: true, remaining: 999999, message: 'OK' });
  }

  const remaining = Math.max(0, maxVal - currentCount);

  if (currentCount + increment > maxVal) {
    if (strategy === 'WARN') {
      return res.json({
        success: true,
        remaining: 0,
        message: `QUOTA_SOFT_EXCEEDED:${resource}`,
      });
    }
    return res.json({
      success: false,
      remaining: 0,
      message: `QUOTA_EXCEEDED:${resource}`,
    });
  }

  return res.json({ success: true, remaining, message: 'OK' });
}

/**
 * POST /api/tenant/quota/status
 * Body: { p_tenant_id }
 * 平台超管可查任意租户；普通用户只能查本租户
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
  const status = await buildStatus(t.tenantId);
  return res.json(status);
}

/**
 * POST /api/tenant/quota/list
 * 仅平台超管可查全部配额
 */
export async function listQuotasController(req: AuthenticatedRequest, res: Response) {
  if (!req.user?.is_platform_super_admin) {
    return res.status(403).json({ success: false, message: 'NO_PERMISSION' });
  }
  const rows = await listAllQuotas();
  return res.json(rows);
}

/**
 * POST /api/tenant/quota/set
 * Body: { p_tenant_id, p_max_employees, p_max_members, p_max_daily_orders, p_exceed_strategy }
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

  // Only platform super admins can set quotas
  if (!req.user?.is_platform_super_admin) {
    return res.status(403).json({ success: false, message: 'NO_PERMISSION' });
  }

  const maxEmp = (typeof p_max_employees === 'number' && p_max_employees > 0) ? p_max_employees : null;
  const maxMem = (typeof p_max_members === 'number' && p_max_members > 0) ? p_max_members : null;
  const maxOrd = (typeof p_max_daily_orders === 'number' && p_max_daily_orders > 0) ? p_max_daily_orders : null;
  const strategy = p_exceed_strategy === 'WARN' ? 'WARN' : 'BLOCK';

  await upsertQuota(p_tenant_id, maxEmp, maxMem, maxOrd, strategy);
  return res.json({ success: true });
}
