/**
 * 海报库控制器
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { savePoster, getPosters, updatePoster, deletePoster } from './service.js';

function resolveTenantId(req: AuthenticatedRequest, requested?: string | null): string | undefined {
  if (req.user?.is_super_admin || req.user?.is_platform_super_admin) {
    return requested ?? req.user?.tenant_id ?? undefined;
  }
  return req.user?.tenant_id ?? undefined;
}

export async function savePosterController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const { tenant_id: reqTenantId, data_url, title } = req.body || {};
  const tenantId = resolveTenantId(req, reqTenantId);
  if (!tenantId) {
    res.status(400).json({ success: false, code: 'TENANT_REQUIRED', message: 'tenant_id required' });
    return;
  }
  if (!data_url || typeof data_url !== 'string') {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'data_url required' });
    return;
  }
  try {
    const result = await savePoster(tenantId, employeeId, data_url, title);
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: e?.message || 'Unknown error' });
  }
}

export async function getPostersController(req: AuthenticatedRequest, res: Response): Promise<void> {
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
  try {
    const rows = await getPosters(tenantId);
    res.json({ success: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: e?.message || 'Unknown error' });
  }
}

export async function updatePosterController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const posterId = req.params.id;
  const { tenant_id: reqTenantId, title } = req.body || {};
  const tenantId = resolveTenantId(req, reqTenantId);
  if (!tenantId || !posterId) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'tenant_id and poster id required' });
    return;
  }
  try {
    const ok = await updatePoster(posterId, tenantId, { title });
    if (!ok) {
      res.status(404).json({ success: false, code: 'POSTER_NOT_FOUND', message: 'poster_not_found' });
      return;
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: e?.message || 'Unknown error' });
  }
}

export async function deletePosterController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const posterId = req.params.id;
  const { tenant_id: reqTenantId } = req.body || {};
  const tenantId = resolveTenantId(req, reqTenantId ?? (req.query.tenant_id as string | undefined));
  if (!tenantId || !posterId) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'tenant_id and poster id required' });
    return;
  }
  try {
    const ok = await deletePoster(posterId, tenantId);
    if (!ok) {
      res.status(404).json({ success: false, code: 'POSTER_NOT_FOUND', message: 'poster_not_found' });
      return;
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: e?.message || 'Unknown error' });
  }
}
