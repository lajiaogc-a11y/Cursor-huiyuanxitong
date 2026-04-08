/**
 * 邀请榜假用户自动增长 — 简化版
 *
 * 逻辑：
 * 1. 每个周期（默认 72h），为所有活跃假用户各分配一个随机时间 next_growth_at（相对 NOW(3) 的随机秒偏移）。
 * 2. 每 2 分钟检查：处理所有 next_growth_at <= NOW(3) 的用户，增量 = random(delta_min, delta_max)。
 * 3. 处理完的用户 next_growth_at = NULL，本周期不再增长。
 * 4. 周期结束条件在 MySQL 内判断：对 growth_segment_hours 做 1–720 钳制后再 DATE_ADD，避免库中为 0 时「周期已结束」恒为真、每轮重开周期。
 * 5. 每个假用户在一个周期内只增长一次，且各自在不同随机时刻触发。
 * 6. last_auto_growth_at：距上次自动增长未满 growth_segment_hours 小时则跳过（与后台「每账号 N 小时只跑一次」一致，防止调度异常时重复跑）。
 */
import { randomUUID } from 'node:crypto';
import type { ResultSetHeader } from 'mysql2';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../../database/index.js';
import { withSchedulerLock } from '../../lib/schedulerLock.js';
import {
  finishJobRun,
  insertJobRunStart,
  INVITE_LEADERBOARD_DEFAULT_GROWTH,
  randomIntegerInclusive,
} from './repository.js';

type SchedRow = {
  growth_segment_hours: number;
  growth_delta_min: number;
  growth_delta_max: number;
  auto_growth_enabled: number;
  growth_segment_started_at: string | null;
  last_fake_growth_at: string | null;
  /** 由 SQL 计算：周期未开始或已到期，应执行 startNewCycle */
  need_new_cycle: number;
};

function readSchedRow(r: RowDataPacket | undefined): SchedRow | null {
  if (!r) return null;
  const row = r as Record<string, unknown>;
  return {
    growth_segment_hours: Math.max(1, Math.min(720, Number(row.growth_segment_hours ?? 72))),
    growth_delta_min: Math.max(0, Number(row.growth_delta_min ?? 0)),
    growth_delta_max: Math.max(0, Number(row.growth_delta_max ?? 3)),
    auto_growth_enabled: Number(row.auto_growth_enabled ?? 1),
    growth_segment_started_at:
      row.growth_segment_started_at != null ? String(row.growth_segment_started_at) : null,
    last_fake_growth_at:
      row.last_fake_growth_at != null ? String(row.last_fake_growth_at) : null,
    need_new_cycle: Number(row.need_new_cycle ?? 0),
  };
}

/**
 * 开始新周期：为每个活跃假用户分配一个 [now, now + segmentHours] 内的随机时间。
 * 同时重置 growth_cycles（本周期计数已由 max_growth_cycles 限制总生命周期）。
 */
async function startNewCycle(
  conn: PoolConnection,
  tenantId: string,
  segmentHours: number,
): Promise<void> {
  const totalSeconds = Math.max(1, Math.floor(segmentHours * 3600));

  await conn.query(
    `UPDATE invite_leaderboard_fake_users
     SET next_growth_at = DATE_ADD(NOW(3), INTERVAL FLOOR(RAND() * ?) SECOND),
         updated_at = NOW(3)
     WHERE tenant_id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles`,
    [totalSeconds, tenantId],
  );

  await conn.query(
    `UPDATE invite_leaderboard_fake_users
     SET next_growth_at = NULL
     WHERE tenant_id = ? AND (is_active = 0 OR growth_cycles >= max_growth_cycles) AND next_growth_at IS NOT NULL`,
    [tenantId],
  );

  const [nextRow] = await conn.query<RowDataPacket[]>(
    `SELECT MIN(next_growth_at) AS earliest
     FROM invite_leaderboard_fake_users
     WHERE tenant_id = ? AND next_growth_at IS NOT NULL`,
    [tenantId],
  );
  const earliest = (nextRow[0] as Record<string, unknown> | undefined)?.earliest ?? null;

  await conn.query(
    `UPDATE invite_leaderboard_tenant_growth_schedule
     SET growth_segment_started_at = NOW(3),
         next_fake_growth_at = ?,
         updated_at = NOW(3)
     WHERE tenant_id = ?`,
    [earliest, tenantId],
  );
}

