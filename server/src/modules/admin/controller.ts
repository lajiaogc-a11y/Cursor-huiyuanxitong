/**
 * Admin Controller - 数据管理/归档
 */
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  verifyAdminPasswordService,
  bulkDeleteService,
  deleteOrderService,
  deleteMemberService,
} from './service.js';

export async function verifyPasswordController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Password required' } });
    return;
  }
  const username = authReq.user?.username;
  if (!username) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
    return;
  }
  const ok = await verifyAdminPasswordService(username, password);
  res.json({ success: true, valid: ok });
}

export async function bulkDeleteController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as { password?: string; retainMonths?: number; deleteSelections?: any };
  if (!body.password || body.retainMonths === undefined || !body.deleteSelections) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'password, retainMonths, deleteSelections required' } });
    return;
  }
  const username = authReq.user?.username;
  if (!username) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
    return;
  }
  const valid = await verifyAdminPasswordService(username, body.password);
  if (!valid) {
    res.status(403).json({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Invalid admin password' } });
    return;
  }
  const tenantId = authReq.user?.tenant_id ?? null;
  const result = await bulkDeleteService(
    { password: body.password, retainMonths: body.retainMonths, deleteSelections: body.deleteSelections },
    tenantId
  );
  res.json({ success: result.success, data: result });
}

export async function deleteOrderController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const orderId = req.params.id;
  if (!orderId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Order id required' } });
    return;
  }
  const tenantId = authReq.user?.tenant_id ?? null;
  const result = await deleteOrderService(orderId, tenantId);
  if (!result.success) {
    res.status(400).json({ success: false, error: { code: 'DELETE_FAILED', message: result.error } });
    return;
  }
  res.json({ success: true });
}

export async function archiveOrdersController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as { password?: string; retainMonths?: number; recycleActivityData?: boolean };
  if (!body.password || body.retainMonths === undefined) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'password, retainMonths required' } });
    return;
  }
  const username = authReq.user?.username;
  if (!username) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
    return;
  }
  const valid = await verifyAdminPasswordService(username, body.password);
  if (!valid) {
    res.status(403).json({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Invalid admin password' } });
    return;
  }
  const tenantId = authReq.user?.tenant_id ?? null;
  const result = await bulkDeleteService(
    {
      password: body.password,
      retainMonths: body.retainMonths,
      deleteSelections: {
        orders: true,
        recycleActivityDataOnOrderDelete: body.recycleActivityData ?? false,
        members: { memberManagement: false, activityData: false, activityGift: false, pointsLedger: false },
        preserveActivityData: true,
      },
    },
    tenantId
  );
  res.json({ success: result.success, data: result });
}

export async function archiveMembersController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const body = req.body as { password?: string; retainMonths?: number; preserveActivityData?: boolean };
  if (!body.password || body.retainMonths === undefined) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'password, retainMonths required' } });
    return;
  }
  const username = authReq.user?.username;
  if (!username) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
    return;
  }
  const valid = await verifyAdminPasswordService(username, body.password);
  if (!valid) {
    res.status(403).json({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Invalid admin password' } });
    return;
  }
  const tenantId = authReq.user?.tenant_id ?? null;
  const result = await bulkDeleteService(
    {
      password: body.password,
      retainMonths: body.retainMonths,
      deleteSelections: {
        orders: false,
        members: { memberManagement: true, activityData: true, activityGift: true, pointsLedger: true },
        preserveActivityData: body.preserveActivityData ?? true,
      },
    },
    tenantId
  );
  res.json({ success: result.success, data: result });
}

export async function deleteMemberController(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const memberId = req.params.id;
  if (!memberId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Member id required' } });
    return;
  }
  const tenantId = authReq.user?.tenant_id ?? null;
  const result = await deleteMemberService(memberId, tenantId);
  if (!result.success) {
    res.status(400).json({ success: false, error: { code: 'DELETE_FAILED', message: result.error } });
    return;
  }
  res.json({ success: true });
}
