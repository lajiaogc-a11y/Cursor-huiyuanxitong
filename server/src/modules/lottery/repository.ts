/**
 * 抽奖系统数据访问层
 */
import type { PoolConnection } from 'mysql2/promise';
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import { randomUUID } from 'crypto';
import { getShanghaiDateString } from '../../lib/shanghaiTime.js';
import { addSpinConn } from './spinBalanceAccount.js';

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
  stock_total: number;
  stock_used: number;
  stock_enabled: number;
  daily_stock_limit: number;
  prize_cost: number;
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

export async function upsertPrizes(tenantId: string | null, prizes: (LotteryPrize & { enabled?: boolean | number })[]): Promise<void> {
  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM lottery_prizes WHERE tenant_id <=> ?', [tenantId]);
    for (const p of prizes) {
      const disp =
        p.display_probability == null || !Number.isFinite(Number(p.display_probability))
          ? null
          : Math.max(0, Number(p.display_probability));
      const stockEnabled = (p as any).stock_enabled ? 1 : 0;
      const stockTotal = Number.isFinite(Number((p as any).stock_total)) ? Math.floor(Number((p as any).stock_total)) : -1;
      const dailyStockLimit = Number.isFinite(Number((p as any).daily_stock_limit)) ? Math.floor(Number((p as any).daily_stock_limit)) : -1;
      const explicitCost = Number((p as any).prize_cost);
      const prizeCost = Number.isFinite(explicitCost) && explicitCost > 0
        ? explicitCost
        : p.type === 'points' ? Math.max(0, Number(p.value) || 0) : 0;
      const prizeEnabled =
        (p as { enabled?: boolean }).enabled === false || (p as { enabled?: unknown }).enabled === 0 ? 0 : 1;
      await conn.query(
        `INSERT INTO lottery_prizes
           (id, tenant_id, name, type, value, description, probability, display_probability,
            image_url, sort_order, enabled, prize_cost, stock_enabled, stock_total, daily_stock_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          prizeEnabled,
          prizeCost,
          stockEnabled,
          stockTotal,
          dailyStockLimit,
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
  reward_points?: number;
  created_at: string;
  request_id?: string | null;
  reward_status?: string;
  reward_type?: string;
  prize_cost?: number;
  retry_count?: number;
  fail_reason?: string | null;
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
    'SELECT id, member_id, prize_name, prize_type, prize_value, reward_status, reward_type, fail_reason, created_at FROM lottery_logs WHERE member_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [memberId, lim, off],
  );
}

export type LotteryLogsAdminFilter = {
  phone?: string;
  memberCode?: string;
};

function lotteryLogsMemberFilterSql(opts?: LotteryLogsAdminFilter): { clause: string; params: unknown[] } {
  const p = opts?.phone?.trim();
  const m = opts?.memberCode?.trim();
  if (!p && !m) return { clause: '', params: [] };
  const parts: string[] = [];
  const params: unknown[] = [];
  if (p) {
    parts.push('m.phone_number LIKE ?');
    params.push(`%${p}%`);
  }
  if (m) {
    parts.push('(m.member_code LIKE ? OR CAST(m.id AS CHAR) LIKE ?)');
    params.push(`%${m}%`, `%${m}%`);
  }
  return { clause: ` AND (${parts.join(' AND ')})`, params };
}

export async function countAllLotteryLogs(tenantId: string | null, opts?: LotteryLogsAdminFilter): Promise<number> {
  const { clause, params } = lotteryLogsMemberFilterSql(opts);
  const r = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt
     FROM lottery_logs l
     LEFT JOIN members m ON m.id = l.member_id
     WHERE l.tenant_id <=> ?${clause}`,
    [tenantId, ...params],
  );
  return r?.cnt ?? 0;
}

export type LotteryLogAdminRow = LotteryLog & {
  phone_number?: string | null;
  nickname?: string | null;
  member_code?: string | null;
};

export async function listAllLotteryLogs(
  tenantId: string | null,
  limit = 100,
  offset = 0,
  opts?: LotteryLogsAdminFilter,
): Promise<LotteryLogAdminRow[]> {
  const lim = Math.min(2000, Math.max(1, limit));
  const off = Math.max(0, offset);
  const { clause, params } = lotteryLogsMemberFilterSql(opts);
  return query<LotteryLogAdminRow>(
    `SELECT l.id, l.member_id, l.tenant_id, l.prize_id, l.prize_name, l.prize_type, l.prize_value,
            COALESCE(l.reward_points, 0) AS reward_points, l.created_at,
            COALESCE(l.reward_status, 'done') AS reward_status,
            COALESCE(l.reward_type, 'auto') AS reward_type,
            COALESCE(l.prize_cost, 0) AS prize_cost,
            COALESCE(l.retry_count, 0) AS retry_count,
            l.fail_reason,
            m.phone_number AS phone_number,
            NULLIF(TRIM(m.nickname), '') AS nickname,
            NULLIF(TRIM(m.member_code), '') AS member_code
     FROM lottery_logs l
     LEFT JOIN members m ON m.id = l.member_id
     WHERE l.tenant_id <=> ?${clause}
     ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    [tenantId, ...params, lim, off],
  );
}

/* ──────────── 积分流水 ──────────── */

/**
 * Transaction-scoped variant — use inside an existing transaction.
 * @deprecated Prefer syncPointsLog() from pointsService for all new code.
 */
export async function insertPointsLogConn(
  conn: PoolConnection,
  memberId: string, tenantId: string | null,
  change: number, type: string, category: string, remark: string | null,
): Promise<void> {
  await conn.query(
    'INSERT INTO points_log (id, member_id, tenant_id, `change`, type, category, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), memberId, tenantId, change, type, category, remark],
  );
}

/**
 * Standalone variant — single INSERT, already atomic.
 * @deprecated Prefer syncPointsLog() from pointsService for all new code.
 */
export async function insertPointsLog(
  memberId: string, tenantId: string | null,
  change: number, type: string, category: string, remark: string | null,
): Promise<void> {
  await execute(
    'INSERT INTO points_log (id, member_id, tenant_id, `change`, type, category, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), memberId, tenantId, change, type, category, remark],
  );
}

/* ──────────── member_activity online_points ──────────── */

/**
 * Transaction-scoped variant — use when caller already holds a PoolConnection.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE on the unique index `uniq_ma_member`
 * for an atomic upsert, eliminating the old TOCTOU race condition.
 * @deprecated Prefer addPoints() from pointsService for all new code.
 */
export async function addOnlinePointsConn(conn: PoolConnection, memberId: string, points: number): Promise<void> {
  await conn.query(
    `INSERT INTO member_activity (id, member_id, online_points, updated_at)
     VALUES (UUID(), ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE online_points = online_points + VALUES(online_points), updated_at = NOW(3)`,
    [memberId, points],
  );
}

/**
 * Standalone variant — wraps itself in a transaction.
 * @deprecated Prefer addPoints() from pointsService for all new code.
 */
export async function addOnlinePoints(memberId: string, points: number): Promise<void> {
  await withTransaction(async (conn) => {
    await addOnlinePointsConn(conn, memberId, points);
  });
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
 * Effective daily free spins: prefer `lottery_settings` (authoritative when row exists);
 * fall back to `member_portal_settings.daily_free_spins_per_day`; default 0 (not 1)
 * so tenants that never configured lottery don't silently gift free spins.
 * @deprecated No longer used by lottery `draw()` / `getQuota()`; settings row still used elsewhere (budget, RTP, enabled).
 */
export async function getEffectiveDailyFreeSpins(tenantId: string | null): Promise<number> {
  const lotteryRow = await queryOne<{ daily_free_spins: number }>(
    'SELECT daily_free_spins FROM lottery_settings WHERE tenant_id <=> ?',
    [tenantId],
  );
  if (lotteryRow != null) {
    return Math.max(0, Number(lotteryRow.daily_free_spins ?? 0));
  }
  if (!tenantId) return 0;
  const portalRow = await queryOne<{ daily_free_spins_per_day: number }>(
    'SELECT daily_free_spins_per_day FROM member_portal_settings WHERE tenant_id = ? LIMIT 1',
    [tenantId],
  );
  return Math.max(0, Number(portalRow?.daily_free_spins_per_day ?? 0));
}

/** Transaction-scoped variant of getEffectiveDailyFreeSpins
 * @deprecated No longer used by lottery `draw()` / `getQuota()`.
 */
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
  if (!tenantId) return 0;
  const portalRow = await queryOneConn<{ daily_free_spins_per_day: number }>(
    conn,
    'SELECT daily_free_spins_per_day FROM member_portal_settings WHERE tenant_id = ? LIMIT 1',
    [tenantId],
  );
  return Math.max(0, Number(portalRow?.daily_free_spins_per_day ?? 0));
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

export type BudgetPolicyValue = 'deny' | 'downgrade' | 'fallback';

export type LotterySettingsRow = {
  daily_free_spins: number;
  enabled: number;
  probability_notice: string | null;
  order_completed_spin_enabled: number;
  order_completed_spin_amount: number;
  daily_reward_budget: number;
  daily_reward_used: number;
  daily_reward_reset_date: string | null;
  target_rtp: number;
  risk_control_enabled: number;
  budget_policy: BudgetPolicyValue;
  risk_account_daily_limit: number;
  risk_account_burst_limit: number;
  risk_ip_daily_limit: number;
  risk_ip_burst_limit: number;
  risk_high_score_threshold: number;
};

export async function getLotterySettings(tenantId: string | null) {
  return queryOne<LotterySettingsRow>(
    `SELECT daily_free_spins, enabled, probability_notice,
            COALESCE(order_completed_spin_enabled, 0) AS order_completed_spin_enabled,
            COALESCE(order_completed_spin_amount, 1) AS order_completed_spin_amount,
            COALESCE(daily_reward_budget, 0) AS daily_reward_budget,
            COALESCE(daily_reward_used, 0) AS daily_reward_used,
            daily_reward_reset_date,
            COALESCE(target_rtp, 0) AS target_rtp,
            COALESCE(risk_control_enabled, 0) AS risk_control_enabled,
            COALESCE(budget_policy, 'downgrade') AS budget_policy,
            COALESCE(risk_account_daily_limit, 0) AS risk_account_daily_limit,
            COALESCE(risk_account_burst_limit, 0) AS risk_account_burst_limit,
            COALESCE(risk_ip_daily_limit, 0) AS risk_ip_daily_limit,
            COALESCE(risk_ip_burst_limit, 0) AS risk_ip_burst_limit,
            COALESCE(risk_high_score_threshold, 0) AS risk_high_score_threshold
     FROM lottery_settings WHERE tenant_id <=> ?`,
    [tenantId],
  );
}

export interface BudgetSettingsPatch {
  daily_reward_budget?: number;
  target_rtp?: number;
  budget_policy?: BudgetPolicyValue;
  risk_control_enabled?: boolean;
  risk_account_daily_limit?: number;
  risk_account_burst_limit?: number;
  risk_ip_daily_limit?: number;
  risk_ip_burst_limit?: number;
  risk_high_score_threshold?: number;
}

export async function upsertLotterySettings(
  tenantId: string | null,
  dailyFreeSpins: number,
  enabled: boolean,
  probabilityNotice?: string | null,
  orderSpin?: { enabled: boolean; amount: number } | undefined,
  budgetPatch?: BudgetSettingsPatch,
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

  const validPolicy = (v: unknown): BudgetPolicyValue => {
    const s = String(v ?? '').trim().toLowerCase();
    if (s === 'deny' || s === 'fallback') return s;
    return 'downgrade';
  };

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
    if (budgetPatch) {
      if (budgetPatch.daily_reward_budget !== undefined) {
        sets.push('daily_reward_budget = ?');
        vals.push(Math.max(0, Number(budgetPatch.daily_reward_budget) || 0));
      }
      if (budgetPatch.target_rtp !== undefined) {
        sets.push('target_rtp = ?');
        vals.push(Math.max(0, Math.min(100, Number(budgetPatch.target_rtp) || 0)));
      }
      if (budgetPatch.budget_policy !== undefined) {
        sets.push('budget_policy = ?');
        vals.push(validPolicy(budgetPatch.budget_policy));
      }
      if (budgetPatch.risk_control_enabled !== undefined) {
        sets.push('risk_control_enabled = ?');
        vals.push(budgetPatch.risk_control_enabled ? 1 : 0);
      }
      if (budgetPatch.risk_account_daily_limit !== undefined) {
        sets.push('risk_account_daily_limit = ?');
        vals.push(Math.max(0, Math.floor(Number(budgetPatch.risk_account_daily_limit) || 0)));
      }
      if (budgetPatch.risk_account_burst_limit !== undefined) {
        sets.push('risk_account_burst_limit = ?');
        vals.push(Math.max(0, Math.floor(Number(budgetPatch.risk_account_burst_limit) || 0)));
      }
      if (budgetPatch.risk_ip_daily_limit !== undefined) {
        sets.push('risk_ip_daily_limit = ?');
        vals.push(Math.max(0, Math.floor(Number(budgetPatch.risk_ip_daily_limit) || 0)));
      }
      if (budgetPatch.risk_ip_burst_limit !== undefined) {
        sets.push('risk_ip_burst_limit = ?');
        vals.push(Math.max(0, Math.floor(Number(budgetPatch.risk_ip_burst_limit) || 0)));
      }
      if (budgetPatch.risk_high_score_threshold !== undefined) {
        sets.push('risk_high_score_threshold = ?');
        vals.push(Math.max(0, Math.floor(Number(budgetPatch.risk_high_score_threshold) || 0)));
      }
    }
    vals.push(tenantId);
    await execute(`UPDATE lottery_settings SET ${sets.join(', ')} WHERE tenant_id <=> ?`, vals);
  } else {
    const ocEn = orderSpin !== undefined ? (orderSpin.enabled ? 1 : 0) : 0;
    const ocAmt =
      orderSpin !== undefined ? Math.max(0, Math.floor(Number(orderSpin.amount) || 0)) : 1;
    const budgetVal = Math.max(0, Number(budgetPatch?.daily_reward_budget) || 0);
    const rtpVal = Math.max(0, Math.min(100, Number(budgetPatch?.target_rtp) || 0));
    const policyVal = validPolicy(budgetPatch?.budget_policy);
    const riskVal = budgetPatch?.risk_control_enabled ? 1 : 0;
    const riskAccDaily = Math.max(0, Math.floor(Number(budgetPatch?.risk_account_daily_limit) || 0));
    const riskAccBurst = Math.max(0, Math.floor(Number(budgetPatch?.risk_account_burst_limit) || 0));
    const riskIpDaily = Math.max(0, Math.floor(Number(budgetPatch?.risk_ip_daily_limit) || 0));
    const riskIpBurst = Math.max(0, Math.floor(Number(budgetPatch?.risk_ip_burst_limit) || 0));
    const riskThreshold = Math.max(0, Math.floor(Number(budgetPatch?.risk_high_score_threshold) || 0));
    await execute(
      `INSERT INTO lottery_settings (id, tenant_id, daily_free_spins, enabled, probability_notice,
                                      order_completed_spin_enabled, order_completed_spin_amount,
                                      daily_reward_budget, target_rtp, budget_policy, risk_control_enabled,
                                      risk_account_daily_limit, risk_account_burst_limit,
                                      risk_ip_daily_limit, risk_ip_burst_limit, risk_high_score_threshold)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        dailyFreeSpins,
        enabled ? 1 : 0,
        noticeVal === undefined ? null : noticeVal,
        ocEn,
        ocAmt,
        budgetVal,
        rtpVal,
        policyVal,
        riskVal,
        riskAccDaily,
        riskAccBurst,
        riskIpDaily,
        riskIpBurst,
        riskThreshold,
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

    await addSpinConn(conn, memberId, amount, source);
    return { granted: true, amount };
  });
}

/* ──────────── 会员 tenant 查询 ──────────── */

export async function getMemberTenantId(memberId: string): Promise<string | null> {
  const r = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
  return r?.tenant_id ?? null;
}

/** 与 lottery_settings 同步时更新门户侧每日免费次数展示 */
export async function updateMemberPortalDailyFreeSpinsPerDay(tenantId: string, dailyFreeSpins: number): Promise<void> {
  await execute(
    'UPDATE member_portal_settings SET daily_free_spins_per_day = ? WHERE tenant_id = ?',
    [dailyFreeSpins, tenantId],
  );
}

export type LotteryOperationalTodayStatsRow = {
  draws_today: number;
  cost_today: number;
  winners_today: number;
  points_awarded_today: number;
};

export async function getLotteryOperationalTodayStats(
  tenantId: string | null,
  dayStart: string,
): Promise<LotteryOperationalTodayStatsRow | null> {
  return queryOne<LotteryOperationalTodayStatsRow>(
    `SELECT
         COUNT(*) AS draws_today,
         COALESCE(SUM(CASE WHEN prize_type <> 'none' AND reward_status = 'done' THEN COALESCE(prize_cost, 0) ELSE 0 END), 0) AS cost_today,
         SUM(CASE WHEN prize_type <> 'none' THEN 1 ELSE 0 END) AS winners_today,
         COALESCE(SUM(CASE WHEN prize_type = 'points' AND reward_status = 'done' THEN prize_value ELSE 0 END), 0) AS points_awarded_today
       FROM lottery_logs
       WHERE tenant_id <=> ?
         AND created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [tenantId, dayStart, dayStart],
  );
}

export type LotteryOperationalRiskStatsRow = {
  risk_blocked: number;
  risk_downgraded: number;
  failed_rewards: number;
  pending_rewards: number;
};

export async function getLotteryOperationalRiskStats(
  tenantId: string | null,
  dayStart: string,
): Promise<LotteryOperationalRiskStatsRow | null> {
  return queryOne<LotteryOperationalRiskStatsRow>(
    `SELECT
         SUM(CASE WHEN client_ip IS NOT NULL AND prize_type = 'none' AND created_at >= ? THEN 0 ELSE 0 END) AS risk_blocked,
         0 AS risk_downgraded,
         SUM(CASE WHEN reward_status = 'failed' THEN 1 ELSE 0 END) AS failed_rewards,
         SUM(CASE WHEN reward_status = 'pending' THEN 1 ELSE 0 END) AS pending_rewards
       FROM lottery_logs
       WHERE tenant_id <=> ?`,
    [dayStart, tenantId],
  );
}

export async function countLotteryRiskBlockedToday(
  tenantId: string | null,
  dayStart: string,
): Promise<number> {
  const row = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM lottery_logs
     WHERE tenant_id <=> ?
       AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND fail_reason LIKE '%RISK%'`,
    [tenantId, dayStart, dayStart],
  );
  return row?.cnt ?? 0;
}
