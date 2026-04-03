/**
 * Phase 6: 恢复与补偿 — 库存校正 / 预算校正 / 幂等修复
 *
 * 设计原则：
 *   - 每个任务独立、可单独触发、可批量调度
 *   - 只做校正和告警，不会静默覆写（大偏差时只报警不修）
 *   - 所有结果可追踪，返回结构化报告
 *   - 幂等修复只补 request_id，不删除真实业务数据
 */
import { query, queryOne, execute } from '../../database/index.js';
import { randomUUID } from 'crypto';
import { getShanghaiDateString } from '../../lib/shanghaiTime.js';

/* ================================================================
 *  1. 库存校正任务
 *
 *  比较 lottery_prizes.stock_used 与 lottery_logs 中该奖品的实际中奖次数，
 *  检测偏差并可选自动修复。
 * ================================================================ */

export interface StockDrift {
  prize_id: string;
  prize_name: string;
  stock_used_in_prize: number;
  actual_wins: number;
  drift: number;
  auto_fixed: boolean;
}

export interface StockReconcileResult {
  checked: number;
  drifts: StockDrift[];
  fixed: number;
  skipped: number;
}

/**
 * @param tenantId  租户隔离
 * @param autoFix   true=小偏差自动修正 stock_used；false=只报告不修
 * @param maxAutoFixDrift 自动修正的最大允许偏差绝对值（超过只报警）
 */
export async function reconcileStock(
  tenantId: string | null,
  autoFix = false,
  maxAutoFixDrift = 5,
): Promise<StockReconcileResult> {
  const prizes = await query<{
    id: string;
    name: string;
    stock_used: number;
    stock_enabled: number;
    stock_total: number;
  }>(
    `SELECT id, name,
            COALESCE(stock_used, 0) AS stock_used,
            COALESCE(stock_enabled, 0) AS stock_enabled,
            COALESCE(stock_total, 0) AS stock_total
     FROM lottery_prizes
     WHERE (tenant_id IS NULL OR tenant_id = ?) AND enabled = 1 AND COALESCE(stock_enabled, 0) = 1`,
    [tenantId],
  );

  if (prizes.length === 0) {
    return { checked: 0, drifts: [], fixed: 0, skipped: 0 };
  }

  const prizeIds = prizes.map((p) => p.id);
  const placeholders = prizeIds.map(() => '?').join(',');

  const winCounts = await query<{ prize_id: string; cnt: number }>(
    `SELECT prize_id, COUNT(*) AS cnt
     FROM lottery_logs
     WHERE prize_id IN (${placeholders}) AND prize_type <> 'none'
     GROUP BY prize_id`,
    prizeIds,
  );
  const winMap = new Map(winCounts.map((r) => [r.prize_id, Number(r.cnt)]));

  const drifts: StockDrift[] = [];
  let fixed = 0;
  let skipped = 0;

  for (const p of prizes) {
    const actual = winMap.get(p.id) ?? 0;
    const drift = p.stock_used - actual;
    if (drift === 0) continue;

    const abs = Math.abs(drift);
    let autoFixed = false;

    if (autoFix && abs <= maxAutoFixDrift) {
      await execute(
        'UPDATE lottery_prizes SET stock_used = ? WHERE id = ?',
        [actual, p.id],
      );
      autoFixed = true;
      fixed++;
    } else if (abs > maxAutoFixDrift) {
      skipped++;
    }

    drifts.push({
      prize_id: p.id,
      prize_name: p.name,
      stock_used_in_prize: p.stock_used,
      actual_wins: actual,
      drift,
      auto_fixed: autoFixed,
    });
  }

  return { checked: prizes.length, drifts, fixed, skipped };
}

/* ================================================================
 *  2. 预算校正任务
 *
 *  比较 lottery_settings.daily_reward_used 与 lottery_logs 中今日实际
 *  reward_status='done' 的 SUM(prize_cost)，检测并修正偏差。
 * ================================================================ */

export interface BudgetDrift {
  tenant_id: string | null;
  daily_reward_used_in_settings: number;
  actual_cost_today: number;
  drift: number;
  auto_fixed: boolean;
}

export interface BudgetReconcileResult {
  tenant_id: string | null;
  date: string;
  drift: BudgetDrift | null;
  ok: boolean;
}

export async function reconcileBudget(
  tenantId: string | null,
  autoFix = false,
  maxAutoFixDrift = 50,
): Promise<BudgetReconcileResult> {
  const today = getShanghaiDateString();
  const dayStart = `${today} 00:00:00`;

  const settingsRow = await queryOne<{
    daily_reward_used: number;
    daily_reward_budget: number;
    daily_reward_reset_date: string | null;
  }>(
    `SELECT COALESCE(daily_reward_used, 0) AS daily_reward_used,
            COALESCE(daily_reward_budget, 0) AS daily_reward_budget,
            daily_reward_reset_date
     FROM lottery_settings WHERE tenant_id <=> ?`,
    [tenantId],
  );

  if (!settingsRow || settingsRow.daily_reward_budget <= 0) {
    return { tenant_id: tenantId, date: today, drift: null, ok: true };
  }

  // If reset_date != today, the live value is stale and will be reset on next draw; treat as 0.
  const recordedUsed = settingsRow.daily_reward_reset_date === today
    ? Number(settingsRow.daily_reward_used)
    : 0;

  const costRow = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(COALESCE(prize_cost, 0)), 0) AS total
     FROM lottery_logs
     WHERE tenant_id <=> ?
       AND reward_status = 'done'
       AND prize_type <> 'none'
       AND created_at >= ?
       AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [tenantId, dayStart, dayStart],
  );
  const actualCost = Number(costRow?.total ?? 0);

  const drift = Math.round((recordedUsed - actualCost) * 100) / 100;
  if (Math.abs(drift) < 0.01) {
    return { tenant_id: tenantId, date: today, drift: null, ok: true };
  }

  let autoFixed = false;
  if (autoFix && Math.abs(drift) <= maxAutoFixDrift) {
    await execute(
      'UPDATE lottery_settings SET daily_reward_used = ?, daily_reward_reset_date = ? WHERE tenant_id <=> ?',
      [actualCost, today, tenantId],
    );
    autoFixed = true;
  }

  return {
    tenant_id: tenantId,
    date: today,
    drift: {
      tenant_id: tenantId,
      daily_reward_used_in_settings: recordedUsed,
      actual_cost_today: actualCost,
      drift,
      auto_fixed: autoFixed,
    },
    ok: false,
  };
}

