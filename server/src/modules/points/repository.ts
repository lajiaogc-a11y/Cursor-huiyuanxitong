/**
 * Points Repository - 唯一可操作 points 相关表的层
 */
import { query, queryOne, withTransaction } from '../../database/index.js';
import type { PoolConnection } from 'mysql2/promise';

export async function getMemberPointsRepository(memberId: string) {
  const row = await queryOne<{ balance: number | string | null; frozen_points: number | string | null }>(
    `SELECT COALESCE(balance, 0) AS balance, COALESCE(frozen_points, 0) AS frozen_points FROM points_accounts WHERE member_id = ? LIMIT 1`,
    [memberId],
  );
  const balance = Number(row?.balance ?? 0);
  const frozen = Number(row?.frozen_points ?? 0);
  return { balance, frozen_points: frozen };
}

/** @deprecated 使用 computeMemberPointsBreakdown；保留避免外部直接引用时报错 */
export async function getMemberPointsBreakdownRepository(memberId: string) {
  const rows = await query(
    `SELECT COALESCE(transaction_type, type) AS source, COALESCE(SUM(amount), 0) AS points
     FROM points_ledger
     WHERE member_id = ?
     GROUP BY COALESCE(transaction_type, type)
     ORDER BY source`,
    [memberId],
  );
  return rows;
}

export async function getMemberSpinQuotaRepository(memberId: string) {
  const rows = await query(
    `SELECT COALESCE(SUM(quota), 0) AS spin_quota FROM spin_quotas WHERE member_id = ?`,
    [memberId]
  );
  return rows[0]?.spin_quota ?? 0;
}

export async function selectMemberTenantIdForRedemption(memberId: string): Promise<{ tenant_id: string | null } | null> {
  return queryOne<{ tenant_id: string | null }>(
    'SELECT tenant_id FROM members WHERE id = ?',
    [memberId],
  );
}

export async function selectPointsAccountBalance(memberId: string): Promise<number> {
  const row = await queryOne<{ balance: number }>(
    'SELECT balance FROM points_accounts WHERE member_id = ?',
    [memberId],
  );
  return Math.round(Number(row?.balance ?? 0));
}

export { withTransaction as runInTransaction };

// ── pointOrderService DB operations ──

export async function queryPointOrderByClientRequestIdOnConn(
  conn: PoolConnection,
  clientRequestId: string,
): Promise<Record<string, unknown> | null> {
  const [rows] = await conn.query('SELECT * FROM point_orders WHERE client_request_id = ? LIMIT 1', [clientRequestId]);
  return ((rows as Record<string, unknown>[])[0] as Record<string, unknown>) ?? null;
}

export async function selectPointsAccountForUpdateOnConn(
  conn: PoolConnection,
  memberId: string,
): Promise<{ id: string; balance: number; frozen_points: number; tenant_id: string | null } | null> {
  const [rows] = await conn.query(
    'SELECT id, balance, COALESCE(frozen_points, 0) AS frozen_points, tenant_id FROM points_accounts WHERE member_id = ? FOR UPDATE',
    [memberId],
  );
  return ((rows as Record<string, unknown>[])[0] as { id: string; balance: number; frozen_points: number; tenant_id: string | null }) ?? null;
}

export async function updatePointsAccountFreezeOnConn(
  conn: PoolConnection,
  accountId: string,
  newBalance: number,
  freezeDelta: number,
): Promise<void> {
  await conn.query(
    `UPDATE points_accounts SET balance = ?, frozen_points = COALESCE(frozen_points, 0) + ?, updated_at = NOW(3) WHERE id = ?`,
    [newBalance, freezeDelta, accountId],
  );
}

export async function syncMemberActivityRemainingPointsOnConn(
  conn: PoolConnection,
  memberId: string,
  points: number,
): Promise<void> {
  await conn.query(
    'UPDATE member_activity SET remaining_points = ?, updated_at = NOW(3) WHERE member_id = ?',
    [Math.max(0, points), memberId],
  );
}

export async function selectMemberInfoOnConn(
  conn: PoolConnection,
  memberId: string,
): Promise<{ phone_number: string | null; nickname: string | null } | null> {
  const [rows] = await conn.query('SELECT phone_number, nickname FROM members WHERE id = ? LIMIT 1', [memberId]);
  return ((rows as Record<string, unknown>[])[0] as { phone_number: string | null; nickname: string | null }) ?? null;
}

export async function insertPointOrderOnConn(
  conn: PoolConnection,
  params: {
    id: string;
    memberId: string;
    tenantId: string | null;
    phone: string | null;
    nickname: string | null;
    productName: string;
    productId: string | null;
    quantity: number;
    pointsCost: number;
    clientRequestId: string | null;
  },
): Promise<void> {
  await conn.query(
    `INSERT INTO point_orders
       (id, member_id, tenant_id, phone, nickname, product_name, product_id,
        quantity, points_cost, status, client_request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(3))`,
    [params.id, params.memberId, params.tenantId, params.phone, params.nickname, params.productName, params.productId, params.quantity, params.pointsCost, params.clientRequestId],
  );
}

