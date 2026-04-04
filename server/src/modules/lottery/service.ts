/**
 * 抽奖系统核心业务逻辑（事务保护版 — Phase 1 ~ Phase 4）
 *
 * Phase 1：幂等、库存、reward_status 追踪
 * Phase 2：预算 / 返奖率控制
 * Phase 3：风控最小版
 * Phase 4：统一中奖副作用落库
 *   - lottery_logs 增加 prize_cost / reward_type，形成完整审计链路
 *   - 奖励发放抽取为独立的 fulfillRewardOnConn()，可被补偿任务复用
 *   - reward_type 分类：auto(积分自动发) / manual(custom 需人工) / none(无需发放)
 *   - custom 奖品不再静默标记 done，而是保留 pending 等待人工确认
 *   - 补偿任务可读取 failed 记录并重试
 *
 * 不变项：事务边界、MySQL GET_LOCK 用户锁、加权随机算法（prizePick.ts）。
 */
import { withTransaction } from '../../database/index.js';
import { randomUUID } from 'crypto';
import type { PoolConnection } from 'mysql2/promise';
import type { ResultSetHeader } from 'mysql2';
import { buildMysqlUserLockName, mysqlGetLock, mysqlReleaseLock } from '../../lib/mysqlUserLock.js';
import { addPoints } from '../points/pointsService.js';
import { getEffectiveDailyFreeSpinsConn, getLotterySettings, listEnabledPrizes } from './repository.js';
import { pickLotteryPrizeByConfiguredProbability, budgetAwarePrizePick, type BudgetPolicy } from './prizePick.js';
import { getShanghaiDateString } from '../../lib/shanghaiTime.js';
import { syncLotteryQuotaDayAndLoadConn } from './spinBalanceAccount.js';
import { evaluateDrawRisk, loadRiskThresholds, recordDrawBurst, type RiskResult } from './riskControl.js';

// ── 内存防抖（仍保留作为热路径快速拦截，DB UNIQUE INDEX 是真正保障）──
const recentDraws = new Map<string, number>();
const DRAW_IDEMPOTENCY_WINDOW_MS = 2000;
const _drawGcTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentDraws) {
    if (now - ts > DRAW_IDEMPOTENCY_WINDOW_MS * 3) recentDraws.delete(key);
  }
}, 10_000);
if (typeof process !== 'undefined') process.once?.('beforeExit', () => clearInterval(_drawGcTimer));

export interface DrawResult {
  success: boolean;
  prize?: {
    id: string;
    name: string;
    type: string;
    value: number;
    description: string | null;
  };
  remaining?: number;
  error?: string;
  /** Phase 1: 奖励发放状态 */
  reward_status?: 'pending' | 'done' | 'failed';
  /** Phase 1: 失败原因（仅 reward_status=failed） */
  fail_reason?: string;
  /** 实际到账积分（以此为准，不要用 prize.value） */
  reward_points?: number;
  /** 发放后余额快照 */
  balance_after?: number | null;
  /** Phase 2: 预算/RTP 警告码（抽奖成功时可附带，表示结果受到预算约束） */
  budget_warning?: 'BUDGET_EXCEEDED' | 'BUDGET_LOW' | 'RTP_LIMIT_REACHED';
  /** Phase 3: 风控降级标记（结果被强制保底） */
  risk_downgraded?: boolean;
  /** 幂等重放标记（request_id 已存在时返回原始结果） */
  idempotent_replay?: boolean;
}

/** Phase 3: draw() 扩展参数 */
export interface DrawOptions {
  requestId?: string;
  clientIp?: string | null;
  deviceFingerprint?: string | null;
}

interface LotteryPrize {
  id: string;
  name: string;
  type: 'points' | 'custom' | 'none';
  value: number;
  description: string | null;
  probability: number;
  stock_enabled?: number;
  stock_total?: number;
  stock_used?: number;
  daily_stock_limit?: number;
  prize_cost?: number;
}

