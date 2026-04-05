/**
 * 会员抽奖次数余额：存 member_activity.lottery_spin_balance，与每日免费次数分开统计；
 * 抽奖时在事务中先扣次数再写 lottery_logs，与 spin_credits 发放增量同步。
 */
import type { PoolConnection } from 'mysql2/promise';
async function queryOneConn<T = Record<string, unknown>>(
  conn: PoolConnection,
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const [rows] = await conn.query(sql, params ?? []);
  const r = rows as T[];
  return r[0] ?? null;
}

async function execConn(conn: PoolConnection, sql: string, params?: unknown[]): Promise<void> {
  await conn.query(sql, params ?? []);
}

function ymdFromDb(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

/** 确保存在 member_activity 行并加行锁（供后续更新余额/免费计数） */
export async function ensureMemberActivityRowForLotteryConn(conn: PoolConnection, memberId: string): Promise<void> {
  const existing = await queryOneConn<{ id: string }>(
    conn,
    'SELECT id FROM member_activity WHERE member_id = ? LIMIT 1 FOR UPDATE',
    [memberId],
  );
  if (existing) return;
  await execConn(
    conn,
    `INSERT INTO member_activity (
      id, member_id, lottery_spin_balance, lottery_free_draws_used,
      remaining_points, accumulated_points, referral_count, referral_points, order_count,
      total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt,
      accumulated_profit, accumulated_profit_usdt,
      total_gift_ngn, total_gift_ghs, total_gift_usdt
    ) VALUES (UUID(), ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)`,
    [memberId],
  );
}

/**
 * Unified spin balance mutation — the ONLY way to change lottery_spin_balance.
 * Positive amount = grant, negative = consume.
 * Writes audit row to spin_credits and updates member_activity.lottery_spin_balance.
 */
export async function addSpinConn(
  conn: PoolConnection,
  memberId: string,
  amount: number,
  source: string,
): Promise<{ newBalance: number }> {
  const delta = Math.floor(Number(amount) || 0);
  if (delta === 0) return { newBalance: 0 };

  await ensureMemberActivityRowForLotteryConn(conn, memberId);

  if (delta < 0) {
    const [ur] = await conn.query(
      'UPDATE member_activity SET lottery_spin_balance = COALESCE(lottery_spin_balance, 0) + ?, updated_at = NOW(3) WHERE member_id = ? AND COALESCE(lottery_spin_balance, 0) >= ?',
      [delta, memberId, Math.abs(delta)],
    );
    const aff = Number((ur as { affectedRows?: number }).affectedRows ?? 0);
    if (aff !== 1) {
      throw new Error('INSUFFICIENT_SPIN_BALANCE');
    }
  } else {
    await conn.query(
      'UPDATE member_activity SET lottery_spin_balance = COALESCE(lottery_spin_balance, 0) + ?, updated_at = NOW(3) WHERE member_id = ?',
      [delta, memberId],
    );
  }

  await conn.query(
    'INSERT INTO spin_credits (id, member_id, amount, source, created_at) VALUES (UUID(), ?, ?, ?, NOW(3))',
    [memberId, delta, source],
  );

  const [balRows] = await conn.query(
    'SELECT COALESCE(lottery_spin_balance, 0) AS bal FROM member_activity WHERE member_id = ?',
    [memberId],
  );
  const newBalance = Math.max(0, Number((balRows as { bal?: number }[])[0]?.bal ?? 0));

  console.log(`[addSpin] member=${memberId} delta=${delta > 0 ? '+' : ''}${delta} source=${source} newBalance=${newBalance}`);

  return { newBalance };
}

export async function addSpin(
  memberId: string,
  amount: number,
  source: string,
): Promise<{ newBalance: number }> {
  const { withTransaction } = await import('../../database/index.js');
  return withTransaction((conn) => addSpinConn(conn, memberId, amount, source));
}

/** @deprecated Use {@link addSpinConn} for grants/consumes so spin_credits and balance stay in sync. */
export async function incrementLotterySpinBalanceConn(conn: PoolConnection, memberId: string, delta: number, source?: string): Promise<void> {
  const d = Math.floor(Number(delta) || 0);
  if (d <= 0) return;
  await ensureMemberActivityRowForLotteryConn(conn, memberId);
  await execConn(
    conn,
    'UPDATE member_activity SET lottery_spin_balance = COALESCE(lottery_spin_balance, 0) + ?, updated_at = NOW(3) WHERE member_id = ?',
    [d, memberId],
  );
  console.log(`[SpinCredit] member=${memberId} +${d} source=${source ?? 'unknown'} at=${new Date().toISOString()}`);
}

export type LotteryQuotaSnapshot = {
  freeDrawsUsed: number;
  balance: number;
};

/**
 * 按上海日历日同步「每日免费已用次数」：换日时根据当日 lottery_logs 条数与 daily_free 取 min 初始化。
 * @deprecated Lottery draw/quota no longer use daily free spins; kept for legacy callers.
 */
export async function syncLotteryQuotaDayAndLoadConn(
  conn: PoolConnection,
  memberId: string,
  todayYmd: string,
  dailyFree: number,
): Promise<LotteryQuotaSnapshot> {
  await ensureMemberActivityRowForLotteryConn(conn, memberId);
  const row = await queryOneConn<{
    lottery_quota_day: unknown;
    lottery_free_draws_used: number | null;
    lottery_spin_balance: number | string | null;
  }>(
    conn,
    'SELECT lottery_quota_day, lottery_free_draws_used, lottery_spin_balance FROM member_activity WHERE member_id = ? LIMIT 1 FOR UPDATE',
    [memberId],
  );
  const balance = Math.max(0, Math.floor(Number(row?.lottery_spin_balance ?? 0)));
  const storedDay = ymdFromDb(row?.lottery_quota_day);

  if (storedDay === todayYmd) {
    return {
      freeDrawsUsed: Math.max(0, Math.floor(Number(row?.lottery_free_draws_used ?? 0))),
      balance,
    };
  }

  const dayStart = `${todayYmd} 00:00:00`;
  const cntRow = await queryOneConn<{ c: number }>(
    conn,
    `SELECT COUNT(*) AS c FROM lottery_logs
     WHERE member_id = ?
       AND created_at >= ?
       AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [memberId, dayStart, dayStart],
  );
  const drawsToday = Math.max(0, Math.floor(Number(cntRow?.c ?? 0)));
  const cap = Math.max(0, Math.floor(Number(dailyFree) || 0));
  const freeUsed = Math.min(cap, drawsToday);

  await execConn(
    conn,
    `UPDATE member_activity SET lottery_quota_day = ?, lottery_free_draws_used = ?, updated_at = NOW(3) WHERE member_id = ?`,
    [todayYmd, freeUsed, memberId],
  );

  console.log(`[SpinQuotaSync] member=${memberId} dayChange ${storedDay}->${todayYmd} dailyFree=${dailyFree} drawsToday=${drawsToday} freeUsed=${freeUsed} balance=${balance}`);

  return { freeDrawsUsed: freeUsed, balance };
}
