/**
 * 抽奖系统数据访问层
 */
import type { PoolConnection } from 'mysql2/promise';
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import { randomUUID } from 'crypto';
import { getShanghaiDateString } from '../../lib/shanghaiTime.js';
import { incrementLotterySpinBalanceConn } from './spinBalanceAccount.js';

async function queryOneConn<T = unknown>(
  conn: PoolConnection,
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const [rows] = await conn.query(sql, params ?? []);
  const arr = rows as T[];
  return arr[0] ?? null;
}

/* ──────────── 奖品 ──────────── */

export interface LotteryPrize {
  id: string;
  tenant_id: string | null;
  name: string;
  type: 'points' | 'custom' | 'none';
  value: number;
  description: string | null;
  probability: number;
  /** 会员端公示占比；NULL 表示展示真实 probability；不参与抽奖权重 */
  display_probability: number | null;
  image_url: string | null;
  sort_order: number;
  enabled: boolean;
}

export async function listPrizes(tenantId: string | null): Promise<LotteryPrize[]> {
  return query<LotteryPrize>(
    'SELECT * FROM lottery_prizes WHERE (tenant_id IS NULL OR tenant_id = ?) ORDER BY sort_order ASC, created_at DESC',
    [tenantId]
  );
}

export async function listEnabledPrizes(tenantId: string | null): Promise<LotteryPrize[]> {
  return query<LotteryPrize>(
    'SELECT * FROM lottery_prizes WHERE (tenant_id IS NULL OR tenant_id = ?) AND enabled = 1 ORDER BY sort_order ASC',
    [tenantId]
  );
}

export async function upsertPrizes(tenantId: string | null, prizes: Omit<LotteryPrize, 'enabled'>[]): Promise<void> {
  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM lottery_prizes WHERE tenant_id <=> ?', [tenantId]);
    for (const p of prizes) {
      const disp =
        p.display_probability == null || !Number.isFinite(Number(p.display_probability))
          ? null
          : Number(p.display_probability);
      await conn.query(
        `INSERT INTO lottery_prizes (id, tenant_id, name, type, value, description, probability, display_probability, image_url, sort_order, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          p.id || randomUUID(),
          tenantId,
          p.name,
          p.type,
          p.value || 0,
          p.description || null,
          p.probability,
          disp,
          p.image_url || null,
          p.sort_order || 0,
        ],
      );
    }
  });
}

/* ──────────── 抽奖记录 ──────────── */

export interface LotteryLog {
  id: string;
  member_id: string;
  prize_name: string;
  prize_type: string;
  prize_value: number;
  created_at: string;
}

export async function insertLotteryLog(
  memberId: string, tenantId: string | null,
  prizeId: string | null, prizeName: string, prizeType: string, prizeValue: number
): Promise<string> {
  const id = randomUUID();
  await execute(
    `INSERT INTO lottery_logs (id, member_id, tenant_id, prize_id, prize_name, prize_type, prize_value)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, memberId, tenantId, prizeId, prizeName, prizeType, prizeValue]
  );
  return id;
}

export async function countLotteryLogsForMember(memberId: string): Promise<number> {
  const r = await queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM lottery_logs WHERE member_id = ?',
    [memberId],
  );
  return r?.cnt ?? 0;
}

export async function listLotteryLogs(memberId: string, limit = 50, offset = 0): Promise<LotteryLog[]> {
  const lim = Math.min(500, Math.max(1, limit));
  const off = Math.max(0, offset);
  return query<LotteryLog>(
    'SELECT id, member_id, prize_name, prize_type, prize_value, created_at FROM lottery_logs WHERE member_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [memberId, lim, off],
  );
}

export async function countAllLotteryLogs(tenantId: string | null): Promise<number> {
  const r = await queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM lottery_logs WHERE tenant_id <=> ?',
    [tenantId],
  );
  return r?.cnt ?? 0;
}

export type LotteryLogAdminRow = LotteryLog & {
  phone_number?: string | null;
  nickname?: string | null;
  member_code?: string | null;
};