async function queryConn<T = any>(conn: PoolConnection, sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await conn.query(sql, params ?? []);
  return rows as T[];
}

async function queryOneConn<T = any>(conn: PoolConnection, sql: string, params?: any[]): Promise<T | null> {
  const rows = await queryConn<T>(conn, sql, params);
  return rows[0] ?? null;
}

async function execConn(conn: PoolConnection, sql: string, params?: any[]): Promise<void> {
  await conn.query(sql, params ?? []);
}

/**
 * 核心抽奖流程 — 全部在单个数据库事务内完成：
 *  1. 幂等检查（request_id DB 唯一索引）
 *  2. 加载租户 + 全局开关
 *  3. 每日预算自动重置 + RTP 有效预算计算
 *  4. deny 策略前置拦截 / RTP 前置拦截
 *  5. 次数配额
 *  6. 获取奖品 → 预算感知抽奖 (budgetAwarePrizePick)
 *  7. 库存原子扣减
 *  8. 扣减配额
 *  9. 写抽奖日志 reward_status='pending'
 * 10. 积分类奖品发放 → 更新 reward_status
 * 11. 事务内更新 daily_reward_used
 * 12. 提交事务
 */
export async function draw(memberId: string, requestIdOrOpts?: string | DrawOptions): Promise<DrawResult> {
  const opts: DrawOptions = typeof requestIdOrOpts === 'string'
    ? { requestId: requestIdOrOpts }
    : requestIdOrOpts ?? {};
  const { requestId, clientIp, deviceFingerprint } = opts;

  // 快速内存防抖（非幂等保障，仅优化热路径）
  if (!requestId) {
    const lastOk = recentDraws.get(memberId);
    if (lastOk && Date.now() - lastOk < DRAW_IDEMPOTENCY_WINDOW_MS) {
      return { success: false, error: 'DUPLICATE_REQUEST' };
    }
  }

  // ── Phase 3: 风控前置评估（在事务之外，不持锁） ──
  let riskResult: RiskResult | null = null;
  try {
    const { queryOne: qo } = await import('../../database/index.js');
    const memberTenantRow = await qo<{ tenant_id: string | null }>(
      'SELECT tenant_id FROM members WHERE id = ?', [memberId],
    );
    const preflightTenantId = memberTenantRow?.tenant_id ?? null;
    const thresholds = await loadRiskThresholds(preflightTenantId);
    if (thresholds.enabled) {
      riskResult = await evaluateDrawRisk(
        { memberId, tenantId: preflightTenantId, clientIp: clientIp ?? null, deviceFingerprint: deviceFingerprint ?? null },
        thresholds,
      );
      if (riskResult.verdict === 'block') {
        return { success: false, error: 'RISK_BLOCKED' };
      }
    }
  } catch (e) {
    console.error('[lottery/riskControl] preflight error (non-fatal):', e);
  }
  const riskDowngrade = riskResult?.verdict === 'downgrade';

  const result = await withTransaction(async (conn) => {
    const drawLock = buildMysqlUserLockName('lottery_draw', memberId);
    const gotDrawLock = await mysqlGetLock(conn, drawLock, 8);
    if (!gotDrawLock) {
      return { success: false, error: 'DUPLICATE_REQUEST' as const };
    }
    try {

    // ── 1. request_id 幂等（DB 级别）：重复请求返回 success: true + 原始结果 ──
    if (requestId) {
      const dup = await queryOneConn<{
        id: string; prize_name: string; prize_type: string; prize_value: number;
        reward_status: string | null; reward_points: number | null; fail_reason: string | null;
      }>(
        conn,
        `SELECT id, prize_name, prize_type, prize_value, reward_status,
                COALESCE(reward_points, 0) AS reward_points, fail_reason
         FROM lottery_logs WHERE request_id = ? LIMIT 1`,
        [requestId],
      );
      if (dup) {
        const quotaRow = await queryOneConn<{ remaining: number }>(
          conn,
          `SELECT COALESCE(lottery_spin_balance, 0) AS remaining
           FROM member_activity WHERE member_id = ?`,
          [memberId],
        );
        return {
          success: true,
          prize: { id: dup.id, name: dup.prize_name, type: dup.prize_type, value: dup.prize_value, description: null },
          remaining: quotaRow?.remaining ?? 0,
          reward_status: (dup.reward_status as DrawResult['reward_status']) ?? 'done',
          reward_points: Number(dup.reward_points ?? 0),
          idempotent_replay: true,
        };
      }
    }

    // ── 2. 租户 + 全局开关 + 预算 / RTP 设置 ──
    const memberRow = await queryOneConn<{ tenant_id: string | null }>(
      conn, 'SELECT tenant_id FROM members WHERE id = ? FOR UPDATE', [memberId]
    );
    const tenantId = memberRow?.tenant_id ?? null;

    const settingsRow = await queryOneConn<{
      enabled: number;
      daily_reward_budget: number;
      daily_reward_used: number;
      daily_reward_reset_date: string | null;
      target_rtp: number;
      budget_policy: string;
    }>(
      conn,
      `SELECT enabled,
              COALESCE(daily_reward_budget, 0) AS daily_reward_budget,
              COALESCE(daily_reward_used, 0) AS daily_reward_used,
              daily_reward_reset_date,
              COALESCE(target_rtp, 0) AS target_rtp,
              COALESCE(budget_policy, 'downgrade') AS budget_policy
       FROM lottery_settings WHERE tenant_id <=> ?`,
      [tenantId],
    );
    if (settingsRow && settingsRow.enabled === 0) {
      return { success: false, error: 'LOTTERY_DISABLED' };
    }

    const today = getShanghaiDateString();

    // ── 3. 每日预算自动重置 ──
    let budgetUsed = Number(settingsRow?.daily_reward_used ?? 0);
    const rawBudgetCap = Number(settingsRow?.daily_reward_budget ?? 0);
    const targetRtp = Number(settingsRow?.target_rtp ?? 0);
    const policy = parseBudgetPolicy(settingsRow?.budget_policy);

    const budgetOrRtpEnabled = rawBudgetCap > 0 || targetRtp > 0;
    if (settingsRow && settingsRow.daily_reward_reset_date !== today && budgetOrRtpEnabled) {
      await execConn(conn,
        'UPDATE lottery_settings SET daily_reward_used = 0, daily_reward_reset_date = ? WHERE tenant_id <=> ?',
        [today, tenantId],
      );
      budgetUsed = 0;
    }

    // ── RTP 有效预算：基于今日订单产生的积分 × RTP% ──
    // target_rtp 表示"从今日订单产生的积分中，拿出百分之多少作为抽奖发放额度"
    // 例如 今日订单积分=10000, target_rtp=1 → rtpBudget=100
    // 最终有效上限 = min(手动预算上限, RTP额度)；两者都为 0 则不限
    let effectiveBudgetCap = rawBudgetCap;
    if (targetRtp > 0) {
      const todayOrderPoints = await getTodayOrderPointsTotal(conn, tenantId, today);
      const rtpBudget = Math.floor(todayOrderPoints * targetRtp / 100);
      if (rawBudgetCap > 0) {
        effectiveBudgetCap = Math.min(rawBudgetCap, rtpBudget);
      } else {
        effectiveBudgetCap = rtpBudget;
      }
    }
    const budgetRemaining = effectiveBudgetCap > 0 ? effectiveBudgetCap - budgetUsed : Infinity;
    const budgetEnabled = effectiveBudgetCap > 0;

    // ── 4. deny 策略 / RTP 前置拦截 ──
    // 注意：预算机制是否真正生效取决于"奖品是否有 prize_cost > 0"（anyPrizeHasCost，步骤 6 判断）。
    // 若所有 prize_cost = 0，则 budgetEffective = false，步骤 6 走正常加权随机，不受 deny 限制。
    // 因此此处的 deny 拦截仅适用于 budgetEffective = true 的情况，步骤 6 的 budgetAwarePrizePick
    // 返回 null 时已包含 deny 逻辑，这里只保留 RTP 超限的 deny 快速返回（节省一次奖品查询）。
    if (budgetEnabled && policy === 'deny' && budgetRemaining <= 0) {
      // 快速返回，但实际上只有 prize_cost > 0 时才有意义；步骤 6 会做最终决定。
      // 此处不直接返回，交由步骤 6 的 budgetEffective 检查来决定是否真正拒绝，
      // 确保 prize_cost = 0 的配置不被误拦截。
    }

    // ── 5. 次数配额 ──
    const dailyFree = await getEffectiveDailyFreeSpinsConn(conn, tenantId);
    const quotaSnap = await syncLotteryQuotaDayAndLoadConn(conn, memberId, today, dailyFree);
    const freeRemaining = Math.max(0, dailyFree - quotaSnap.freeDrawsUsed);
    const totalRemaining = freeRemaining + quotaSnap.balance;
    if (totalRemaining <= 0) {
      return { success: false, error: 'NO_SPIN_QUOTA', remaining: 0 };
    }

    // ── 6. 获取奖品 → 预算感知抽奖 ──
    const prizes = await queryConn<LotteryPrize>(
      conn,
      `SELECT id, name, type, value, description, probability,
              COALESCE(stock_enabled, 0) AS stock_enabled,
              COALESCE(stock_total, -1) AS stock_total,
              COALESCE(stock_used, 0) AS stock_used,
              COALESCE(daily_stock_limit, -1) AS daily_stock_limit,
              COALESCE(prize_cost, 0) AS prize_cost
       FROM lottery_prizes
       WHERE (tenant_id IS NULL OR tenant_id = ?) AND enabled = 1
       ORDER BY sort_order ASC LIMIT 8`,
      [tenantId]
    );
    if (prizes.length === 0) {
      return { success: false, error: 'NO_PRIZES_CONFIGURED' };
    }

    const nonePrize = prizes.find((p) => p.type === 'none');
    let hit: LotteryPrize;
    let budgetWarning: DrawResult['budget_warning'];

    // 只有当奖品池中至少有一个 prize_cost > 0 时，预算机制才有意义。
    // 若所有奖品 prize_cost = 0（默认），跳过 budgetAwarePrizePick，避免因管理员
    // 误设 daily_reward_budget 导致奖品被意外压权。
    const anyPrizeHasCost = prizes.some((p) => Number(p.prize_cost ?? 0) > 0);
    const budgetEffective = budgetEnabled && anyPrizeHasCost;

    // Phase 3: 风控降级 → 直接强制保底
    if (riskDowngrade && nonePrize) {
      hit = nonePrize;
    } else if (budgetEffective) {
      // Phase 2: 使用预算感知抽奖（仅当奖品有成本配置时才启用）
      const pickResult = budgetAwarePrizePick(prizes, {
        budgetRemaining,
        budgetCap: effectiveBudgetCap,
        policy,
      });
      if (!pickResult) {
        return { success: false, error: 'BUDGET_EXCEEDED' };
      }
      hit = pickResult.prize;
      if (pickResult.budgetWarning) {
        budgetWarning = pickResult.budgetWarning;
      }
      if (targetRtp > 0 && budgetUsed >= effectiveBudgetCap && effectiveBudgetCap < rawBudgetCap) {
        budgetWarning = 'RTP_LIMIT_REACHED';
      }
    } else {
      // 无预算限制（或奖品无成本配置），使用原始加权随机
      try {
        hit = pickLotteryPrizeByConfiguredProbability(prizes);
      } catch {
        return { success: false, error: 'PROBABILITY_SUM_ZERO' };
      }
    }

    // ── 7. 库存检查 + 原子扣减 ──
    if (hit.type !== 'none' && Number(hit.stock_enabled) === 1 && Number(hit.stock_total) >= 0) {
      if (Number(hit.stock_used) >= Number(hit.stock_total)) {
        if (nonePrize) hit = nonePrize;
      } else {
        const [stockRes] = await conn.query(
          'UPDATE lottery_prizes SET stock_used = stock_used + 1 WHERE id = ? AND stock_used < stock_total',
          [hit.id],
        );
        if (Number((stockRes as ResultSetHeader).affectedRows) !== 1) {
          if (nonePrize) hit = nonePrize;
        }
      }
    }

    // ── 7b. 每日库存限制检查 ──
    const dailyLimit = Number(hit.daily_stock_limit ?? -1);
    if (hit.type !== 'none' && dailyLimit > 0) {
      const dayStart = `${today} 00:00:00`;
      const [dailyRow] = await queryConn<{ cnt: number }>(conn,
        `SELECT COUNT(*) AS cnt FROM lottery_logs
         WHERE prize_id = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
        [hit.id, dayStart, dayStart],
      );
      if (Number(dailyRow?.cnt ?? 0) >= dailyLimit) {
        if (nonePrize) hit = nonePrize;
      }
    }

    // ── 8. 扣减配额 ──
    let newRemaining = 0;
    if (freeRemaining > 0) {
      await execConn(
        conn,
        'UPDATE member_activity SET lottery_free_draws_used = COALESCE(lottery_free_draws_used, 0) + 1, updated_at = NOW(3) WHERE member_id = ?',
        [memberId],
      );
      const nextFreeUsed = quotaSnap.freeDrawsUsed + 1;
      newRemaining = Math.max(0, dailyFree - nextFreeUsed) + quotaSnap.balance;
    } else {
      const [ur] = await conn.query(
        'UPDATE member_activity SET lottery_spin_balance = COALESCE(lottery_spin_balance, 0) - 1, updated_at = NOW(3) WHERE member_id = ? AND COALESCE(lottery_spin_balance, 0) >= 1',
        [memberId],
      );
      const aff = Number((ur as ResultSetHeader).affectedRows ?? 0);
      if (aff !== 1) {
        return { success: false, error: 'NO_SPIN_QUOTA', remaining: 0 };
      }
      newRemaining = Math.max(0, dailyFree - quotaSnap.freeDrawsUsed) + (quotaSnap.balance - 1);
    }

    // ── 9. 写抽奖日志（Phase 4: 含 prize_cost / reward_type，初始 reward_status='pending'） ──
    const logId = randomUUID();
    const finalCost = Number(hit.prize_cost ?? 0);
    const rewardType = classifyRewardType(hit);
    await execConn(conn,
      `INSERT INTO lottery_logs
        (id, member_id, tenant_id, prize_id, prize_name, prize_type, prize_value,
         request_id, reward_status, reward_type, prize_cost, client_ip, device_fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [logId, memberId, tenantId, hit.id, hit.name, hit.type, hit.value,
       requestId ?? null, rewardType, finalCost, clientIp ?? null, deviceFingerprint ?? null]
    );

    // ── 10. 奖励发放（Phase 4: 统一走 fulfillRewardOnConn） ──
    const reward = await fulfillRewardOnConn(conn, {
      logId,
      memberId,
      tenantId,
      prizeType: hit.type,
      prizeName: hit.name,
      prizeValue: hit.value,
      rewardType,
    });

    // ── 11. 更新 reward_status + reward_points + retry_count ──
    await execConn(conn,
      'UPDATE lottery_logs SET reward_status = ?, fail_reason = ?, reward_points = ?, retry_count = COALESCE(retry_count, 0) + ? WHERE id = ?',
      [reward.status, reward.failReason, reward.awardedPoints, 0, logId],
    );

    // ── 12. 事务内更新每日预算消耗 ──
    if (budgetEnabled && finalCost > 0 && reward.status === 'done') {
      await execConn(conn,
        'UPDATE lottery_settings SET daily_reward_used = COALESCE(daily_reward_used, 0) + ? WHERE tenant_id <=> ?',
        [finalCost, tenantId],
      );
    }

    return {
      success: true,
      prize: {
        id: hit.id,
        name: hit.name,
        type: hit.type,
        value: hit.value,
        description: hit.description,
      },
      remaining: newRemaining,
      reward_status: reward.status,
      fail_reason: reward.failReason ?? undefined,
      reward_points: reward.awardedPoints,
      balance_after: reward.balanceAfter,
      budget_warning: budgetWarning,
      risk_downgraded: riskDowngrade || undefined,
    };
    } finally {
      await mysqlReleaseLock(conn, drawLock);
    }
  });

  if (result.success) {
    recentDraws.set(memberId, Date.now());
    recordDrawBurst({ memberId, tenantId: null, clientIp: clientIp ?? null, deviceFingerprint: deviceFingerprint ?? null });
  }
  return result;
}

function parseBudgetPolicy(raw: string | null | undefined): BudgetPolicy {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'deny' || v === 'fallback') return v;
  return 'downgrade';
}

/**
 * 查询今日（北京时间）该租户通过订单产生的积分总数。
 * 取 points_ledger 中 type='consumption' 或 transaction_type='consumption' 且 amount > 0 的正向流水。
 */
async function getTodayOrderPointsTotal(
  conn: PoolConnection,
  tenantId: string | null,
  today: string,
): Promise<number> {
  const dayStart = `${today} 00:00:00`;
  try {
    const rows = await queryConn<{ total: number }>(conn,
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM points_ledger
       WHERE tenant_id <=> ?
         AND amount > 0
         AND (type = 'consumption' OR transaction_type = 'consumption')
         AND created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [tenantId, dayStart, dayStart],
    );
    return Number(rows[0]?.total ?? 0);
  } catch (e) {
    console.warn('[lottery] getTodayOrderPointsTotal query failed (fallback 0):', (e as Error).message?.slice(0, 120));
    return 0;
  }
}

/* ──────────── Phase 4: 统一奖励发放 ──────────── */

export type RewardType = 'auto' | 'manual' | 'none';

function classifyRewardType(prize: { type: string; value: number }): RewardType {
  if (prize.type === 'none') return 'none';
  if (prize.type === 'custom') return 'manual';
  return 'auto';
}

export interface FulfillRewardArgs {
  logId: string;
  memberId: string;
  tenantId: string | null;
  prizeType: string;
  prizeName: string;
  prizeValue: number;
  rewardType: RewardType;
}

export interface FulfillRewardResult {
  status: 'pending' | 'done' | 'failed';
  failReason: string | null;
  /** 实际到账积分（仅 status=done 且 prizeType=points 时有效） */
  awardedPoints: number;
  /** 操作后余额快照（仅 status=done 且 prizeType=points 时有效） */
  balanceAfter: number | null;
}

/**
 * 在事务连接上执行奖励发放。可被 draw() 和补偿任务复用。
 *
 * - none  → 直接 done（无需发放）
 * - auto  → 发积分 → done / failed
 * - manual → 保持 pending（等待人工确认）
 */
export async function fulfillRewardOnConn(
  conn: PoolConnection,
  args: FulfillRewardArgs,
): Promise<FulfillRewardResult> {
  const { logId, memberId, tenantId, prizeType, prizeName, prizeValue, rewardType } = args;

  // none 型：无需任何发放
  if (rewardType === 'none') {
    return { status: 'done', failReason: null, awardedPoints: 0, balanceAfter: null };
  }

  // manual 型（custom 奖品）：保持 pending，等待后台人工操作
  if (rewardType === 'manual') {
    return { status: 'pending', failReason: null, awardedPoints: 0, balanceAfter: null };
  }

  // auto 型：积分类自动发放 — 全部经由统一 pointsService
  if (prizeType === 'points' && prizeValue > 0) {
    try {
      // C1: idempotency — skip duplicate points_ledger rows for same lottery log on retry
      const existing = await queryConn<{ id: string }>(
        conn,
        `SELECT id FROM points_ledger WHERE reference_id = ? AND reference_type = 'lottery_log' LIMIT 1`,
        [logId],
      );
      if (existing.length > 0) {
        const bal = await queryConn<{ balance: number }>(
          conn,
          'SELECT balance FROM points_accounts WHERE member_id = ? LIMIT 1',
          [memberId],
        );
        return {
          status: 'done',
          failReason: null,
          awardedPoints: prizeValue,
          balanceAfter: Number(bal[0]?.balance ?? 0),
        };
      }
      const mutation = await addPoints(conn, {
        memberId,
        amount: prizeValue,
        type: 'lottery',
        referenceType: 'lottery_log',
        referenceId: logId,
        description: `Lucky spin: ${prizeName}`,
        extras: { tenant_id: tenantId },
      });
      return {
        status: 'done',
        failReason: null,
        awardedPoints: mutation.amount,
        balanceAfter: mutation.balanceAfter,
      };
    } catch (err) {
      const reason = `POINTS_GRANT_FAILED: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500);
      return { status: 'failed', failReason: reason, awardedPoints: 0, balanceAfter: null };
    }
  }

  // auto 但 value=0 或未知 type → 无实际发放
  return { status: 'done', failReason: null, awardedPoints: 0, balanceAfter: null };
}

export async function getQuota(memberId: string) {
  const { queryOne } = await import('../../database/index.js');
  const tenantRow = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
  const tenantId = tenantRow?.tenant_id ?? null;

  const settings = await getLotterySettings(tenantId);
  const enabled = !settings || settings.enabled !== 0;

  const today = getShanghaiDateString();
  const dayStart = `${today} 00:00:00`;

  return withTransaction(async (conn) => {
    const dailyFree = await getEffectiveDailyFreeSpinsConn(conn, tenantId);
    const snap = await syncLotteryQuotaDayAndLoadConn(conn, memberId, today, dailyFree);
    const freeRem = Math.max(0, dailyFree - snap.freeDrawsUsed);
    const remaining = freeRem + snap.balance;

    const usedRow = await queryOneConn<{ cnt: number }>(
      conn,
      `SELECT COUNT(*) as cnt FROM lottery_logs
       WHERE member_id = ?
         AND created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [memberId, dayStart, dayStart],
    );
    const usedToday = usedRow?.cnt ?? 0;

    return { remaining, daily_free: dailyFree, credits: snap.balance, used_today: usedToday, enabled };
  });
}