async function runGrowthInTransaction(conn: PoolConnection): Promise<{
  tenantsEligible: number;
  tenantsProcessed: number;
  rowsUpdated: number;
}> {
  await conn.query(`SELECT id FROM invite_leaderboard_cron_ticket WHERE id = 1 FOR UPDATE`);

  let tenantsEligible = 0;
  let tenantsProcessed = 0;
  let rowsUpdated = 0;

  const [tidRows] = await conn.query<RowDataPacket[]>(
    `SELECT DISTINCT tenant_id AS tenant_id FROM invite_leaderboard_fake_users WHERE is_active = 1`,
  );
  const tenantIds = (tidRows as { tenant_id: string }[]).map((r) => String(r.tenant_id));

  for (const tenantId of tenantIds) {
    const [schedRows] = await conn.query<RowDataPacket[]>(
      `SELECT growth_segment_hours, growth_delta_min, growth_delta_max,
              auto_growth_enabled, growth_segment_started_at, last_fake_growth_at,
              (growth_segment_started_at IS NULL
                OR DATE_ADD(
                     growth_segment_started_at,
                     INTERVAL GREATEST(
                       1,
                       LEAST(720, COALESCE(NULLIF(growth_segment_hours, 0), 72))
                     ) HOUR
                   ) <= NOW(3)
              ) AS need_new_cycle
       FROM invite_leaderboard_tenant_growth_schedule WHERE tenant_id = ? LIMIT 1`,
      [tenantId],
    );
    const sched = readSchedRow(schedRows[0] as RowDataPacket | undefined);

    if (!sched) {
      await conn.query(
        `INSERT IGNORE INTO invite_leaderboard_tenant_growth_schedule
         (tenant_id, growth_segment_hours, growth_delta_min, growth_delta_max, auto_growth_enabled, updated_at)
         VALUES (?, ?, ?, ?, 1, NOW(3))`,
        [
          tenantId,
          INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_segment_hours,
          INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_delta_min,
          INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_delta_max,
        ],
      );
      continue;
    }

    if (!sched.auto_growth_enabled) continue;

    tenantsEligible++;

    const dMin = Math.min(sched.growth_delta_min, sched.growth_delta_max);
    const dMax = Math.max(sched.growth_delta_min, sched.growth_delta_max);
    const segHours = sched.growth_segment_hours;

    const [dueRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM invite_leaderboard_fake_users
       WHERE tenant_id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles
         AND next_growth_at IS NOT NULL AND next_growth_at <= NOW(3)
         AND (
           last_auto_growth_at IS NULL
           OR last_auto_growth_at <= DATE_SUB(NOW(3), INTERVAL ? HOUR)
         )`,
      [tenantId, segHours],
    );
    const dueIds = (dueRows as { id: string }[]).map((r) => String(r.id));

    let tickFakeUpdates = 0;
    for (const id of dueIds) {
      const delta = dMax <= 0 ? 0 : randomIntegerInclusive(dMin, dMax);
      const [upd] = await conn.query<ResultSetHeader>(
        `UPDATE invite_leaderboard_fake_users
         SET auto_increment_count = auto_increment_count + ?,
             growth_cycles = growth_cycles + 1,
             next_growth_at = NULL,
             last_auto_growth_at = NOW(3),
             updated_at = NOW(3)
         WHERE tenant_id = ? AND id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles
           AND next_growth_at IS NOT NULL AND next_growth_at <= NOW(3)
           AND (
             last_auto_growth_at IS NULL
             OR last_auto_growth_at <= DATE_SUB(NOW(3), INTERVAL ? HOUR)
           )`,
        [delta, tenantId, id, segHours],
      );
      const n = Number(upd.affectedRows ?? 0);
      if (n > 0) {
        rowsUpdated += n;
        tickFakeUpdates += n;
      }
    }

    if (tickFakeUpdates > 0) {
      await conn.query(
        `UPDATE invite_leaderboard_tenant_growth_schedule
         SET last_fake_growth_at = NOW(3), updated_at = NOW(3)
         WHERE tenant_id = ?`,
        [tenantId],
      );
    }

    // 周期将轮换时：先处理完本周期内仍到点的用户，再 startNewCycle，避免 next_growth_at 被覆盖导致漏增长
    if (sched.need_new_cycle) {
      await startNewCycle(conn, tenantId, sched.growth_segment_hours);
    } else if (dueIds.length > 0) {
      const [nextRow] = await conn.query<RowDataPacket[]>(
        `SELECT MIN(next_growth_at) AS earliest
         FROM invite_leaderboard_fake_users
         WHERE tenant_id = ? AND next_growth_at IS NOT NULL`,
        [tenantId],
      );
      const earliest = (nextRow[0] as Record<string, unknown> | undefined)?.earliest ?? null;

      await conn.query(
        `UPDATE invite_leaderboard_tenant_growth_schedule
         SET next_fake_growth_at = ?, updated_at = NOW(3)
         WHERE tenant_id = ?`,
        [earliest, tenantId],
      );
    }

    tenantsProcessed++;
  }

  return { tenantsEligible, tenantsProcessed, rowsUpdated };
}

export type InviteLeaderboardGrowthJobResult = {
  ok: boolean;
  tenants_eligible: number;
  tenants_processed: number;
  fake_rows_updated: number;
  message: string;
};

export async function runInviteLeaderboardFakeGrowthJob(): Promise<InviteLeaderboardGrowthJobResult> {
  const jobId = randomUUID();
  await insertJobRunStart(jobId);
  try {
    const stats = await withTransaction(async (conn) => runGrowthInTransaction(conn));
    const msg = `eligible=${stats.tenantsEligible} processed=${stats.tenantsProcessed} rows=${stats.rowsUpdated}`;
    await finishJobRun(jobId, {
      tenants_eligible: stats.tenantsEligible,
      tenants_processed: stats.tenantsProcessed,
      fake_rows_updated: stats.rowsUpdated,
      message: msg,
    });
    if (stats.tenantsProcessed > 0) {
      console.log('[invite_lb_growth]', msg);
    }
    return {
      ok: true,
      tenants_eligible: stats.tenantsEligible,
      tenants_processed: stats.tenantsProcessed,
      fake_rows_updated: stats.rowsUpdated,
      message: msg,
    };
  } catch (e) {
    const err = (e as Error).message || String(e);
    const message = `error: ${err.slice(0, 400)}`;
    await finishJobRun(jobId, {
      tenants_eligible: 0,
      tenants_processed: 0,
      fake_rows_updated: 0,
      message,
    });
    console.warn('[invite_lb_growth] failed:', err);
    return {
      ok: false,
      tenants_eligible: 0,
      tenants_processed: 0,
      fake_rows_updated: 0,
      message,
    };
  }
}

const CHECK_INTERVAL_MS = 2 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | undefined;

export function startInviteLeaderboardGrowthScheduler(): void {
  if (timer) return;
  console.log(
    '[API] Invite leaderboard fake growth: check every 2 min; per-user random scheduling within cycle',
  );
  void withSchedulerLock('invite_growth', () => runInviteLeaderboardFakeGrowthJob().then(() => {}));
  timer = setInterval(() => {
    void withSchedulerLock('invite_growth', () => runInviteLeaderboardFakeGrowthJob().then(() => {}));
  }, CHECK_INTERVAL_MS);
}

export function stopInviteLeaderboardGrowthScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
