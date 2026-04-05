/**
 * Phase 4: 抽奖奖励补偿 — 重试失败 + 人工确认
 *
 * 职责：
 *   1. retryFailedRewards()    — 定时任务调用，批量重试 reward_status='failed' 的记录
 *   2. confirmManualReward()   — 管理员手动确认 custom 奖品已发放
 *   3. listPendingRewards()    — 查询待处理的奖励记录
 *
 * 原则：
 *   - 每次重试都 retry_count+1，超过阈值不再自动重试
 *   - 补偿在独立事务中执行，不影响主抽奖流程
 *   - 所有状态变更都可追踪
 */
import { withTransaction, query, queryOne, execute } from '../../database/index.js';
import { fulfillRewardOnConn, type RewardType } from './service.js';
import { getShanghaiDateString } from '../../lib/shanghaiTime.js';

const MAX_AUTO_RETRY = 3;

/* ──────────── 类型 ──────────── */

export interface PendingRewardRow {
  id: string;
  member_id: string;
  tenant_id: string | null;
  prize_id: string | null;
  prize_name: string;
  prize_type: string;
  prize_value: number;
  prize_cost: number;
  reward_status: string;
  reward_type: string;
  retry_count: number;
  fail_reason: string | null;
  created_at: string;
}

/* ──────────── 查询 ──────────── */

export async function listPendingRewards(
  tenantId: string | null,
  opts?: { status?: 'failed' | 'pending'; limit?: number; offset?: number },
): Promise<{ rows: PendingRewardRow[]; total: number }> {
  const statusFilter = opts?.status;
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 50));
  const offset = Math.max(0, opts?.offset ?? 0);

  let whereExtra = '';
  const params: unknown[] = [tenantId];
  if (statusFilter) {
    whereExtra = ' AND l.reward_status = ?';
    params.push(statusFilter);
  } else {
    whereExtra = " AND l.reward_status IN ('failed', 'pending')";
  }

  const [rows, countRow] = await Promise.all([
    query<PendingRewardRow>(
      `SELECT l.id, l.member_id, l.tenant_id, l.prize_id, l.prize_name, l.prize_type,
              l.prize_value, COALESCE(l.prize_cost, 0) AS prize_cost,
              l.reward_status, COALESCE(l.reward_type, 'auto') AS reward_type,
              COALESCE(l.retry_count, 0) AS retry_count, l.fail_reason, l.created_at
       FROM lottery_logs l
       WHERE l.tenant_id <=> ?${whereExtra}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ),
    queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM lottery_logs l
       WHERE l.tenant_id <=> ?${whereExtra}`,
      params,
    ),
  ]);
  return { rows, total: countRow?.cnt ?? 0 };
}

export async function countFailedRewards(tenantId: string | null): Promise<number> {
  const r = await queryOne<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM lottery_logs WHERE tenant_id <=> ? AND reward_status = 'failed'",
    [tenantId],
  );
  return r?.cnt ?? 0;
}

/* ──────────── 自动重试 ──────────── */

export interface RetryBatchResult {
  attempted: number;
  succeeded: number;
  stillFailed: number;
  skipped: number;
}

/**
 * 批量重试 reward_status='failed' 且 retry_count < MAX_AUTO_RETRY 的记录。
 * 每条记录独立事务，互不影响。
 */
export async function retryFailedRewards(tenantId: string | null, batchSize = 20): Promise<RetryBatchResult> {
  const failedRows = await query<PendingRewardRow>(
    `SELECT id, member_id, tenant_id, prize_id, prize_name, prize_type, prize_value,
            COALESCE(prize_cost, 0) AS prize_cost,
            COALESCE(reward_type, 'auto') AS reward_type,
            COALESCE(retry_count, 0) AS retry_count,
            created_at
     FROM lottery_logs
     WHERE tenant_id <=> ? AND reward_status = 'failed' AND COALESCE(retry_count, 0) < ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [tenantId, MAX_AUTO_RETRY, batchSize],
  );

  let succeeded = 0;
  let stillFailed = 0;
  let skipped = 0;

  for (const row of failedRows) {
    if (row.reward_type === 'manual') {
      skipped++;
      continue;
    }

    try {
      await withTransaction(async (conn) => {
        const result = await fulfillRewardOnConn(conn, {
          logId: row.id,
          memberId: row.member_id,
          tenantId: row.tenant_id,
          prizeType: row.prize_type,
          prizeName: row.prize_name,
          prizeValue: row.prize_value,
          rewardType: row.reward_type as RewardType,
        });

        await conn.query(
          `UPDATE lottery_logs
           SET reward_status = ?, fail_reason = ?, reward_points = ?, retry_count = COALESCE(retry_count, 0) + 1
           WHERE id = ?`,
          [result.status, result.failReason, result.awardedPoints, row.id],
        );

        if (result.status === 'done' && Number(row.prize_cost) > 0) {
          const logDate = String(row.created_at ?? '').slice(0, 10);
          if (logDate === getShanghaiDateString()) {
            await conn.query(
              'UPDATE lottery_settings SET daily_reward_used = COALESCE(daily_reward_used, 0) + ? WHERE tenant_id <=> ?',
              [Number(row.prize_cost), row.tenant_id],
            );
          }
        }
        if (result.status === 'done') succeeded++;
        else stillFailed++;
      });
    } catch (err) {
      console.error(`[rewardCompensation] retry failed for log ${row.id}:`, err);
      try {
        await execute(
          `UPDATE lottery_logs
           SET retry_count = COALESCE(retry_count, 0) + 1,
               fail_reason = ?
           WHERE id = ?`,
          [`RETRY_ERROR: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500), row.id],
        );
      } catch { /* best effort */ }
      stillFailed++;
    }
  }

  return { attempted: failedRows.length, succeeded, stillFailed, skipped };
}

