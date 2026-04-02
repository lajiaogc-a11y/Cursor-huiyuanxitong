/**
 * 客户维护任务控制器
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  generateCustomerList,
  createMaintenanceTask,
  createPosterDistributionTask,
  getOpenTasks,
  closeTask,
  getMyTaskItemsForEmployee,
  updateTaskItemRemarkForAssignee,
  markTaskItemDoneForAssignee,
  getTaskProgressListForTenant,
} from './service.js';

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function errCode(e: unknown): string | undefined {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const c = (e as { code: unknown }).code;
    return c != null ? String(c) : undefined;
  }
  return undefined;
}

function resolveTenantId(req: AuthenticatedRequest, requested?: string | null): string | undefined {
  if (req.user?.is_super_admin || req.user?.is_platform_super_admin) {
    return requested ?? req.user?.tenant_id ?? undefined;
  }
  return req.user?.tenant_id ?? undefined;
}

export async function generateCustomerListController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const { tenant_id: reqTenantId, start_date, end_date } = req.body || {};
  const tenantId = resolveTenantId(req, reqTenantId);
  if (!tenantId) {
    res.status(400).json({ success: false, code: 'TENANT_REQUIRED', message: 'tenant_id required' });
    return;
  }
  if (!start_date || !end_date) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'start_date and end_date required' });
    return;
  }
  try {
    const result = await generateCustomerList(tenantId, start_date, end_date);
    res.json({ success: true, data: result });
  } catch (e: unknown) {
    console.error('generateCustomerList error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: errMessage(e, 'Unknown error') });
  }
}

export async function createMaintenanceTaskController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const { tenant_id: reqTenantId, title, phones, assign_to, distribute } = req.body || {};
  const tenantId = resolveTenantId(req, reqTenantId);
  if (!tenantId || !title || !Array.isArray(phones) || !Array.isArray(assign_to)) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Missing required fields' });
    return;
  }
  try {
    const result = await createMaintenanceTask(
      tenantId, employeeId, title, phones, assign_to, distribute || 'even'
    );
    res.json({ success: true, data: result });
  } catch (e: unknown) {
    console.error('createMaintenanceTask error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: errMessage(e, 'Unknown error') });
  }
}

export async function createPosterTaskController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const { tenant_id: reqTenantId, title, poster_ids, assign_to, distribute } = req.body || {};
  const tenantId = resolveTenantId(req, reqTenantId);
  if (!tenantId || !title || !Array.isArray(poster_ids) || !Array.isArray(assign_to)) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Missing required fields' });
    return;
  }
  try {
    const result = await createPosterDistributionTask(
      tenantId,
      employeeId,
      String(title),
      poster_ids.map((x: unknown) => String(x)),
      assign_to.map((x: unknown) => String(x)),
      distribute === 'manual' ? 'manual' : 'even'
    );
    res.json({ success: true, data: result });
  } catch (e: unknown) {
    const code = errCode(e);
    if (code === 'POSTER_NOT_FOUND') {
      res.status(404).json({ success: false, code: 'POSTER_NOT_FOUND', message: 'poster_not_found' });
      return;
    }
    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: errMessage(e, 'validation failed') });
      return;
    }
    console.error('createPosterDistributionTask error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: errMessage(e, 'Unknown error') });
  }
}

export async function getTaskProgressListController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeIdUser = req.user?.id;
  if (!employeeIdUser) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const tenantId = resolveTenantId(req, req.query.tenant_id as string | undefined);
  if (!tenantId) {
    res.status(400).json({ success: false, code: 'TENANT_REQUIRED', message: 'tenant_id required' });
    return;
  }
  const employeeIdFilter = typeof req.query.employee_id === 'string' ? req.query.employee_id : undefined;
  const startDate = typeof req.query.start_date === 'string' ? req.query.start_date : undefined;
  const endDate = typeof req.query.end_date === 'string' ? req.query.end_date : undefined;
  try {
    const rows = await getTaskProgressListForTenant(tenantId, {
      employeeId: employeeIdFilter,
      startDate,
      endDate,
    });
    res.json({ success: true, data: rows });
  } catch (e: unknown) {
    console.error('getTaskProgressList error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: (e as Error)?.message || 'Unknown error' });
  }
}

export async function getOpenTasksController(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    const rows = await getOpenTasks(tenantId);
    res.json({ success: true, data: rows });
  } catch (e: unknown) {
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: errMessage(e, 'Unknown error') });
  }
}

export async function getMyTaskItemsController(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    const groups = await getMyTaskItemsForEmployee(tenantId, employeeId);
    res.json({ success: true, data: groups });
  } catch (e: unknown) {
    console.error('getMyTaskItems error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: errMessage(e, 'Unknown error') });
  }
}

export async function patchTaskItemRemarkController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const itemId = req.params.itemId;
  const { tenant_id: reqTenantId, remark } = req.body || {};
  const tenantId = resolveTenantId(req, reqTenantId);
  if (!tenantId || !itemId) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Missing required fields' });
    return;
  }
  try {
    const ok = await updateTaskItemRemarkForAssignee(itemId, tenantId, employeeId, remark == null ? '' : String(remark));
    if (!ok) {
      res.status(404).json({ success: false, code: 'ITEM_NOT_FOUND', message: 'task_item_not_found' });
      return;
    }
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: errMessage(e, 'Unknown error') });
  }
}

export async function postTaskItemDoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const itemId = req.params.itemId;
  const { tenant_id: reqTenantId, remark } = req.body || {};
  const tenantId = resolveTenantId(req, reqTenantId);
  if (!tenantId || !itemId) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Missing required fields' });
    return;
  }
  try {
    const r = remark != null && String(remark).trim() !== '' ? String(remark).trim() : undefined;
    const ok = await markTaskItemDoneForAssignee(itemId, tenantId, employeeId, r);
    if (!ok) {
      res.status(404).json({ success: false, code: 'ITEM_NOT_FOUND', message: 'task_item_not_found' });
      return;
    }
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: errMessage(e, 'Unknown error') });
  }
}

export async function postTaskItemLogCopyController(_req: AuthenticatedRequest, res: Response): Promise<void> {
  res.json({ success: true });
}

export async function closeTaskController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return;
  }
  const taskId = req.params.id;
  const { tenant_id: reqTenantId } = req.body || {};
  const tenantId = resolveTenantId(req, reqTenantId);
  if (!tenantId || !taskId) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Missing required fields' });
    return;
  }
  try {
    const ok = await closeTask(taskId, tenantId);
    if (!ok) {
      res.status(404).json({ success: false, code: 'TASK_NOT_FOUND', message: 'task_not_found' });
      return;
    }
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: errMessage(e, 'Unknown error') });
  }
}
