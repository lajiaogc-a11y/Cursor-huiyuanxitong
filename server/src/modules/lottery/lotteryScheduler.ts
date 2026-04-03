/**
 * Phase 6: 抽奖系统后台调度器
 *
 * 定时执行四类补偿/校正任务：
 *   1. 奖励补偿 — 重试 reward_status='failed' 的记录
 *   2. 库存校正 — 检查 stock_used 与实际中奖记录是否一致
 *   3. 预算校正 — 检查 daily_reward_used 与实际成本是否一致
 *   4. 幂等修复 — 补充旧数据 request_id、标记重复记录
 *
 * 调度策略：
 *   - 奖励补偿：每 5 分钟
 *   - 库存 + 预算 + 幂等：每 30 分钟
 *   - 所有任务互相独立，单次执行失败不影响其他任务
 *   - 保留最近 N 次运行结果供管理端查询
 */
import { query } from '../../database/index.js';
import { retryFailedRewards } from './rewardCompensation.js';
import {
  reconcileStock,
  reconcileBudget,
  repairIdempotency,
  type StockReconcileResult,
  type BudgetReconcileResult,
  type IdempotencyRepairResult,
} from './reconciliationTasks.js';
import type { RetryBatchResult } from './rewardCompensation.js';

/* ──────────── 运行历史 ──────────── */

export type TaskType = 'reward_retry' | 'stock_reconcile' | 'budget_reconcile' | 'idempotency_repair';

export interface TaskRunRecord {
  id: string;
  type: TaskType;
  tenant_id: string | null;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  success: boolean;
  summary: string;
  detail: unknown;
}

const MAX_HISTORY = 100;
const runHistory: TaskRunRecord[] = [];

function pushHistory(record: TaskRunRecord) {
  runHistory.unshift(record);
  if (runHistory.length > MAX_HISTORY) runHistory.length = MAX_HISTORY;
}

export function getRunHistory(opts?: { type?: TaskType; limit?: number }): TaskRunRecord[] {
  let filtered = runHistory;
  if (opts?.type) filtered = filtered.filter((r) => r.type === opts.type);
  const limit = Math.min(MAX_HISTORY, Math.max(1, opts?.limit ?? 50));
  return filtered.slice(0, limit);
}

export function getLastRun(type: TaskType): TaskRunRecord | null {
  return runHistory.find((r) => r.type === type) ?? null;
}

/* ──────────── 单任务执行器 ──────────── */

async function runTask<T>(
  type: TaskType,
  tenantId: string | null,
  fn: () => Promise<T>,
  summarize: (result: T) => string,
): Promise<TaskRunRecord> {
  const start = Date.now();
  const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const result = await fn();
    const record: TaskRunRecord = {
      id,
      type,
      tenant_id: tenantId,
      started_at: new Date(start).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      success: true,
      summary: summarize(result),
      detail: result,
    };
    pushHistory(record);
    return record;
  } catch (err) {
    const record: TaskRunRecord = {
      id,
      type,
      tenant_id: tenantId,
      started_at: new Date(start).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      success: false,
      summary: `ERROR: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500),
      detail: null,
    };
    pushHistory(record);
    return record;
  }
}

/* ──────────── 对外调用入口（可手动触发） ──────────── */

export async function runRewardRetry(tenantId: string | null): Promise<TaskRunRecord> {
  return runTask<RetryBatchResult>(
    'reward_retry',
    tenantId,
    () => retryFailedRewards(tenantId, 50),
    (r) => `attempted=${r.attempted} succeeded=${r.succeeded} failed=${r.stillFailed} skipped=${r.skipped}`,
  );
}

export async function runStockReconcile(tenantId: string | null, autoFix = false): Promise<TaskRunRecord> {
  return runTask<StockReconcileResult>(
    'stock_reconcile',
    tenantId,
    () => reconcileStock(tenantId, autoFix),
    (r) => `checked=${r.checked} drifts=${r.drifts.length} fixed=${r.fixed} skipped=${r.skipped}`,
  );
}

export async function runBudgetReconcile(tenantId: string | null, autoFix = false): Promise<TaskRunRecord> {
  return runTask<BudgetReconcileResult>(
    'budget_reconcile',
    tenantId,
    () => reconcileBudget(tenantId, autoFix),
    (r) => r.ok ? 'OK — no drift' : `DRIFT: recorded=${r.drift?.daily_reward_used_in_settings} actual=${r.drift?.actual_cost_today} diff=${r.drift?.drift}${r.drift?.auto_fixed ? ' FIXED' : ''}`,
  );
}

export async function runIdempotencyRepair(tenantId: string | null): Promise<TaskRunRecord> {
  return runTask<IdempotencyRepairResult>(
    'idempotency_repair',
    tenantId,
    () => repairIdempotency(tenantId),
    (r) => `backfilled=${r.backfilled} duplicates=${r.duplicates_found} marked=${r.duplicates_marked}`,
  );
}

/* ──────────── 自动调度 ──────────── */

let rewardTimer: ReturnType<typeof setInterval> | undefined;
let reconcileTimer: ReturnType<typeof setInterval> | undefined;
let started = false;

const REWARD_RETRY_INTERVAL_MS = 5 * 60 * 1000;       // 5 min
const RECONCILE_INTERVAL_MS = 30 * 60 * 1000;          // 30 min

async function getAllTenantIds(): Promise<(string | null)[]> {
  try {
    const rows = await query<{ tenant_id: string | null }>(
      'SELECT DISTINCT tenant_id FROM lottery_settings',
    );
    return rows.map((r) => r.tenant_id);
  } catch {
    return [null];
  }
}

async function tickRewardRetry() {
  try {
    const tenants = await getAllTenantIds();
    for (const tid of tenants) {
      await runRewardRetry(tid);
    }
  } catch (e) {
    console.error('[lotteryScheduler] reward_retry tick error:', e);
  }
}

async function tickReconcile() {
  try {
    const tenants = await getAllTenantIds();
    for (const tid of tenants) {
      await runStockReconcile(tid, true);
      await runBudgetReconcile(tid, true);
      await runIdempotencyRepair(tid);
    }
  } catch (e) {
    console.error('[lotteryScheduler] reconcile tick error:', e);
  }
}

export function startLotteryScheduler() {
  if (started) return;
  started = true;

  console.log('[lotteryScheduler] starting — reward_retry every 5min, reconcile every 30min');

  rewardTimer = setInterval(() => {
    void tickRewardRetry();
  }, REWARD_RETRY_INTERVAL_MS);

  reconcileTimer = setInterval(() => {
    void tickReconcile();
  }, RECONCILE_INTERVAL_MS);

  // Run first reconcile after 60s startup delay
  setTimeout(() => {
    void tickReconcile();
  }, 60_000);
}

export function stopLotteryScheduler() {
  if (rewardTimer) { clearInterval(rewardTimer); rewardTimer = undefined; }
  if (reconcileTimer) { clearInterval(reconcileTimer); reconcileTimer = undefined; }
  started = false;
}

export function isSchedulerRunning(): boolean {
  return started;
}