export async function listAllLotteryLogs(tenantId: string | null, limit = 100, offset = 0): Promise<LotteryLogAdminRow[]> {
  const lim = Math.min(2000, Math.max(1, limit));
  const off = Math.max(0, offset);
  return query<LotteryLogAdminRow>(
    `SELECT l.id, l.member_id, l.tenant_id, l.prize_id, l.prize_name, l.prize_type, l.prize_value, l.created_at,
            m.phone_number AS phone_number,
            NULLIF(TRIM(m.nickname), '') AS nickname,
            NULLIF(TRIM(m.member_code), '') AS member_code
     FROM lottery_logs l
     LEFT JOIN members m ON m.id = l.member_id
     WHERE l.tenant_id <=> ?
     ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    [tenantId, lim, off],
  );
}

/* ──────────── 积分流水 ──────────── */

export async function insertPointsLog(
  memberId: string, tenantId: string | null,
  change: number, type: string, category: string, remark: string | null
): Promise<void> {
  await execute(
    'INSERT INTO points_log (id, member_id, tenant_id, `change`, type, category, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), memberId, tenantId, change, type, category, remark]
  );
}

/* ──────────── member_activity online_points ──────────── */

export async function addOnlinePoints(memberId: string, points: number): Promise<void> {
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM member_activity WHERE member_id = ?', [memberId]
  );
  if (existing) {
    await execute(
      'UPDATE member_activity SET online_points = online_points + ?, updated_at = NOW() WHERE member_id = ?',
      [points, memberId]
    );
  } else {
    await execute(
      'INSERT INTO member_activity (id, member_id, online_points) VALUES (UUID(), ?, ?)',
      [memberId, points]
    );
  }
}

/* ──────────── 抽奖次数控制 ──────────── */

export async function getSpinsUsedToday(memberId: string): Promise<number> {
  const today = getShanghaiDateString();
  const dayStart = `${today} 00:00:00`;
  const r = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM lottery_logs
     WHERE member_id = ?
       AND created_at >= ?
       AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [memberId, dayStart, dayStart]
  );
  return r?.cnt ?? 0;
}

/**
 * 每日免费次数：优先 `lottery_settings`（抽奖后台已配置过则以此为准）；
 * 若无行则回退 `member_portal_settings.daily_free_spins_per_day`，再默认 1。
 */
export async function getEffectiveDailyFreeSpins(tenantId: string | null): Promise<number> {
  const lotteryRow = await queryOne<{ daily_free_spins: number }>(
    'SELECT daily_free_spins FROM lottery_settings WHERE tenant_id <=> ?',
    [tenantId],
  );
  if (lotteryRow != null) {
    return Math.max(0, Number(lotteryRow.daily_free_spins ?? 0));
  }
  if (!tenantId) return 1;
  const portalRow = await queryOne<{ daily_free_spins_per_day: number }>(
    'SELECT daily_free_spins_per_day FROM member_portal_settings WHERE tenant_id = ? LIMIT 1',
    [tenantId],
  );
  const portal = Math.max(0, Number(portalRow?.daily_free_spins_per_day ?? 0));
  return portal > 0 ? portal : 1;
}

/** 事务内与 getEffectiveDailyFreeSpins 逻辑一致 */
export async function getEffectiveDailyFreeSpinsConn(
  conn: PoolConnection,
  tenantId: string | null,
): Promise<number> {
  const lotteryRow = await queryOneConn<{ daily_free_spins: number }>(
    conn,
    'SELECT daily_free_spins FROM lottery_settings WHERE tenant_id <=> ?',
    [tenantId],
  );
  if (lotteryRow != null) {
    return Math.max(0, Number(lotteryRow.daily_free_spins ?? 0));
  }
  if (!tenantId) return 1;
  const portalRow = await queryOneConn<{ daily_free_spins_per_day: number }>(
    conn,
    'SELECT daily_free_spins_per_day FROM member_portal_settings WHERE tenant_id = ? LIMIT 1',
    [tenantId],
  );
  const portal = Math.max(0, Number(portalRow?.daily_free_spins_per_day ?? 0));
  return portal > 0 ? portal : 1;
}

/** @deprecated 请使用 getEffectiveDailyFreeSpins */
export async function getDailyFreeSpins(tenantId: string | null): Promise<number> {
  return getEffectiveDailyFreeSpins(tenantId);
}

export async function getSpinCredits(memberId: string): Promise<number> {
  const r = await queryOne<{ total: number }>(
    'SELECT COALESCE(SUM(amount),0) as total FROM spin_credits WHERE member_id = ?',
    [memberId]
  );
  return r?.total ?? 0;
}

export type LotterySettingsRow = {
  daily_free_spins: number;
  enabled: number;
  probability_notice: string | null;
  order_completed_spin_enabled: number;
  order_completed_spin_amount: number;
};

export async function getLotterySettings(tenantId: string | null) {
  return queryOne<LotterySettingsRow>(
    `SELECT daily_free_spins, enabled, probability_notice,
            COALESCE(order_completed_spin_enabled, 0) AS order_completed_spin_enabled,
            COALESCE(order_completed_spin_amount, 1) AS order_completed_spin_amount
     FROM lottery_settings WHERE tenant_id <=> ?`,
    [tenantId],
  );
}

export async function upsertLotterySettings(
  tenantId: string | null,
  dailyFreeSpins: number,
  enabled: boolean,
  probabilityNotice?: string | null,
  orderSpin?: { enabled: boolean; amount: number } | undefined,
): Promise<void> {
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM lottery_settings WHERE tenant_id <=> ?', [tenantId]
  );
  const noticeVal =
    probabilityNotice === undefined
      ? undefined
      : probabilityNotice == null || String(probabilityNotice).trim() === ''
        ? null
        : String(probabilityNotice).trim();
  if (existing) {
    const sets: string[] = ['daily_free_spins = ?', 'enabled = ?'];
    const vals: unknown[] = [dailyFreeSpins, enabled ? 1 : 0];
    if (noticeVal !== undefined) {
      sets.push('probability_notice = ?');
      vals.push(noticeVal);
    }
    if (orderSpin !== undefined) {
      sets.push('order_completed_spin_enabled = ?', 'order_completed_spin_amount = ?');
      vals.push(orderSpin.enabled ? 1 : 0, Math.max(0, Math.floor(Number(orderSpin.amount) || 0)));
    }
    vals.push(tenantId);
    await execute(`UPDATE lottery_settings SET ${sets.join(', ')} WHERE tenant_id <=> ?`, vals);
  } else {
    const ocEn = orderSpin !== undefined ? (orderSpin.enabled ? 1 : 0) : 0;
    const ocAmt =
      orderSpin !== undefined ? Math.max(0, Math.floor(Number(orderSpin.amount) || 0)) : 1;
    await execute(
      `INSERT INTO lottery_settings (id, tenant_id, daily_free_spins, enabled, probability_notice, order_completed_spin_enabled, order_completed_spin_amount)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        dailyFreeSpins,
        enabled ? 1 : 0,
        noticeVal === undefined ? null : noticeVal,
        ocEn,
        ocAmt,
      ],
    );
  }
}

