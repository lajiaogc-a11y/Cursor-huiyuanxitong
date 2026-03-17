/**
 * 会员门户设置控制器
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  createMemberPortalSettingsVersion,
  getMemberPortalSettingsForEmployee,
  listMemberPortalSettingsVersions,
  rollbackMemberPortalSettingsVersion,
} from './service.js';

function canPublish(user: AuthenticatedRequest['user']): boolean {
  return !!(user?.role === 'admin' || user?.is_super_admin);
}

function canSubmitApproval(user: AuthenticatedRequest['user']): boolean {
  return !!(user?.role === 'manager' || user?.role === 'admin' || user?.is_super_admin);
}

export async function createVersionController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  if (!canPublish(req.user)) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin role required to publish' } });
    return;
  }
  const { payload, note, effective_at, tenant_id } = req.body || {};
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'payload is required' } });
    return;
  }
  try {
    const result = await createMemberPortalSettingsVersion(
      userId,
      payload,
      note || null,
      effective_at || null,
      tenant_id || null
    );
    if (!result.success) {
      const status = result.error === 'NO_PERMISSION' ? 403 : result.error === 'TENANT_NOT_FOUND' ? 400 : 500;
      res.status(status).json({ success: false, error: { code: result.error, message: result.error } });
      return;
    }
    res.json({
      success: true,
      version_id: result.version_id,
      version_no: result.version_no,
      is_applied: result.is_applied,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e?.message || 'Create version failed' } });
  }
}

export async function getSettingsController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  const tenantId = (req.query.tenant_id as string) || null;
  try {
    const result = await getMemberPortalSettingsForEmployee(userId, tenantId);
    if (!result.success) {
      const status = result.error === 'TENANT_NOT_FOUND' ? 400 : 500;
      res.status(status).json({ success: false, error: { code: result.error, message: result.error } });
      return;
    }
    res.json({
      success: true,
      tenant_id: result.tenant_id,
      tenant_name: result.tenant_name,
      settings: result.settings,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e?.message || 'Get settings failed' } });
  }
}

export async function listVersionsController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 20), 10) || 20));
  const tenantId = (req.query.tenant_id as string) || null;
  try {
    const result = await listMemberPortalSettingsVersions(userId, limit, tenantId);
    if (!result.success) {
      const status = result.error === 'TENANT_NOT_FOUND' ? 400 : 500;
      res.status(status).json({ success: false, error: { code: result.error, message: result.error } });
      return;
    }
    res.json({ success: true, versions: result.versions || [] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e?.message || 'List versions failed' } });
  }
}

export async function rollbackVersionController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  if (!canPublish(req.user)) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin role required to rollback' } });
    return;
  }
  const versionId = req.params.versionId;
  const tenantId = (req.query.tenant_id as string) || null;
  if (!versionId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'versionId is required' } });
    return;
  }
  try {
    const result = await rollbackMemberPortalSettingsVersion(userId, versionId, tenantId);
    if (!result.success) {
      const status = result.error === 'NO_PERMISSION' ? 403 : result.error === 'VERSION_NOT_FOUND' ? 404 : 500;
      res.status(status).json({ success: false, error: { code: result.error, message: result.error } });
      return;
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e?.message || 'Rollback failed' } });
  }
}
