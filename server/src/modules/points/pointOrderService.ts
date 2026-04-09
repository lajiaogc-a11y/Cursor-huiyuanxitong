/**
 * 积分兑换订单服务 — 冻结 → 审核 → 确认/拒绝 闭环
 *
 * 所有写操作走 MySQL 事务 + SELECT ... FOR UPDATE 保证原子性。
 * client_request_id 保证幂等（同一 ID 重复请求返回首次结果）。
 */
import { randomUUID } from 'crypto';
import {
  runInTransaction,
  queryPointOrderByClientRequestIdOnConn,
  selectPointsAccountForUpdateOnConn,
  updatePointsAccountFreezeOnConn,
  syncMemberActivityRemainingPointsOnConn,
  selectMemberInfoOnConn,
  insertPointOrderOnConn,
  insertPointsLedgerEntryOnConn,
  selectPointOrderOnConn,
  selectPointOrderForUpdateOnConn,
  selectFrozenPointsForUpdateOnConn,
  unfreezeAndSpendOnConn,
  updatePointOrderStatusOnConn,
  selectAccountBalanceOnConn,
  refundFrozenPointsOnConn,
  listPointOrdersRepository,
  getPointOrderRepository,
  getMemberFrozenPointsRepository,
} from './repository.js';

// ── short ID generator ──

let _seqCounter = 0;
function generateShortId(): string {
  const now = Date.now();
  const seq = (_seqCounter = (_seqCounter + 1) % 1000);
  const rand = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, '0');
  return `PO${now}${seq.toString().padStart(3, '0')}${rand}`;
}

// ── types ──

export interface PointOrder {
  id: string;
  member_id: string;
  tenant_id: string | null;
  phone: string | null;
  nickname: string | null;
  product_name: string;
  product_id: string | null;
  quantity: number;
  points_cost: number;
  status: 'pending' | 'success' | 'rejected';
  client_request_id: string | null;
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface CreatePointOrderInput {
  memberId: string;
  productName: string;
  productId?: string;
  quantity: number;
  pointsCost: number;
  clientRequestId?: string;
}

export interface ProcessPointOrderInput {
  orderId: string;
  reviewerId?: string;
}

// ═══════════════════════════════════════════════════════════════════
// 1) 创建兑换订单 — 冻结积分
// ═══════════════════════════════════════════════════════════════════

export async function createPointOrder(input: CreatePointOrderInput): Promise<PointOrder> {
  const { memberId, productName, productId, quantity, pointsCost, clientRequestId } = input;

  if (pointsCost <= 0) throw new Error('INVALID_POINTS_COST');
  if (quantity < 1) throw new Error('INVALID_QUANTITY');

  return runInTransaction(async (conn) => {
    if (clientRequestId) {
      const existing = await queryPointOrderByClientRequestIdOnConn(conn, clientRequestId);
      if (existing) return existing as unknown as PointOrder;
    }

    const acct = await selectPointsAccountForUpdateOnConn(conn, memberId);
    if (!acct) throw new Error('POINTS_ACCOUNT_NOT_FOUND');

    if (acct.frozen_points > 0) {
      throw new Error('HAS_FROZEN_POINTS');
    }

    const available = Number(acct.balance);
    if (available < pointsCost) {
      throw new Error('INSUFFICIENT_POINTS');
    }

    const balanceAfterFreeze = available - pointsCost;
    await updatePointsAccountFreezeOnConn(conn, acct.id, balanceAfterFreeze, pointsCost);

    await syncMemberActivityRemainingPointsOnConn(conn, memberId, balanceAfterFreeze);

    const member = await selectMemberInfoOnConn(conn, memberId);

    const orderId = generateShortId();
    await insertPointOrderOnConn(conn, {
      id: orderId,
      memberId,
      tenantId: acct.tenant_id,
      phone: member?.phone_number ?? null,
      nickname: member?.nickname ?? null,
      productName,
      productId: productId ?? null,
      quantity,
      pointsCost,
      clientRequestId: clientRequestId ?? null,
    });

    await insertPointsLedgerEntryOnConn(conn, {
      id: randomUUID(),
      accountId: acct.id,
      memberId,
      type: 'freeze',
      amount: -pointsCost,
      balanceAfter: balanceAfterFreeze,
      referenceType: 'point_order_freeze',
      referenceId: orderId,
      description: `Points frozen (redemption: ${productName} ×${quantity})`,
      tenantId: acct.tenant_id,
    });

    const row = await selectPointOrderOnConn(conn, orderId);
    return row as unknown as PointOrder;
  });
}

// ═══════════════════════════════════════════════════════════════════
// 2) 确认兑换 — 解冻积分并最终扣除
// ═══════════════════════════════════════════════════════════════════

export async function approvePointOrder(input: ProcessPointOrderInput): Promise<PointOrder> {
  const { orderId, reviewerId } = input;

  return runInTransaction(async (conn) => {
    const order = await selectPointOrderForUpdateOnConn(conn, orderId) as unknown as PointOrder | null;
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status !== 'pending') throw new Error('ORDER_NOT_PENDING');

    const acct = await selectFrozenPointsForUpdateOnConn(conn, order.member_id);
    if (!acct) throw new Error('POINTS_ACCOUNT_NOT_FOUND');
    if (acct.frozen_points < order.points_cost) throw new Error('FROZEN_POINTS_INCONSISTENT');

    await unfreezeAndSpendOnConn(conn, acct.id, order.points_cost);

    await updatePointOrderStatusOnConn(conn, orderId, 'success', reviewerId ?? null);

    const afterBal = await selectAccountBalanceOnConn(conn, acct.id);
    await insertPointsLedgerEntryOnConn(conn, {
      id: randomUUID(),
      accountId: acct.id,
      memberId: order.member_id,
      type: 'redeem_confirmed',
      amount: 0,
      balanceAfter: afterBal,
      referenceType: 'point_order_confirm',
      referenceId: orderId,
      description: `Redemption confirmed (${order.product_name} ×${order.quantity}, ${order.points_cost} points)`,
      createdBy: reviewerId ?? null,
      tenantId: order.tenant_id,
    });

    return { ...order, status: 'success' as const };
  });
}

