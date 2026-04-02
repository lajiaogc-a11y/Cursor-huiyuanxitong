/**
 * 号码池控制器 - 提取、归还、消耗、统计
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  extractPhonesByEmployee,
  returnPhonesByEmployee,
  consumePhonesByEmployee,
  getPhoneStatsByEmployee,
  getMyReservedPhonesByEmployee,
  bulkImportByEmployee,
  clearPhonePoolByEmployee,
  getExtractSettings,
  getExtractRecords,
  updateExtractSettingsByEmployee,
  checkPhonePoolTableHealth,
} from './service.js';

function canCrossTenant(req: AuthenticatedRequest): boolean {
  return !!(req.user?.is_super_admin || req.user?.is_platform_super_admin);
}

function resolveTenantId(req: AuthenticatedRequest, requestedTenantId?: string | null): string | undefined {
  if (canCrossTenant(req)) {
    return requestedTenantId ?? req.user?.tenant_id ?? undefined;
  }
  return req.user?.tenant_id ?? undefined;
}

/** 号码池 id 为 UUID 字符串；兼容历史 number */
function parsePhonePoolIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === 'string' && x.trim()) out.push(x.trim());
    else if (typeof x === 'number' && Number.isFinite(x)) out.push(String(Math.trunc(x)));
  }
  return out;
}

export async function extractPhonesController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  const { tenant_id: requestedTenantId, count } = req.body || {};
  const tenantId = resolveTenantId(req, typeof requestedTenantId === 'string' ? requestedTenantId : undefined);
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id is required' } });
    return;
  }
  const n = Math.max(1, Math.min(parseInt(String(count || 100), 10) || 100, 500));
  const result = await extractPhonesByEmployee(employeeId, tenantId, n);
  if (!result.success) {
    const status =
      result.error === 'FORBIDDEN_TENANT_MISMATCH' ? 403
      : result.error === 'NOT_AUTHENTICATED' ? 401
      : 400;
    res.status(status).json({ success: false, error: { code: result.error, message: result.error } });
    return;
  }
  res.json({ success: true, data: result.data ?? [] });
}

export async function returnPhonesController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const { phone_ids, tenant_id: requestedTenantId } = req.body || {};
  const tenantId = resolveTenantId(req, typeof requestedTenantId === 'string' ? requestedTenantId : undefined);
  if (!tenantId) {
    res.status(400).json({ success: false, code: 'TENANT_REQUIRED', message: 'tenant_id is required' });
    return;
  }
  const ids = parsePhonePoolIds(phone_ids);
  const result = await returnPhonesByEmployee(employeeId, tenantId, ids);
  if (!result.success) {
    const status = result.error === 'NOT_AUTHENTICATED' ? 401 : 400;
    res.status(status).json({ success: false, code: result.error ?? 'UNKNOWN', message: result.error ?? 'Unknown error' });
    return;
  }
  res.json({ success: true, data: result.data ?? [] });
}

export async function consumePhonesController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const { phone_ids, tenant_id: requestedTenantId } = req.body || {};
  const tenantId = resolveTenantId(req, typeof requestedTenantId === 'string' ? requestedTenantId : undefined);
  if (!tenantId) {
    res.status(400).json({ success: false, code: 'TENANT_REQUIRED', message: 'tenant_id is required' });
    return;
  }
  const ids = parsePhonePoolIds(phone_ids);
  const result = await consumePhonesByEmployee(employeeId, tenantId, ids);
  if (!result.success) {
    const status = result.error === 'NOT_AUTHENTICATED' ? 401 : 400;
    res.status(status).json({ success: false, code: result.error ?? 'UNKNOWN', message: result.error ?? 'Unknown error' });
    return;
  }
  res.json({ success: true, data: result.data ?? [] });
}

export async function getPhoneStatsController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const tenantId = resolveTenantId(req, req.query.tenant_id as string | undefined);
  if (!tenantId) {
    res.status(400).json({ success: false, code: 'TENANT_REQUIRED', message: 'tenant_id is required' });
    return;
  }
  const result = await getPhoneStatsByEmployee(employeeId, tenantId);
  if (!result.success) {
    const status =
      result.error === 'NOT_AUTHENTICATED' ? 401
      : result.error === 'TENANT_REQUIRED' ? 400
      : result.error === 'FORBIDDEN_TENANT_MISMATCH' ? 403
      : 500;
    res.status(status).json({ success: false, code: result.error ?? 'UNKNOWN', message: result.error ?? 'Unknown error' });
    return;
  }
  res.json({ success: true, data: result.data });
}

