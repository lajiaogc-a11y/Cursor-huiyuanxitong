/**
 * 积分兑换订单控制器
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  createPointOrder,
  approvePointOrder,
  rejectPointOrder,
  listPointOrders,
  getPointOrder,
  getMemberFrozenPoints,
} from './pointOrderService.js';

function validationError(res: Response, message: string): void {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
}

function businessError(res: Response, code: string, message: string, extra?: Record<string, unknown>): void {
  res.status(400).json({ success: false, error: { code, message }, ...extra });
}

// ── POST /api/points/orders — 创建兑换订单（冻结积分） ──

export async function createPointOrderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const memberId = String(body.member_id || '');
    const productName = String(body.product_name || '').trim();
    const productId = body.product_id ? String(body.product_id) : undefined;
    const quantity = Number(body.quantity || 1);
    const pointsCost = Number(body.points_cost || 0);
    const clientRequestId = body.client_request_id ? String(body.client_request_id) : undefined;

    if (!memberId) return validationError(res, 'member_id required');
    if (!productName) return validationError(res, 'product_name required');
    if (pointsCost <= 0) return validationError(res, 'points_cost must be > 0');
    if (quantity < 1) return validationError(res, 'quantity must be >= 1');

    const order = await createPointOrder({
      memberId,
      productName,
      productId,
      quantity,
      pointsCost,
      clientRequestId,
    });

    res.status(201).json({ success: true, data: order });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    switch (msg) {
      case 'POINTS_ACCOUNT_NOT_FOUND':
        return businessError(res, msg, '积分账户不存在');
      case 'HAS_FROZEN_POINTS':
        return businessError(res, msg, '有待审核的兑换订单，暂时无法兑换');
      case 'INSUFFICIENT_POINTS':
        return businessError(res, msg, '可用积分不足');
      default:
        console.error('[point-order] create', e);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  }
}

// ── POST /api/points/orders/:id/approve — 确认兑换 ──

export async function approvePointOrderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const orderId = req.params.id;
    if (!orderId) return validationError(res, 'order id required');

    const order = await approvePointOrder({
      orderId,
      reviewerId: req.user?.id,
    });
    res.json({ success: true, data: order });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    switch (msg) {
      case 'ORDER_NOT_FOUND':
        return businessError(res, msg, '订单不存在');
      case 'ORDER_NOT_PENDING':
        return businessError(res, msg, '订单状态不是待审核，无法操作');
      case 'FROZEN_POINTS_INCONSISTENT':
        return businessError(res, msg, '冻结积分数据异常');
      default:
        console.error('[point-order] approve', e);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  }
}

// ── POST /api/points/orders/:id/reject — 拒绝兑换（退回积分） ──

export async function rejectPointOrderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const orderId = req.params.id;
    if (!orderId) return validationError(res, 'order id required');

    const reason = String((req.body as Record<string, unknown>).reason || '').trim() || undefined;

    const order = await rejectPointOrder({
      orderId,
      reviewerId: req.user?.id,
      reason,
    });
    res.json({ success: true, data: order });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    switch (msg) {
      case 'ORDER_NOT_FOUND':
        return businessError(res, msg, '订单不存在');
      case 'ORDER_NOT_PENDING':
        return businessError(res, msg, '订单状态不是待审核，无法操作');
      default:
        console.error('[point-order] reject', e);
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
    console.error('[point-order] list', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String(e) } });
  }
}

// ── GET /api/points/orders/:id — 单个详情 ──

export async function getPointOrderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const order = await getPointOrder(req.params.id);
    if (!order) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '订单不存在' } });
      return;
    }
    res.json({ success: true, data: order });
  } catch (e: unknown) {
    console.error('[point-order] get', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String(e) } });
  }
}

// ── GET /api/points/member/:memberId/frozen — 会员冻结积分 ──

export async function getMemberFrozenPointsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const memberId = req.params.memberId;
    if (!memberId) return validationError(res, 'memberId required');
    const frozen = await getMemberFrozenPoints(memberId);
    res.json({ success: true, data: { frozen_points: frozen } });
  } catch (e: unknown) {
    console.error('[point-order] frozen', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String(e) } });
  }
}
