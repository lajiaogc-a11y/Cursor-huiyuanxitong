/**
 * Employees Controller - 员工管理
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  checkEmployeeUniqueService,
  createEmployeeService,
  deleteEmployeeService,
  forceLogoutEmployeeService,
  getEmployeeNameHistoryService,
  getEmployeeService,
  listActiveVisibleEmployeesService,
  listEmployeesService,
  resetEmployeePasswordService,
  toggleEmployeeStatusService,
  updateEmployeeService,
} from './service.js';

function getActor(req: AuthenticatedRequest) {
  return {
    id: req.user?.id || '',
    role: req.user?.role,
    tenant_id: req.user?.tenant_id ?? null,
    is_super_admin: req.user?.is_super_admin ?? false,
    is_platform_super_admin: req.user?.is_platform_super_admin ?? false,
  };
}

export async function listEmployeesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const isPlatform = !!req.user?.is_platform_super_admin;
  const queryTenantId = req.query.tenant_id as string | undefined;
  let effectiveTenantId: string | undefined;
  if (isPlatform && !queryTenantId) {
    effectiveTenantId = undefined;
  } else {
    effectiveTenantId = queryTenantId ?? req.user?.tenant_id ?? undefined;
    // 租户员工只能查看本租户，禁止通过 query 越权
    if (!isPlatform && effectiveTenantId && req.user?.tenant_id && effectiveTenantId !== req.user.tenant_id) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '只能查看本租户员工' } });
      return;
    }
  }
  const data = await listEmployeesService(effectiveTenantId ?? null);
  res.json({ success: true, data });
}

export async function getEmployeeController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  const result = await getEmployeeService(getActor(req), id);
  if (!result.success) {
    res.status(result.error_code === 'NO_PERMISSION' ? 403 : 404).json({
      success: false,
      error: { code: result.error_code, message: result.message },
    });
    return;
  }
  res.json({ success: true, data: result.data });
}

export async function checkEmployeeUniqueController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const username = req.query.username as string | undefined;
  const realName = req.query.real_name as string | undefined;
  const excludeId = req.query.exclude_id as string | undefined;
  const data = await checkEmployeeUniqueService({
    username,
    real_name: realName,
    exclude_id: excludeId,
  });
  res.json({ success: true, data });
}

export async function createEmployeeController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const result = await createEmployeeService(getActor(req), {
    tenant_id: (body.tenant_id as string | null | undefined) ?? null,
    username: String(body.username ?? '').trim(),
    real_name: String(body.real_name ?? '').trim(),
    role: String(body.role ?? 'staff') as 'admin' | 'manager' | 'staff',
    password: String(body.password ?? ''),
  });
  if (!result.success) {
    res.status(result.error_code === 'NO_PERMISSION' ? 403 : 400).json({
      success: false,
      error: { code: result.error_code, message: result.message },
    });
    return;
  }
  res.json({ success: true, data: result.data });
}

export async function updateEmployeeController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  const body = req.body as Record<string, unknown>;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  const result = await updateEmployeeService(
    getActor(req),
    id,
    {
      username: body.username === undefined ? undefined : String(body.username),
      real_name: body.real_name === undefined ? undefined : String(body.real_name),
      role: body.role === undefined ? undefined : (String(body.role) as 'admin' | 'manager' | 'staff'),
      password: body.password === undefined ? undefined : String(body.password),
      status: body.status === undefined ? undefined : (String(body.status) as 'active' | 'disabled' | 'pending'),
      visible: body.visible === undefined ? undefined : Boolean(body.visible),
    },
    req.user?.id,
    body.change_reason === undefined ? undefined : String(body.change_reason)
  );
  if (!result.success) {
    const status = result.error_code === 'NO_PERMISSION' ? 403 : (result.error_code === 'EMPLOYEE_NOT_FOUND' ? 404 : 400);
    res.status(status).json({ success: false, error: { code: result.error_code, message: result.message } });
    return;
  }
  res.json({ success: true, data: result.data });
}

export async function getEmployeeNameHistoryController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  const result = await getEmployeeNameHistoryService(getActor(req), id);
  if (!result.success) {
    res.status(result.error_code === 'NO_PERMISSION' ? 403 : 404).json({
      success: false,
      error: { code: result.error_code, message: result.message },
    });
    return;
  }
  res.json({ success: true, data: result.data });
}

export async function deleteEmployeeController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  const result = await deleteEmployeeService(getActor(req), id);
  if (!result.success) {
    const status = result.error_code === 'NO_PERMISSION' || result.error_code === 'CANNOT_DELETE_SUPER_ADMIN' ? 403 : 404;
    res.status(status).json({ success: false, error: { code: result.error_code, message: result.message } });
    return;
  }
  res.json({ success: true });
}

export async function toggleEmployeeStatusController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  const result = await toggleEmployeeStatusService(getActor(req), id);
  if (!result.success) {
    const status = result.error_code === 'NO_PERMISSION' ? 403 : 404;
    res.status(status).json({ success: false, error: { code: result.error_code, message: result.message } });
    return;
  }
  res.json({ success: true, data: result.data });
}

export async function resetEmployeePasswordController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  const newPassword = String((req.body as { new_password?: string })?.new_password ?? '');
  if (!id || !newPassword.trim()) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id and new_password required' } });
    return;
  }
  const result = await resetEmployeePasswordService(getActor(req), id, newPassword);
  if (!result.success) {
    const status = result.error_code === 'NO_PERMISSION' ? 403 : 404;
    res.status(status).json({ success: false, error: { code: result.error_code, message: result.message } });
    return;
  }
  res.json({ success: true });
}

export async function forceLogoutEmployeeController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  const reason = (req.body as { reason?: string })?.reason ?? 'admin_force_logout';
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  const result = await forceLogoutEmployeeService(getActor(req), id, reason);
  if (!result.success) {
    const status = result.error_code === 'NO_PERMISSION' || result.error_code === 'SELF_NOT_ALLOWED' ? 403 : 404;
    res.status(status).json({ success: false, error: { code: result.error_code, message: result.message } });
    return;
  }
  res.json({ success: true });
}

export async function listActiveVisibleEmployeesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const isPlatform = !!req.user?.is_platform_super_admin;
  const queryTenantId = req.query.tenant_id as string | undefined;
  const tenantId = isPlatform ? (queryTenantId ?? null) : (req.user?.tenant_id ?? null);
  const data = await listActiveVisibleEmployeesService(getActor(req), tenantId);
  res.json({ success: true, data });
}
