/**
 * Tenant Quota Service — 配额业务逻辑
 * Controller 统一通过此层调用 repository，不得跨层
 */
import {
  getQuotaByTenantId,
  upsertQuota,
  listAllQuotas,
  countEmployees,
  countMembers,
  countDailyOrders,
  type QuotaRow,
} from './repository.js';

export type { QuotaRow };

export interface QuotaStatus {
  tenant_id: string;
  max_employees: number | null;
  max_members: number | null;
  max_daily_orders: number | null;
  exceed_strategy: string;
  employees_count: number;
  members_count: number;
  daily_orders_count: number;
  employees_reached: boolean;
  members_reached: boolean;
  daily_orders_reached: boolean;
}

export async function getQuotaStatusService(tenantId: string): Promise<QuotaStatus> {
  const quota = await getQuotaByTenantId(tenantId);
  const [empCount, memCount, orderCount] = await Promise.all([
    countEmployees(tenantId),
    countMembers(tenantId),
    countDailyOrders(tenantId),
  ]);
  const maxEmp = quota?.max_employees ?? null;
  const maxMem = quota?.max_members ?? null;
  const maxOrd = quota?.max_daily_orders ?? null;
  return {
    tenant_id: tenantId,
    max_employees: maxEmp,
    max_members: maxMem,
    max_daily_orders: maxOrd,
    exceed_strategy: quota?.exceed_strategy || 'BLOCK',
    employees_count: empCount,
    members_count: memCount,
    daily_orders_count: orderCount,
    employees_reached: maxEmp !== null && empCount >= maxEmp,
    members_reached: maxMem !== null && memCount >= maxMem,
    daily_orders_reached: maxOrd !== null && orderCount >= maxOrd,
  };
}

export type Resource = 'employees' | 'members' | 'daily_orders';

export async function checkQuotaService(
  tenantId: string,
  resource: Resource,
  increment = 1,
): Promise<{ allowed: boolean; strategy: string; reason?: string }> {
  const status = await getQuotaStatusService(tenantId);
  const strategy = status.exceed_strategy;
  let limitReached = false;
  if (resource === 'employees') limitReached = status.employees_reached;
  if (resource === 'members') limitReached = status.members_reached;
  if (resource === 'daily_orders') limitReached = status.daily_orders_reached;
  if (!limitReached && increment > 1) {
    const q = await getQuotaByTenantId(tenantId);
    if (resource === 'employees' && q?.max_employees != null) {
      limitReached = (status.employees_count + increment) > q.max_employees;
    } else if (resource === 'members' && q?.max_members != null) {
      limitReached = (status.members_count + increment) > q.max_members;
    } else if (resource === 'daily_orders' && q?.max_daily_orders != null) {
      limitReached = (status.daily_orders_count + increment) > q.max_daily_orders;
    }
  }
  if (!limitReached) return { allowed: true, strategy };
  if (strategy === 'WARN') return { allowed: true, strategy, reason: 'QUOTA_EXCEEDED_WARN' };
  return { allowed: false, strategy, reason: 'QUOTA_EXCEEDED' };
}

export interface QuotaCheckResult {
  success: boolean;
  remaining: number;
  message: string;
}

/**
 * 配额检查（checkQuotaController 专用），返回 remaining 和是否允许
 */
export async function checkQuotaRemainingService(
  tenantId: string,
  resource: Resource,
  increment: number,
): Promise<QuotaCheckResult> {
  const quota = await getQuotaByTenantId(tenantId);
  if (!quota) return { success: true, remaining: 999999, message: 'OK' };

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
    maxVal = quota.max_daily_orders;
    currentCount = await countDailyOrders(tenantId);
  }

  if (maxVal === null || maxVal <= 0) return { success: true, remaining: 999999, message: 'OK' };
  const remaining = Math.max(0, maxVal - currentCount);

  if (currentCount + increment > maxVal) {
    if (strategy === 'WARN') return { success: true, remaining: 0, message: `QUOTA_SOFT_EXCEEDED:${resource}` };
    return { success: false, remaining: 0, message: `QUOTA_EXCEEDED:${resource}` };
  }
  return { success: true, remaining, message: 'OK' };
}

export async function upsertQuotaService(
  tenantId: string,
  data: Partial<Omit<QuotaRow, 'tenant_id' | 'updated_at'>>,
): Promise<void> {
  return upsertQuota(
    tenantId,
    data.max_employees ?? null,
    data.max_members ?? null,
    data.max_daily_orders ?? null,
    data.exceed_strategy ?? 'BLOCK',
  );
}

export async function listAllQuotasService(): Promise<QuotaRow[]> {
  return listAllQuotas();
}
