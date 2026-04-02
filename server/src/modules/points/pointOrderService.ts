/**
 * 积分兑换订单服务 — 冻结 → 审核 → 确认/拒绝 闭环
 *
 * 所有写操作走 MySQL 事务 + SELECT ... FOR UPDATE 保证原子性。
 * client_request_id 保证幂等（同一 ID 重复请求返回首次结果）。
 */
import { randomUUID } from 'crypto';
import type { PoolConnection } from 'mysql2/promise';
import { query, queryOne, withTransaction } from '../../database/index.js';

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

// ── helpers ──

async function qOne<T>(conn: PoolConnection, sql: string, params?: unknown[]): Promise<T | null> {
  const [rows] = await conn.query(sql, params ?? []);
  return (rows as T[])[0] ?? null;
}
async function exec(conn: PoolConnection, sql: string, params?: unknown[]): Promise<void> {
  await conn.query(sql, params ?? []);
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

  return withTransaction(async (conn) => {
    // ── idempotency: same client_request_id returns first result ──
    if (clientRequestId) {
      const existing = await qOne<PointOrder>(
        conn,
        'SELECT * FROM point_orders WHERE client_request_id = ? LIMIT 1',
        [clientRequestId],
      );
      if (existing) return existing;
    }

    // ── lock the points account ──
    const acct = await qOne<{
      id: string;
      balance: number;
      frozen_points: number;
      tenant_id: string | null;
    }>(
      conn,
      'SELECT id, balance, COALESCE(frozen_points, 0) AS frozen_points, tenant_id FROM points_accounts WHERE member_id = ? FOR UPDATE',
      [memberId],
    );

    if (!acct) throw new Error('POINTS_ACCOUNT_NOT_FOUND');

    // ── rule: frozen_points > 0 → reject new redemptions ──
    if (acct.frozen_points > 0) {
      throw new Error('HAS_FROZEN_POINTS');
    }

    // ── rule: available_points (= balance) >= cost ──
    const available = Number(acct.balance);
    if (available < pointsCost) {
      throw new Error('INSUFFICIENT_POINTS');
    }

    // ── freeze: available -= cost, frozen += cost ──
    const balanceAfterFreeze = available - pointsCost;
    await exec(
      conn,
      `UPDATE points_accounts
         SET balance = ?,
             frozen_points = COALESCE(frozen_points, 0) + ?,
             updated_at = NOW(3)
       WHERE id = ?`,
      [balanceAfterFreeze, pointsCost, acct.id],
    );

    // ── fetch member info for denormalized fields ──
    const member = await qOne<{ phone_number: string | null; nickname: string | null }>(
      conn,
      'SELECT phone_number, nickname FROM members WHERE id = ? LIMIT 1',
      [memberId],
    );

    // ── insert order ──
    const orderId = generateShortId();
    await exec(
      conn,
      `INSERT INTO point_orders
         (id, member_id, tenant_id, phone, nickname, product_name, product_id,
          quantity, points_cost, status, client_request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(3))`,
      [
        orderId,
        memberId,
        acct.tenant_id,
        member?.phone_number ?? null,
        member?.nickname ?? null,
        productName,
        productId ?? null,
        quantity,
        pointsCost,
        clientRequestId ?? null,
      ],
    );

    // ── ledger entry: freeze (balance already deducted above, record it) ──
    await exec(
      conn,
      `INSERT INTO points_ledger
         (id, account_id, member_id, type, amount, balance_after,
          reference_type, reference_id, description, tenant_id, created_at)
       VALUES (?, ?, ?, 'freeze', ?, ?, 'point_order_freeze', ?, ?, ?, NOW(3))`,
      [
        randomUUID(), acct.id, memberId,
        -pointsCost, balanceAfterFreeze,
        orderId,
        `积分冻结（兑换: ${productName} ×${quantity}）`,
        acct.tenant_id,
      ],
    );

    const row = await qOne<PointOrder>(
      conn,
      'SELECT * FROM point_orders WHERE id = ?',
      [orderId],
    );
    return row!;
  });
}

// ═══════════════════════════════════════════════════════════════════
// 2) 确认兑换 — 解冻积分并最终扣除
// ═══════════════════════════════════════════════════════════════════