export async function insertPointsLedgerEntryOnConn(
  conn: PoolConnection,
  params: {
    id: string;
    accountId: string;
    memberId: string;
    type: string;
    amount: number;
    balanceAfter: number;
    referenceType: string;
    referenceId: string;
    description: string;
    createdBy?: string | null;
    tenantId: string | null;
  },
): Promise<void> {
  await conn.query(
    `INSERT INTO points_ledger
       (id, account_id, member_id, type, amount, balance_after,
        reference_type, reference_id, description, created_by, tenant_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
    [params.id, params.accountId, params.memberId, params.type, params.amount, params.balanceAfter, params.referenceType, params.referenceId, params.description, params.createdBy ?? null, params.tenantId],
  );
}

export async function selectPointOrderOnConn(
  conn: PoolConnection,
  orderId: string,
): Promise<Record<string, unknown> | null> {
  const [rows] = await conn.query('SELECT * FROM point_orders WHERE id = ?', [orderId]);
  return ((rows as Record<string, unknown>[])[0] as Record<string, unknown>) ?? null;
}

export async function selectPointOrderForUpdateOnConn(
  conn: PoolConnection,
  orderId: string,
): Promise<Record<string, unknown> | null> {
  const [rows] = await conn.query('SELECT * FROM point_orders WHERE id = ? FOR UPDATE', [orderId]);
  return ((rows as Record<string, unknown>[])[0] as Record<string, unknown>) ?? null;
}

export async function selectFrozenPointsForUpdateOnConn(
  conn: PoolConnection,
  memberId: string,
): Promise<{ id: string; frozen_points: number; balance: number } | null> {
  const [rows] = await conn.query(
    'SELECT id, COALESCE(frozen_points, 0) AS frozen_points, balance FROM points_accounts WHERE member_id = ? FOR UPDATE',
    [memberId],
  );
  return ((rows as Record<string, unknown>[])[0] as { id: string; frozen_points: number; balance: number }) ?? null;
}

export async function unfreezeAndSpendOnConn(
  conn: PoolConnection,
  accountId: string,
  cost: number,
): Promise<void> {
  await conn.query(
    `UPDATE points_accounts SET frozen_points = frozen_points - ?, total_spent = total_spent + ?, updated_at = NOW(3) WHERE id = ?`,
    [cost, cost, accountId],
  );
}

export async function updatePointOrderStatusOnConn(
  conn: PoolConnection,
  orderId: string,
  status: 'success' | 'rejected',
  reviewerId: string | null,
  rejectReason?: string | null,
): Promise<void> {
  if (status === 'rejected') {
    await conn.query(
      `UPDATE point_orders SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = NOW(3), updated_at = NOW(3) WHERE id = ?`,
      [rejectReason ?? null, reviewerId, orderId],
    );
  } else {
    await conn.query(
      `UPDATE point_orders SET status = 'success', reviewed_by = ?, reviewed_at = NOW(3), updated_at = NOW(3) WHERE id = ?`,
      [reviewerId, orderId],
    );
  }
}

export async function selectAccountBalanceOnConn(
  conn: PoolConnection,
  accountId: string,
): Promise<number> {
  const [rows] = await conn.query('SELECT balance FROM points_accounts WHERE id = ?', [accountId]);
  const row = (rows as Record<string, unknown>[])[0];
  return Number(row?.balance ?? 0);
}

export async function refundFrozenPointsOnConn(
  conn: PoolConnection,
  accountId: string,
  cost: number,
): Promise<void> {
  await conn.query(
    `UPDATE points_accounts SET frozen_points = frozen_points - ?, balance = balance + ?, updated_at = NOW(3) WHERE id = ?`,
    [cost, cost, accountId],
  );
}

export async function listPointOrdersRepository(params: {
  tenantId?: string | null;
  status?: string;
  memberId?: string;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const conds: string[] = ['1=1'];
  const args: unknown[] = [];
  if (params.tenantId) { conds.push('tenant_id = ?'); args.push(params.tenantId); }
  if (params.status) { conds.push('status = ?'); args.push(params.status); }
  if (params.memberId) { conds.push('member_id = ?'); args.push(params.memberId); }
  const lim = Math.min(Math.max(Number(params.limit) || 100, 1), 500);
  return query<Record<string, unknown>>(
    `SELECT * FROM point_orders WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT ${lim}`,
    args,
  );
}

export async function getPointOrderRepository(orderId: string): Promise<Record<string, unknown> | null> {
  return queryOne<Record<string, unknown>>('SELECT * FROM point_orders WHERE id = ?', [orderId]);
}

export async function getMemberFrozenPointsRepository(memberId: string): Promise<number> {
  const row = await queryOne<{ frozen_points: number }>(
    'SELECT COALESCE(frozen_points, 0) AS frozen_points FROM points_accounts WHERE member_id = ?',
    [memberId],
  );
  return Number(row?.frozen_points ?? 0);
}

export async function insertActivityGiftOnConn(
  conn: PoolConnection,
  params: {
    giftId: string;
    tenantId: string | null;
    memberId: string;
    phone: string;
    currency: string;
    amount: number;
    rate: number;
    fee: number;
    giftValue: number;
    activityType: string;
    paymentAgent: string;
    creatorId: string | null;
    giftNumber: string;
    remark: string;
  },
): Promise<void> {
  await conn.query(
    `INSERT INTO activity_gifts (
      id, tenant_id, member_id, phone_number, currency, amount, rate, fee, gift_value, gift_type,
      payment_agent, creator_id, gift_number, remark, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(3))`,
    [
      params.giftId, params.tenantId, params.memberId, params.phone,
      params.currency, params.amount, params.rate, params.fee, params.giftValue, params.activityType,
      params.paymentAgent, params.creatorId, params.giftNumber, params.remark,
    ],
  );
}