/* ──────────── 人工确认 ──────────── */

/**
 * 管理员确认 custom 奖品已发放（或拒绝）。
 * 仅对 reward_status IN ('pending', 'failed') 且 reward_type='manual' 的记录生效。
 */
export async function confirmManualReward(
  logId: string,
  action: 'done' | 'failed',
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const row = await queryOne<{ reward_status: string; reward_type: string }>(
    'SELECT reward_status, COALESCE(reward_type, \'auto\') AS reward_type FROM lottery_logs WHERE id = ?',
    [logId],
  );
  if (!row) return { ok: false, error: 'LOG_NOT_FOUND' };
  if (row.reward_type !== 'manual') return { ok: false, error: 'NOT_MANUAL_REWARD' };
  if (row.reward_status === 'done') return { ok: false, error: 'ALREADY_DONE' };

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE lottery_logs SET reward_status = ?, fail_reason = ?, retry_count = COALESCE(retry_count, 0) + 1 WHERE id = ?`,
      [action, reason?.slice(0, 500) ?? null, logId],
    );
    if (action === 'done') {
      const [costRows] = await conn.query(
        'SELECT COALESCE(prize_cost, 0) AS prize_cost, tenant_id, created_at FROM lottery_logs WHERE id = ?',
        [logId],
      );
      const costRow = (costRows as { prize_cost: number; tenant_id: string | null; created_at: string }[])[0];
      const logDate = String(costRow?.created_at ?? '').slice(0, 10);
      if (costRow && Number(costRow.prize_cost) > 0 && logDate === getShanghaiDateString()) {
        await conn.execute(
          'UPDATE lottery_settings SET daily_reward_used = COALESCE(daily_reward_used, 0) + ? WHERE tenant_id <=> ?',
          [Number(costRow.prize_cost), costRow.tenant_id],
        );
      }
    }
  });
  return { ok: true };
}

/**
 * 管理员手动重试单条 auto 类型的 failed 记录。
 */
export async function manualRetryReward(logId: string): Promise<{ ok: boolean; error?: string; newStatus?: string }> {
  const row = await queryOne<PendingRewardRow>(
    `SELECT id, member_id, tenant_id, prize_name, prize_type, prize_value,
            COALESCE(reward_type, 'auto') AS reward_type, reward_status
     FROM lottery_logs WHERE id = ?`,
    [logId],
  );
  if (!row) return { ok: false, error: 'LOG_NOT_FOUND' };
  if (row.reward_status === 'done') return { ok: false, error: 'ALREADY_DONE' };
  if (row.reward_type === 'none') return { ok: false, error: 'NO_REWARD_NEEDED' };

  const result = await withTransaction(async (conn) => {
    const res = await fulfillRewardOnConn(conn, {
      logId: row.id,
      memberId: row.member_id,
      tenantId: row.tenant_id,
      prizeType: row.prize_type,
      prizeName: row.prize_name,
      prizeValue: row.prize_value,
      rewardType: row.reward_type as RewardType,
    });
    await conn.execute(
      `UPDATE lottery_logs SET reward_status = ?, fail_reason = ?, reward_points = ?, retry_count = COALESCE(retry_count, 0) + 1 WHERE id = ?`,
      [res.status, res.failReason, res.awardedPoints, logId],
    );
    if (res.status === 'done') {
      const [costRows] = await conn.query(
        'SELECT COALESCE(prize_cost, 0) AS prize_cost, created_at FROM lottery_logs WHERE id = ?',
        [logId],
      );
      const costRowData = (costRows as { prize_cost?: number; created_at?: string }[])[0];
      const cost = Number(costRowData?.prize_cost ?? 0);
      const logDate = String(costRowData?.created_at ?? '').slice(0, 10);
      if (cost > 0 && logDate === getShanghaiDateString()) {
        await conn.execute(
          'UPDATE lottery_settings SET daily_reward_used = COALESCE(daily_reward_used, 0) + ? WHERE tenant_id <=> ?',
          [cost, row.tenant_id],
        );
      }
    }
    return res;
  });

  return { ok: true, newStatus: result.status };
}