export async function approvePointOrder(input: ProcessPointOrderInput): Promise<PointOrder> {
  const { orderId, reviewerId } = input;

  return withTransaction(async (conn) => {
    // ── lock order ──
    const order = await qOne<PointOrder>(
      conn,
      'SELECT * FROM point_orders WHERE id = ? FOR UPDATE',
      [orderId],
    );
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status !== 'pending') throw new Error('ORDER_NOT_PENDING');

    // ── lock points account ──
    const acct = await qOne<{ id: string; frozen_points: number }>(
      conn,
      'SELECT id, COALESCE(frozen_points, 0) AS frozen_points FROM points_accounts WHERE member_id = ? FOR UPDATE',
      [order.member_id],
    );
    if (!acct) throw new Error('POINTS_ACCOUNT_NOT_FOUND');
    if (acct.frozen_points < order.points_cost) throw new Error('FROZEN_POINTS_INCONSISTENT');

    // ── unfreeze: frozen -= cost (balance stays deducted) ──
    await exec(
      conn,
      `UPDATE points_accounts
         SET frozen_points = frozen_points - ?,
             total_spent = total_spent + ?,
             updated_at = NOW(3)
       WHERE id = ?`,
      [order.points_cost, order.points_cost, acct.id],
    );

    // ── update order status ──
    await exec(
      conn,
      `UPDATE point_orders
         SET status = 'success', reviewed_by = ?, reviewed_at = NOW(3), updated_at = NOW(3)
       WHERE id = ?`,
      [reviewerId ?? null, orderId],
    );

    // ── ledger entry: confirmed deduction ──
    const after = await qOne<{ balance: number }>(
      conn,
      'SELECT balance FROM points_accounts WHERE id = ?',
      [acct.id],
    );
    await exec(
      conn,
      `INSERT INTO points_ledger
         (id, account_id, member_id, type, amount, balance_after,
          reference_type, reference_id, description, created_by, tenant_id)
       VALUES (?, ?, ?, 'redeem_confirmed', 0, ?, 'point_order_confirm', ?, ?, ?, ?)`,
      [
        randomUUID(),
        acct.id,
        order.member_id,
        after?.balance ?? 0,
        orderId,
        `兑换确认（${order.product_name} ×${order.quantity}，${order.points_cost} 积分）`,
        reviewerId ?? null,
        order.tenant_id,
      ],
    );

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

  return withTransaction(async (conn) => {
    // ── lock order ──
    const order = await qOne<PointOrder>(
      conn,
      'SELECT * FROM point_orders WHERE id = ? FOR UPDATE',
      [orderId],
    );
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status !== 'pending') throw new Error('ORDER_NOT_PENDING');

    // ── lock points account ──
    const acct = await qOne<{ id: string; frozen_points: number; balance: number }>(
      conn,
      'SELECT id, COALESCE(frozen_points, 0) AS frozen_points, balance FROM points_accounts WHERE member_id = ? FOR UPDATE',
      [order.member_id],
    );
    if (!acct) throw new Error('POINTS_ACCOUNT_NOT_FOUND');

    // ── rollback: frozen -= cost, available += cost ──
    await exec(
      conn,
      `UPDATE points_accounts
         SET frozen_points = frozen_points - ?,
             balance = balance + ?,
             updated_at = NOW(3)
       WHERE id = ?`,
      [order.points_cost, order.points_cost, acct.id],
    );

    // ── update order status ──
    await exec(
      conn,
      `UPDATE point_orders
         SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = NOW(3), updated_at = NOW(3)
       WHERE id = ?`,
      [reason ?? null, reviewerId ?? null, orderId],
    );

    // ── ledger entry: refund ──
    const afterBal = Number(acct.balance) + order.points_cost;
    await exec(
      conn,
      `INSERT INTO points_ledger
         (id, account_id, member_id, type, amount, balance_after,
          reference_type, reference_id, description, created_by, tenant_id)
       VALUES (?, ?, ?, 'redeem_rejected', ?, ?, 'point_order_reject', ?, ?, ?, ?)`,
      [
        randomUUID(),
        acct.id,
        order.member_id,
        order.points_cost,
        afterBal,
        orderId,
        `兑换拒绝退回（${order.product_name}，退回 ${order.points_cost} 积分${reason ? `，原因: ${reason}` : ''}）`,
        reviewerId ?? null,
        order.tenant_id,
      ],
    );

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
  const conds: string[] = ['1=1'];
  const args: unknown[] = [];

  if (params.tenantId) {
    conds.push('tenant_id = ?');
    args.push(params.tenantId);
  }
  if (params.status) {
    conds.push('status = ?');
    args.push(params.status);
  }
  if (params.memberId) {
    conds.push('member_id = ?');
    args.push(params.memberId);
  }

  const lim = Math.min(Math.max(Number(params.limit) || 100, 1), 500);
  const rows = await query<PointOrder>(
    `SELECT * FROM point_orders WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT ${lim}`,
    args,
  );
  return rows;
}

export async function getPointOrder(orderId: string): Promise<PointOrder | null> {
  return queryOne<PointOrder>('SELECT * FROM point_orders WHERE id = ?', [orderId]);
}

/** 会员当前冻结积分 */
export async function getMemberFrozenPoints(memberId: string): Promise<number> {
  const row = await queryOne<{ frozen_points: number }>(
    'SELECT COALESCE(frozen_points, 0) AS frozen_points FROM points_accounts WHERE member_id = ?',
    [memberId],
  );
  return Number(row?.frozen_points ?? 0);
}
