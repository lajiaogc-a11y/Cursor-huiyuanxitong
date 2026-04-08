/**
 * 积分兑换订单控制器
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { queryOne } from '../../database/index.js';
import { logger } from '../../lib/logger.js';
import {
  createPointOrder,
  approvePointOrder,
  rejectPointOrder,
  listPointOrders,
  getPointOrder,
  getMemberFrozenPoints,
} from './pointOrderService.js';
import { insertOperationLogRepository } from '../data/repository.js';

function validationError(res: Response, message: string): void {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
}

function businessError(res: Response, code: string, message: string, extra?: Record<string, unknown>): void {
  res.status(400).json({ success: false, error: { code, message }, ...extra });
}

function assertReviewRole(req: AuthenticatedRequest, res: Response): boolean {
  const role = req.user?.role;
  const ok =
    role === 'admin' ||
    role === 'manager' ||
    !!req.user?.is_super_admin ||
    !!req.user?.is_platform_super_admin;
  if (!ok) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only admin/manager can review point orders' } });
  }
  return ok;
}

// ── POST /api/points/orders — 创建兑换订单（冻结积分） ──

export async function createPointOrderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const body = req.body as {
      member_id: string;
      product_name: string;
      product_id?: string;
      quantity?: number;
      points_cost: number;
      client_request_id?: string;
    };

    if (req.user?.type === 'member' && req.user.id !== body.member_id) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create order for another member' } });
      return;
    }

    const order = await createPointOrder({
      memberId: body.member_id,
      productName: body.product_name.trim(),
      productId: body.product_id || undefined,
      quantity: body.quantity ?? 1,
      pointsCost: body.points_cost,
      clientRequestId: body.client_request_id || undefined,
    });

    res.status(201).json({ success: true, data: order });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    switch (msg) {
      case 'POINTS_ACCOUNT_NOT_FOUND':
        return businessError(res, msg, 'Points account not found');
      case 'HAS_FROZEN_POINTS':
        return businessError(res, msg, 'Pending redemption order exists');
      case 'INSUFFICIENT_POINTS':
        return businessError(res, msg, 'Insufficient points');
      default:
        logger.error('point-order', 'create', e);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  }
}

// ── POST /api/points/orders/:id/approve — 确认兑换 ──

export async function approvePointOrderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertReviewRole(req, res)) return;
  try {
    const { id: orderId } = req.params;

    const order = await approvePointOrder({
      orderId,
      reviewerId: req.user?.id,
    });

    insertOperationLogRepository({
      operator_id: req.user?.id ?? null,
      operator_account: req.user?.username ?? req.user?.real_name ?? 'unknown',
      operator_role: req.user?.role ?? 'employee',
      module: 'points_redemption',
      operation_type: 'status_change',
      object_id: orderId,
      object_description: `Points redemption approved: ${order.product_name} ×${order.quantity}`,
      before_data: { status: 'pending' },
      after_data: { status: 'success', reviewed_by: req.user?.id },
      ip_address: req.ip ?? null,
    }).catch(err => logger.error('point-order', 'operation log failed:', err));

    res.json({ success: true, data: order });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    switch (msg) {
      case 'ORDER_NOT_FOUND':
        return businessError(res, msg, 'Order not found');
      case 'ORDER_NOT_PENDING':
        return businessError(res, msg, 'Order is not pending, cannot process');
      case 'FROZEN_POINTS_INCONSISTENT':
        return businessError(res, msg, 'Frozen points data error');
      default:
        logger.error('point-order', 'approve', e);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  }
}

// ── POST /api/points/orders/:id/reject — 拒绝兑换（退回积分） ──

export async function rejectPointOrderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!assertReviewRole(req, res)) return;
  try {
    const { id: orderId } = req.params;
    const reason = String((req.body as { reason?: string }).reason || '').trim() || undefined;

    const order = await rejectPointOrder({
      orderId,
      reviewerId: req.user?.id,
      reason,
    });

    insertOperationLogRepository({
      operator_id: req.user?.id ?? null,
      operator_account: req.user?.username ?? req.user?.real_name ?? 'unknown',
      operator_role: req.user?.role ?? 'employee',
      module: 'points_redemption',
      operation_type: 'reject',
      object_id: orderId,
      object_description: `Points redemption rejected: ${order.product_name} ×${order.quantity}${reason ? ` (${reason})` : ''}`,
      before_data: { status: 'pending' },
      after_data: { status: 'rejected', reject_reason: reason ?? null, reviewed_by: req.user?.id },
      ip_address: req.ip ?? null,
    }).catch(err => logger.error('point-order', 'operation log failed:', err));

    res.json({ success: true, data: order });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    switch (msg) {
      case 'ORDER_NOT_FOUND':
        return businessError(res, msg, 'Order not found');
      case 'ORDER_NOT_PENDING':
        return businessError(res, msg, 'Order is not pending, cannot process');
      default:
        logger.error('point-order', 'reject', e);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  }
}

// ── GET /api/points/orders — 列表（员工端） ──

export async function listPointOrdersController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const q = req.query as Record<string, string>;
    const orders = await listPointOrders({
      tenantId: req.user?.tenant_id,
      status: q.status || undefined,
      memberId: q.member_id || undefined,
      limit: Number(q.limit) || 100,
    });
    res.json({ success: true, data: orders });
  } catch (e: unknown) {
    logger.error('point-order', 'list', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String(e) } });
  }
}

// ── GET /api/points/orders/:id — 单个详情 ──

export async function getPointOrderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const order = await getPointOrder(req.params.id);
    if (!order) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
      return;
    }
    if (req.user?.type === 'member' && order.member_id !== req.user.id) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this order' } });
      return;
    }
    if (req.user?.type !== 'member' && req.user?.tenant_id && !req.user?.is_platform_super_admin) {
      if (order.tenant_id !== req.user.tenant_id) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this order' } });
        return;
      }
    }
    res.json({ success: true, data: order });
  } catch (e: unknown) {
    logger.error('point-order', 'get', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String(e) } });
  }
}

// ── GET /api/points/member/:memberId/frozen — 会员冻结积分 ──

export async function getMemberFrozenPointsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { memberId } = req.params;
    if (req.user?.type === 'member') {
      if (req.user.id !== memberId) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this member' } }); return; }
    } else if (!req.user?.is_platform_super_admin && req.user?.tenant_id) {
      const row = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ? LIMIT 1', [memberId]);
      if (row?.tenant_id !== req.user.tenant_id) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this member' } }); return; }
    }
    const frozen = await getMemberFrozenPoints(memberId);
    res.json({ success: true, data: { frozen_points: frozen } });
  } catch (e: unknown) {
    logger.error('point-order', 'frozen', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String(e) } });
  }
}