/** 订单首次变为 completed 时调用；按租户抽奖设置写入 spin_credits，source 含 orderId 防重复 */
export async function grantOrderCompletedSpinCredits(args: {
  orderId: string;
  memberId: string | null;
  tenantId: string | null;
}): Promise<{ granted: boolean; amount: number }> {
  const memberId = args.memberId != null ? String(args.memberId).trim() : '';
  if (!memberId) return { granted: false, amount: 0 };

  const settings = await getLotterySettings(args.tenantId);
  if (!settings || Number(settings.order_completed_spin_enabled) !== 1) return { granted: false, amount: 0 };
  const amount = Math.max(0, Math.floor(Number(settings.order_completed_spin_amount) || 0));
  if (amount <= 0) return { granted: false, amount: 0 };

  const source = `order_completed:${args.orderId}`;
  return withTransaction(async (conn) => {
    const dup = await queryOneConn<{ id: string }>(
      conn,
      'SELECT id FROM spin_credits WHERE source = ? LIMIT 1',
      [source],
    );
    if (dup) return { granted: false, amount: 0 };

    await conn.query(
      'INSERT INTO spin_credits (id, member_id, amount, source, created_at) VALUES (UUID(), ?, ?, ?, NOW(3))',
      [memberId, amount, source],
    );
    await incrementLotterySpinBalanceConn(conn, memberId, amount);
    return { granted: true, amount };
  });
}

/* ──────────── 会员 tenant 查询 ──────────── */

export async function getMemberTenantId(memberId: string): Promise<string | null> {
  const r = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
  return r?.tenant_id ?? null;
}
