/**
 * Unified member_activity write helper — the SINGLE authoritative entry point
 * for modifying member_activity aggregate columns.
 *
 * Uses atomic UPSERT (INSERT ... ON DUPLICATE KEY UPDATE) on the unique index
 * `uniq_ma_member(member_id)` to guarantee consistency without read-before-write races.
 *
 * All modules MUST use this helper instead of direct SQL to member_activity.
 */
import type { PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { execute, queryOne, withTransaction } from '../../database/index.js';

export interface MemberActivityDeltas {
  order_count?: number;
  total_accumulated_ngn?: number;
  total_accumulated_ghs?: number;
  total_accumulated_usdt?: number;
  accumulated_profit?: number;
  accumulated_profit_usdt?: number;
  remaining_points?: number;
  accumulated_points?: number;
  referral_count?: number;
  referral_points?: number;
  total_gift_ngn?: number;
  total_gift_ghs?: number;
  total_gift_usdt?: number;
}

/**
 * Atomically apply deltas to a member_activity row (UPSERT).
 * Runs outside a transaction — safe for fire-and-forget callers.
 * For transactional callers, use {@link applyMemberActivityDeltasOnConn}.
 */
export async function applyMemberActivityDeltas(
  memberId: string,
  deltas: MemberActivityDeltas,
  phoneNumber?: string | null,
): Promise<void> {
  if (!memberId) return;
  return withTransaction(async (conn) => {
    await applyMemberActivityDeltasOnConn(conn, memberId, deltas, phoneNumber);
  });
}

/**
 * Atomically apply deltas to a member_activity row on an existing connection/transaction.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE with the `uniq_ma_member` unique index.
 */
export async function applyMemberActivityDeltasOnConn(
  conn: PoolConnection,
  memberId: string,
  deltas: MemberActivityDeltas,
  phoneNumber?: string | null,
): Promise<void> {
  if (!memberId) return;

  const phone = phoneNumber?.trim() || null;
  const d = deltas;

  // Resolve tenant_id from members table
  const memRow = await conn.query('SELECT tenant_id FROM members WHERE id = ? LIMIT 1', [memberId]);
  const tenantId = ((memRow as any[])[0] as any[])?.[0]?.tenant_id ?? null;

  const oCount = d.order_count ?? 0;
  const tNgn = d.total_accumulated_ngn ?? 0;
  const tGhs = d.total_accumulated_ghs ?? 0;
  const tUsdt = d.total_accumulated_usdt ?? 0;
  const aProfit = d.accumulated_profit ?? 0;
  const aProfitUsdt = d.accumulated_profit_usdt ?? 0;
  const remPts = d.remaining_points ?? 0;
  const accPts = d.accumulated_points ?? 0;
  const refCount = d.referral_count ?? 0;
  const refPts = d.referral_points ?? 0;
  const gNgn = d.total_gift_ngn ?? 0;
  const gGhs = d.total_gift_ghs ?? 0;
  const gUsdt = d.total_gift_usdt ?? 0;

  await conn.query(
    `INSERT INTO member_activity (
      id, member_id, tenant_id, phone_number,
      order_count, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt,
      accumulated_profit, accumulated_profit_usdt,
      remaining_points, accumulated_points,
      referral_count, referral_points,
      total_gift_ngn, total_gift_ghs, total_gift_usdt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      order_count           = GREATEST(0, COALESCE(order_count, 0)           + VALUES(order_count)),
      total_accumulated_ngn = GREATEST(0, COALESCE(total_accumulated_ngn, 0) + VALUES(total_accumulated_ngn)),
      total_accumulated_ghs = GREATEST(0, COALESCE(total_accumulated_ghs, 0) + VALUES(total_accumulated_ghs)),
      total_accumulated_usdt= GREATEST(0, COALESCE(total_accumulated_usdt,0) + VALUES(total_accumulated_usdt)),
      accumulated_profit    = GREATEST(0, COALESCE(accumulated_profit, 0)    + VALUES(accumulated_profit)),
      accumulated_profit_usdt=GREATEST(0, COALESCE(accumulated_profit_usdt,0)+ VALUES(accumulated_profit_usdt)),
      remaining_points      = CASE WHEN VALUES(remaining_points) != 0
                                   THEN VALUES(remaining_points)
                                   ELSE remaining_points END,
      accumulated_points    = GREATEST(0, COALESCE(accumulated_points, 0)    + VALUES(accumulated_points)),
      referral_count        = GREATEST(0, COALESCE(referral_count, 0)        + VALUES(referral_count)),
      referral_points       = GREATEST(0, COALESCE(referral_points, 0)       + VALUES(referral_points)),
      total_gift_ngn        = GREATEST(0, COALESCE(total_gift_ngn, 0)        + VALUES(total_gift_ngn)),
      total_gift_ghs        = GREATEST(0, COALESCE(total_gift_ghs, 0)        + VALUES(total_gift_ghs)),
      total_gift_usdt       = GREATEST(0, COALESCE(total_gift_usdt, 0)       + VALUES(total_gift_usdt)),
      phone_number          = COALESCE(NULLIF(VALUES(phone_number), ''), phone_number),
      updated_at            = NOW(3)`,
    [
      randomUUID(), memberId, tenantId, phone,
      oCount, tNgn, tGhs, tUsdt,
      aProfit, aProfitUsdt,
      remPts, accPts,
      refCount, refPts,
      gNgn, gGhs, gUsdt,
    ],
  );
}

/**
 * Set remaining_points to an absolute value (e.g. sync from points_accounts.balance).
 * This is the ONLY way to set remaining_points to an absolute value.
 */
export async function syncRemainingPoints(memberId: string, absoluteBalance: number): Promise<void> {
  if (!memberId) return;
  await execute(
    `UPDATE member_activity SET remaining_points = ?, updated_at = NOW(3) WHERE member_id = ?`,
    [Math.max(0, absoluteBalance), memberId],
  );
}