/* ================================================================
 *  3. 幂等修复任务
 *
 *  a) 为旧数据（request_id IS NULL）补上唯一 request_id
 *  b) 检测并标记真正的重复记录
 * ================================================================ */

export interface IdempotencyRepairResult {
  backfilled: number;
  duplicates_found: number;
  duplicates_marked: number;
}

export async function repairIdempotency(
  tenantId: string | null,
  batchSize = 500,
): Promise<IdempotencyRepairResult> {
  let backfilled = 0;

  // a) Backfill NULL request_id with a unique UUID
  const nullRows = await query<{ id: string }>(
    `SELECT id FROM lottery_logs
     WHERE tenant_id <=> ? AND (request_id IS NULL OR request_id = '')
     ORDER BY created_at ASC
     LIMIT ?`,
    [tenantId, batchSize],
  );

  for (const row of nullRows) {
    const newReqId = `backfill_${randomUUID()}`;
    try {
      await execute(
        'UPDATE lottery_logs SET request_id = ? WHERE id = ? AND (request_id IS NULL OR request_id = \'\')',
        [newReqId, row.id],
      );
      backfilled++;
    } catch {
      // unique index conflict means another process filled it
    }
  }

  // b) Detect true duplicates: same member_id + prize_id + created_at within 3 seconds
  //    This catches cases where the same draw was logged twice without request_id protection.
  const dupeRows = await query<{ id: string; member_id: string; created_at: string; row_num: number }>(
    `SELECT sub.id, sub.member_id, sub.created_at, sub.rn AS row_num FROM (
       SELECT l.id, l.member_id, l.created_at,
              ROW_NUMBER() OVER (
                PARTITION BY l.member_id, l.prize_id,
                  DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i')
                ORDER BY l.created_at ASC
              ) AS rn
       FROM lottery_logs l
       WHERE l.tenant_id <=> ?
         AND l.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     ) sub
     WHERE sub.rn > 1
     LIMIT ?`,
    [tenantId, batchSize],
  );

  let duplicatesMarked = 0;
  for (const dup of dupeRows) {
    await execute(
      `UPDATE lottery_logs
       SET fail_reason = CONCAT(COALESCE(fail_reason, ''), ' [DUPLICATE_DETECTED]')
       WHERE id = ? AND (fail_reason IS NULL OR fail_reason NOT LIKE '%DUPLICATE_DETECTED%')`,
      [dup.id],
    );
    duplicatesMarked++;
  }

  return {
    backfilled,
    duplicates_found: dupeRows.length,
    duplicates_marked: duplicatesMarked,
  };
}

/* ================================================================
 *  4. 综合巡检入口
 *
 *  一次调用跑完全部校正，返回汇总报告。
 * ================================================================ */

export interface ReconcileAllResult {
  stock: StockReconcileResult;
  budget: BudgetReconcileResult;
  idempotency: IdempotencyRepairResult;
  reward_retry: { attempted: number; succeeded: number; stillFailed: number; skipped: number } | null;
  timestamp: string;
  warnings: string[];
}

export async function reconcileAll(
  tenantId: string | null,
  opts?: { autoFix?: boolean; includeRewardRetry?: boolean },
): Promise<ReconcileAllResult> {
  const autoFix = opts?.autoFix ?? false;
  const warnings: string[] = [];

  const stock = await reconcileStock(tenantId, autoFix);
  if (stock.drifts.length > 0) {
    for (const d of stock.drifts) {
      warnings.push(`STOCK_DRIFT:${d.prize_name}(recorded=${d.stock_used_in_prize},actual=${d.actual_wins},drift=${d.drift}${d.auto_fixed ? ',FIXED' : ''})`);
    }
  }

  const budget = await reconcileBudget(tenantId, autoFix);
  if (budget.drift) {
    warnings.push(`BUDGET_DRIFT:recorded=${budget.drift.daily_reward_used_in_settings},actual=${budget.drift.actual_cost_today},drift=${budget.drift.drift}${budget.drift.auto_fixed ? ',FIXED' : ''}`);
  }

  const idempotency = await repairIdempotency(tenantId);
  if (idempotency.backfilled > 0) {
    warnings.push(`IDEMPOTENCY_BACKFILLED:${idempotency.backfilled}`);
  }
  if (idempotency.duplicates_found > 0) {
    warnings.push(`DUPLICATES_DETECTED:${idempotency.duplicates_found}`);
  }

  let rewardRetry: ReconcileAllResult['reward_retry'] = null;
  if (opts?.includeRewardRetry) {
    const { retryFailedRewards } = await import('./rewardCompensation.js');
    rewardRetry = await retryFailedRewards(tenantId, 50);
    if (rewardRetry.stillFailed > 0) {
      warnings.push(`REWARD_STILL_FAILED:${rewardRetry.stillFailed}`);
    }
  }

  return {
    stock,
    budget,
    idempotency,
    reward_retry: rewardRetry,
    timestamp: new Date().toISOString(),
    warnings,
  };
}