/**
 * 假人模拟抽奖：只读配置 + 与真实 draw 相同的 pickLotteryPrizeByConfiguredProbability，
 * 不写 lottery_logs、不扣次数、不发积分。
 */
export async function simulateLotteryDrawForTenant(tenantId: string | null): Promise<{
  ok: boolean;
  error?: string;
  prize?: { id: string; name: string; type: string; value: number; description: string | null };
  /** 按 sort_order ASC 的启用奖品列表中的 1-based 名次（一等奖=1） */
  rank?: number;
}> {
  const settings = await getLotterySettings(tenantId);
  if (settings && settings.enabled === 0) {
    return { ok: false, error: 'LOTTERY_DISABLED' };
  }
  const allPrizes = await listEnabledPrizes(tenantId);
  const prizes = allPrizes.slice(0, 8);
  if (prizes.length === 0) {
    return { ok: false, error: 'NO_PRIZES_CONFIGURED' };
  }
  try {
    const hit = pickLotteryPrizeByConfiguredProbability(prizes);
    const rank = prizes.findIndex((p) => p.id === hit.id) + 1;
    return {
      ok: true,
      prize: {
        id: hit.id,
        name: hit.name,
        type: hit.type,
        value: hit.value,
        description: hit.description,
      },
      rank,
    };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'PROBABILITY_SUM_ZERO') return { ok: false, error: 'PROBABILITY_SUM_ZERO' };
    throw e;
  }
}
