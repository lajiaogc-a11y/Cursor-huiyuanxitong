/**
 * Tenants Controller - 仅平台总管理员可访问
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { listTenantsRepository } from './repository.js';
import {
  createTenantWithAdminService,
  deleteTenantService,
  resetTenantAdminPasswordService,
  setTenantSuperAdminService,
  updateTenantBasicInfoService,
} from './service.js';

function getActor(req: AuthenticatedRequest) {
  return {
    id: req.user?.id ?? '',
    username: req.user?.username,
    is_platform_super_admin: req.user?.is_platform_super_admin,
  };
}

export async function listTenantsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user?.is_platform_super_admin) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Platform admin only' } });
    return;
  }
  const data = await listTenantsRepository();
  res.json({ success: true, data });
}

export async function createTenantController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body as {
    tenantCode?: string;
    tenantName?: string;
    adminUsername?: string;
    adminRealName?: string;
    adminPassword?: string;
  };
  const result = await createTenantWithAdminService(getActor(req), {
    tenantCode: body.tenantCode ?? '',
    tenantName: body.tenantName ?? '',
    adminUsername: body.adminUsername ?? '',
    adminRealName: body.adminRealName ?? '',
    adminPassword: body.adminPassword ?? '',
  });
  if (!result.success) {
    const status = result.errorCode === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ success: false, error: { code: result.errorCode ?? 'UNKNOWN', message: result.message ?? 'Create tenant failed' } });
    return;
  }
  res.json({ success: true, data: result });
}

export async function updateTenantController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body as { tenantCode?: string; tenantName?: string; status?: string };
  const result = await updateTenantBasicInfoService(getActor(req), {
    tenantId: req.params.id,
    tenantCode: body.tenantCode ?? '',
    tenantName: body.tenantName ?? '',
    status: body.status ?? '',
  });
  if (!result.success) {
    const status = result.errorCode === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ success: false, error: { code: result.errorCode ?? 'UNKNOWN', message: result.message ?? 'Update tenant failed' } });
    return;
  }
  res.json({ success: true });
}

export async function resetTenantAdminPasswordController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body as { adminEmployeeId?: string | null; newPassword?: string };
  const result = await resetTenantAdminPasswordService(getActor(req), {
    tenantId: req.params.id,
    adminEmployeeId: body.adminEmployeeId ?? null,
    newPassword: body.newPassword ?? '',
  });
  if (!result.success) {
    const status = result.errorCode === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ success: false, error: { code: result.errorCode ?? 'UNKNOWN', message: result.message ?? 'Reset tenant admin password failed' } });
    return;
  }
  res.json({ success: true, data: result });
}

export async function deleteTenantController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body as { force?: boolean; password?: string };
  const result = await deleteTenantService(getActor(req), {
    tenantId: req.params.id,
    force: body.force ?? false,
    password: body.password ?? '',
  });
  if (!result.success) {
    const status = result.errorCode === 'FORBIDDEN' ? 403 : result.errorCode === 'INVALID_PASSWORD' ? 401 : 400;
    res.status(status).json({ success: false, error: { code: result.errorCode ?? 'UNKNOWN', message: result.message ?? 'Delete tenant failed' } });
    return;
  }
  res.json({ success: true, data: result });
}

export async function setTenantSuperAdminController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body as { employeeId?: string };
  const result = await setTenantSuperAdminService(getActor(req), body.employeeId ?? '');
  if (!result.success) {
    const status = result.errorCode === 'FORBIDDEN' ? 403 : 400;
    res.status(status).json({ success: false, error: { code: result.errorCode ?? 'UNKNOWN', message: result.message ?? 'Set super admin failed' } });
    return;
  }
  res.json({ success: true });
}