// ═══════════════════════════════════════════════════════════════════
// 3) 拒绝兑换 — 解冻并归还积分
// ═══════════════════════════════════════════════════════════════════

export async function rejectPointOrder(
  input: ProcessPointOrderInput & { reason?: string },
): Promise<PointOrder> {
  const { orderId, reviewerId, reason } = input;

  return runInTransaction(async (conn) => {
    const order = await selectPointOrderForUpdateOnConn(conn, orderId) as unknown as PointOrder | null;
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status !== 'pending') throw new Error('ORDER_NOT_PENDING');

    const acct = await selectFrozenPointsForUpdateOnConn(conn, order.member_id);
    if (!acct) throw new Error('POINTS_ACCOUNT_NOT_FOUND');

    await refundFrozenPointsOnConn(conn, acct.id, order.points_cost);

    await updatePointOrderStatusOnConn(conn, orderId, 'rejected', reviewerId ?? null, reason);

    const afterBal = await selectAccountBalanceOnConn(conn, acct.id);
    await insertPointsLedgerEntryOnConn(conn, {
      id: randomUUID(),
      accountId: acct.id,
      memberId: order.member_id,
      type: 'redeem_rejected',
      amount: order.points_cost,
      balanceAfter: afterBal,
      referenceType: 'point_order_reject',
      referenceId: orderId,
      description: `Redemption rejected, refunded (${order.product_name}, refunded ${order.points_cost} points${reason ? `, reason: ${reason}` : ''})`,
      createdBy: reviewerId ?? null,
      tenantId: order.tenant_id,
    });

    await syncMemberActivityRemainingPointsOnConn(conn, order.member_id, afterBal);

    return { ...order, status: 'rejected' as const };
  });
}

// ═══════════════════════════════════════════════════════════════════
// 4) 查询
// ═══════════════════════════════════════════════════════════════════

export async function listPointOrders(params: {
  tenantId?: string | null;
  status?: string;
  memberId?: string;
  limit?: number;
}): Promise<PointOrder[]> {
  return listPointOrdersRepository(params) as unknown as Promise<PointOrder[]>;
}

export async function getPointOrder(orderId: string): Promise<PointOrder | null> {
  return getPointOrderRepository(orderId) as unknown as Promise<PointOrder | null>;
}

/** 会员当前冻结积分 */
export async function getMemberFrozenPoints(memberId: string): Promise<number> {
  return getMemberFrozenPointsRepository(memberId);
}