export async function getMyReservedPhonesController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const tenantId = resolveTenantId(req, req.query.tenant_id as string | undefined);
  if (!tenantId) {
    res.status(400).json({ success: false, code: 'TENANT_REQUIRED', message: 'tenant_id is required' });
    return;
  }
  const limit = Math.min(parseInt(String(req.query.limit || 500), 10) || 500, 500);
  const result = await getMyReservedPhonesByEmployee(employeeId, tenantId, limit);
  if (!result.success) {
    res.status(400).json({ success: false, code: result.error ?? 'UNKNOWN', message: result.error ?? 'Unknown error' });
    return;
  }
  res.json({ success: true, data: result.data ?? [] });
}

export async function bulkImportController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const { tenant_id: requestedTenantId, lines } = req.body || {};
  const tenantId = resolveTenantId(req, typeof requestedTenantId === 'string' ? requestedTenantId : undefined);
  if (!tenantId || !Array.isArray(lines)) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'tenant_id and lines array required' });
    return;
  }
  const result = await bulkImportByEmployee(employeeId, tenantId, lines);
  if (!result.success) {
    const status = result.error === 'FORBIDDEN_TENANT_MISMATCH' ? 403 : result.error === 'NOT_AUTHENTICATED' ? 401 : 400;
    res.status(status).json({ success: false, code: result.error ?? 'UNKNOWN', message: result.error ?? 'Unknown error' });
    return;
  }
  res.json({ success: true, data: result.data ?? { inserted: 0, skipped: 0 } });
}

export async function clearPhonePoolController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const tenantId = resolveTenantId(req, (req.body?.tenant_id ?? req.query.tenant_id) as string | undefined);
  if (!tenantId) {
    res.status(400).json({ success: false, code: 'TENANT_REQUIRED', message: 'tenant_id required' });
    return;
  }
  const result = await clearPhonePoolByEmployee(employeeId, tenantId);
  if (!result.success) {
    const status = result.error === 'FORBIDDEN_ADMIN_ONLY' ? 403 : result.error === 'FORBIDDEN_TENANT_MISMATCH' ? 403 : 401;
    res.status(status).json({ success: false, code: result.error ?? 'UNKNOWN', message: result.error ?? 'Unknown error' });
    return;
  }
  res.json({ success: true });
}

export async function getExtractSettingsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const result = await getExtractSettings();
  if (!result.success) {
    res.status(500).json({ success: false, code: result.error ?? 'UNKNOWN', message: result.error ?? 'Unknown error' });
    return;
  }
  res.json({ success: true, data: result.data });
}

export async function getExtractRecordsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const tenantId = resolveTenantId(req, req.query.tenant_id as string | undefined);
  if (!tenantId) {
    res.status(400).json({ success: false, code: 'TENANT_REQUIRED', message: 'tenant_id required' });
    return;
  }
  const limit = Math.min(parseInt(String(req.query.limit || 100), 10) || 100, 500);
  const result = await getExtractRecords(tenantId, limit);
  if (!result.success) {
    res.status(500).json({ success: false, code: result.error ?? 'UNKNOWN', message: result.error ?? 'Unknown error' });
    return;
  }
  res.json({ success: true, data: result.data ?? [] });
}

export async function phonePoolHealthController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const health = await checkPhonePoolTableHealth();
    res.json({ success: true, data: health });
  } catch (e: any) {
    res.status(500).json({ success: false, code: 'HEALTH_CHECK_FAILED', message: e?.message || 'Unknown error' });
  }
}

export async function updateExtractSettingsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const { per_extract_limit, per_user_daily_limit } = req.body || {};
  const result = await updateExtractSettingsByEmployee(
    employeeId,
    per_extract_limit ?? null,
    per_user_daily_limit ?? null
  );
  if (!result.success) {
    const status = result.error === 'FORBIDDEN_ADMIN_ONLY' ? 403 : 401;
    res.status(status).json({ success: false, code: result.error ?? 'UNKNOWN', message: result.error ?? 'Unknown error' });
    return;
  }
  res.json({ success: true });
}
