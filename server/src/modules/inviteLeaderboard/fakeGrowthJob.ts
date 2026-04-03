/**
 * 邀请榜假用户自动增长 — 简化版
 *
 * 逻辑：
 * 1. 每个周期（默认 72h），为所有活跃假用户各分配一个随机时间 next_growth_at。
 * 2. 每小时检查：处理所有 next_growth_at <= NOW() 的用户，增量 = random(delta_min, delta_max)。
 * 3. 处理完的用户 next_growth_at = NULL，本周期不再增长。
 * 4. 周期结束后（NOW >= cycle_start + segment_hours）开始新周期，重新分配。
 * 5. 每个假用户在一个周期内只增长一次，且各自在不同随机时刻触发。
 */
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../../database/index.js';
import {
  finishJobRun,
  insertJobRunStart,
  INVITE_LEADERBOARD_DEFAULT_GROWTH,
  randomIntegerInclusive,
  mysqlUtcFromMs,
} from './repository.js';

function parseMysqlDate(s: string | null | undefined): number | null {
  if (!s) return null;
  let iso = String(s).trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

type SchedRow = {
  growth_segment_hours: number;
  growth_delta_min: number;
  growth_delta_max: number;
  auto_growth_enabled: number;
  growth_segment_started_at: string | null;
  last_fake_growth_at: string | null;
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
  const nowMs = Date.now();
  const cycleStartStr = mysqlUtcFromMs(nowMs);
  const totalSeconds = segmentHours * 3600;

  await conn.query(
    `UPDATE invite_leaderboard_fake_users
     SET next_growth_at = DATE_ADD(?, INTERVAL FLOOR(RAND() * ?) SECOND),
         updated_at = NOW(3)
     WHERE tenant_id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles`,
    [cycleStartStr, totalSeconds, tenantId],
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
  const earliest = (nextRow[0] as Record<string, unknown> | undefined)?.earliest;
  const nextStr = earliest != null ? String(earliest) : null;

  await conn.query(
    `UPDATE invite_leaderboard_tenant_growth_schedule
     SET growth_segment_started_at = ?,
         next_fake_growth_at = ?,
         updated_at = NOW(3)
     WHERE tenant_id = ?`,
    [cycleStartStr, nextStr, tenantId],
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
  const nowMs = Date.now();

  for (const tenantId of tenantIds) {
    const [schedRows] = await conn.query<RowDataPacket[]>(
      `SELECT growth_segment_hours, growth_delta_min, growth_delta_max,
              auto_growth_enabled, growth_segment_started_at, last_fake_growth_at
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

    const cycleStartMs = parseMysqlDate(sched.growth_segment_started_at);
    const cycleEndMs =
      cycleStartMs != null ? cycleStartMs + sched.growth_segment_hours * 3600 * 1000 : null;
    const needNewCycle = cycleStartMs == null || cycleEndMs == null || nowMs >= cycleEndMs;

    if (needNewCycle) {
      await startNewCycle(conn, tenantId, sched.growth_segment_hours);
    }

    const dMin = Math.min(sched.growth_delta_min, sched.growth_delta_max);
    const dMax = Math.max(sched.growth_delta_min, sched.growth_delta_max);

    const [dueRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM invite_leaderboard_fake_users
       WHERE tenant_id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles
         AND next_growth_at IS NOT NULL AND next_growth_at <= NOW(3)`,
      [tenantId],
    );
    const dueIds = (dueRows as { id: string }[]).map((r) => String(r.id));

    for (const id of dueIds) {
      const delta = dMax <= 0 ? 0 : randomIntegerInclusive(dMin, dMax);
      await conn.query(
        `UPDATE invite_leaderboard_fake_users
         SET auto_increment_count = auto_increment_count + ?,
             growth_cycles = growth_cycles + 1,
             next_growth_at = NULL,
             updated_at = NOW(3)
         WHERE tenant_id = ? AND id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles`,
        [delta, tenantId, id],
      );
      rowsUpdated++;
    }

    if (dueIds.length > 0) {
      const [nextRow] = await conn.query<RowDataPacket[]>(
        `SELECT MIN(next_growth_at) AS earliest
         FROM invite_leaderboard_fake_users
         WHERE tenant_id = ? AND next_growth_at IS NOT NULL`,
        [tenantId],
      );
      const earliest = (nextRow[0] as Record<string, unknown> | undefined)?.earliest;
      const nextStr = earliest != null ? String(earliest) : null;

      await conn.query(
        `UPDATE invite_leaderboard_tenant_growth_schedule
         SET last_fake_growth_at = NOW(3),
             next_fake_growth_at = ?,
             updated_at = NOW(3)
         WHERE tenant_id = ?`,
        [nextStr, tenantId],
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

const ONE_HOUR_MS = 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | undefined;

export function startInviteLeaderboardGrowthScheduler(): void {
  if (timer) return;
  console.log(
    '[API] Invite leaderboard fake growth: hourly check; per-user random scheduling within cycle',
  );
  void runInviteLeaderboardFakeGrowthJob();
  timer = setInterval(() => {
    void runInviteLeaderboardFakeGrowthJob();
  }, ONE_HOUR_MS);
}

export function stopInviteLeaderboardGrowthScheduler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
