/**
 * 工作任务 Controller - 维护历史、我的任务、发动态（JWT 认证）
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { getTaskProgressList, getMyTaskItems, createPosterTask, createCustomerMaintenanceTask } from './repository.js';

export async function getTaskProgressController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = (req.query.tenant_id as string) || req.user?.tenant_id;
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant_id required' } });
    return;
  }
  const isPlatform = !!req.user?.is_platform_super_admin;
  if (!isPlatform && req.user?.tenant_id && tenantId !== req.user.tenant_id) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '只能查看本租户数据' } });
    return;
  }
  try {
    const data = await getTaskProgressList({
      tenantId,
      employeeId: req.query.employee_id as string | undefined,
      startDate: req.query.start_date as string | undefined,
      endDate: req.query.end_date as string | undefined,
    });
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Tasks] getTaskProgress error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load task progress' } });
  }
}

export async function getMyTaskItemsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const employeeId = req.user?.id;
  if (!employeeId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  try {
    const data = await getMyTaskItems(employeeId);
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Tasks] getMyTaskItems error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load tasks' } });
  }
}

export async function createPosterTaskController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body as {
    title?: string;
    tenant_id?: string;
    poster_ids?: string[];
    posterIds?: string[];
    assign_to?: string[];
    assignTo?: string[];
    distribute?: 'even' | 'manual';
    manual_map?: Record<string, string[]>;
    manualMap?: Record<string, string[]>;
  };
  const tenantId = body.tenant_id as string | undefined || req.user?.tenant_id;
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant_id required' } });
    return;
  }
  const isPlatform = !!req.user?.is_platform_super_admin;
  if (!isPlatform && req.user?.tenant_id && tenantId !== req.user.tenant_id) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '只能操作本租户' } });
    return;
  }
  const title = body.title || `发动态 ${new Date().toLocaleDateString()}`;
  const posterIds = body.poster_ids || body.posterIds || [];
  const assignTo = body.assign_to || body.assignTo || [];
  if (!posterIds.length || !assignTo.length) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'poster_ids and assign_to required' } });
    return;
  }
  const createdBy = req.user?.id;
  if (!createdBy) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  try {
    const data = await createPosterTask({
      title,
      posterIds,
      assignTo,
      distribute: (body.distribute as 'even' | 'manual') || 'even',
      manualMap: body.manual_map || body.manualMap,
      createdBy,
      tenantId,
    });
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Tasks] createPosterTask error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create task' } });
  }
}

export async function createCustomerMaintenanceTaskController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body as {
    title?: string;
    tenant_id?: string;
    phones?: string[];
    assign_to?: string[];
    assignTo?: string[];
    distribute?: 'even' | 'manual';
    manual_map?: Record<string, string[]>;
    manualMap?: Record<string, string[]>;
  };
  const tenantId = body.tenant_id ?? req.user?.tenant_id;
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant_id required' } });
    return;
  }
  const isPlatform = !!req.user?.is_platform_super_admin;
  if (!isPlatform && req.user?.tenant_id && tenantId !== req.user.tenant_id) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '只能操作本租户' } });
    return;
  }
  const title = body.title || `客户维护 ${new Date().toLocaleDateString()}`;
  const phones = body.phones || [];
  const assignTo = body.assign_to || body.assignTo || [];
  if (!phones.length || !assignTo.length) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'phones and assign_to required' } });
    return;
  }
  const createdBy = req.user?.id;
  if (!createdBy) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }
  try {
    const data = await createCustomerMaintenanceTask({
      title,
      phones,
      assignTo,
      distribute: (body.distribute as 'even' | 'manual') || 'even',
      manualMap: body.manual_map || body.manualMap,
      createdBy,
      tenantId,
    });
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Tasks] createCustomerMaintenanceTask error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create task' } });
  }
}
