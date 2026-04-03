/**
 * 邀请榜假用户增长：按 UTC 固定「段」时长（如 72h）为一个周期；周期内分若干批（tick）执行。
 * - 每周期开始随机定批次数（可后台配置 min/max，否则按段长自动推算）。
 * - 本周期内全部活跃假用户随机打乱后拆成各批，人数可不一（如 5、8、12…），每人每周期只增长一次。
 * - 「段内时刻」：把周期均分为与批次数相同的时间桶；random=每桶内随机时刻触发一批，even=靠近桶中点。
 * - 每小时检测；FOR UPDATE 行锁防多实例并发。
 */
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../../database/index.js';
import {
  finishJobRun,
  insertGrowthScheduleIfMissing,
  insertJobRunStart,
  INVITE_LEADERBOARD_DEFAULT_GROWTH,
  randomIntegerInclusive,
  mysqlUtcFromMs,
  utcSegmentBounds,
  parseGrowthAllocMode,
  resolveTicksPlannedForSegment,
  computeNextTickMysqlUtc,
  inviteFakeUsersForGrowthTick,
  type InviteLeaderboardGrowthAllocMode,
} from './repository.js';

function parseMysqlDate(s: string | null | undefined): number | null {
  if (!s) return null;
  let iso = String(s).trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

type SchedRow = {
  last_fake_growth_at: string | null;
  next_fake_growth_at: string | null;
  growth_segment_hours: number;
  growth_alloc_mode: InviteLeaderboardGrowthAllocMode;
  growth_segment_started_at: string | null;
  growth_segment_ticks_planned: number;
  growth_segment_ticks_done: number;
  growth_ticks_min: number | null;
  growth_ticks_max: number | null;
  growth_delta_min: number;
  growth_delta_max: number;
  auto_growth_enabled: number;
  growth_runs_per_user: number;
};

function readSchedRow(r: RowDataPacket | undefined): SchedRow | null {
  if (!r) return null;
  const row = r as Record<string, unknown>;
  return {
    last_fake_growth_at: row.last_fake_growth_at != null ? String(row.last_fake_growth_at) : null,
    next_fake_growth_at: row.next_fake_growth_at != null ? String(row.next_fake_growth_at) : null,
    growth_segment_hours: Math.max(1, Math.min(168, Number(row.growth_segment_hours ?? 12))),
    growth_alloc_mode: parseGrowthAllocMode(row.growth_alloc_mode),
    growth_segment_started_at:
      row.growth_segment_started_at != null ? String(row.growth_segment_started_at) : null,
    growth_segment_ticks_planned: Math.max(0, Math.floor(Number(row.growth_segment_ticks_planned ?? 0))),
    growth_segment_ticks_done: Math.max(0, Math.floor(Number(row.growth_segment_ticks_done ?? 0))),
    growth_ticks_min:
      row.growth_ticks_min != null && row.growth_ticks_min !== ''
        ? Math.max(1, Math.min(72, Math.floor(Number(row.growth_ticks_min))))
        : null,
    growth_ticks_max:
      row.growth_ticks_max != null && row.growth_ticks_max !== ''
        ? Math.max(1, Math.min(72, Math.floor(Number(row.growth_ticks_max))))
        : null,
    growth_delta_min: Math.max(0, Number(row.growth_delta_min ?? 1)),
    growth_delta_max: Math.max(0, Number(row.growth_delta_max ?? 3)),
    auto_growth_enabled: Number(row.auto_growth_enabled ?? 1),
    growth_runs_per_user: Math.max(1, Math.min(10, Math.floor(Number(row.growth_runs_per_user ?? 1)))),
  };
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
  const def = INVITE_LEADERBOARD_DEFAULT_GROWTH;

  for (const tenantId of tenantIds) {
    const [schedRows] = await conn.query<RowDataPacket[]>(
      `SELECT last_fake_growth_at, next_fake_growth_at,
              growth_segment_hours, growth_alloc_mode, growth_segment_started_at,
              growth_segment_ticks_planned, growth_segment_ticks_done,
              growth_ticks_min, growth_ticks_max,
              growth_delta_min, growth_delta_max, auto_growth_enabled,
              growth_runs_per_user
       FROM invite_leaderboard_tenant_growth_schedule WHERE tenant_id = ? LIMIT 1`,
      [tenantId],
    );
    const sched = readSchedRow(schedRows[0] as RowDataPacket | undefined);

    const [fakeRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM invite_leaderboard_fake_users
       WHERE tenant_id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles`,
      [tenantId],
    );
    const ids = (fakeRows as { id: string }[]).map((r) => String(r.id));

    if (!sched) {
      await insertGrowthScheduleIfMissing(
        conn,
        tenantId,
        def.growth_interval_hours_min,
        def.growth_interval_hours_max,
        def.growth_delta_min,
        def.growth_delta_max,
      );
      continue;
    }

    const segH = sched.growth_segment_hours;
    const mode = sched.growth_alloc_mode;
    const { startMs: segStart, endMs: segEnd } = utcSegmentBounds(nowMs, segH);
    const anchorMs = parseMysqlDate(sched.growth_segment_started_at);

    let ticksPlanned = sched.growth_segment_ticks_planned;
    let ticksDone = sched.growth_segment_ticks_done;
    let nextStr: string | null = sched.next_fake_growth_at;

    const needsSegmentReset = anchorMs == null || anchorMs !== segStart || ticksPlanned < 1;
    if (needsSegmentReset) {
      ticksPlanned = resolveTicksPlannedForSegment({
        segmentHours: segH,
        mode,
        ticksMin: sched.growth_ticks_min,
        ticksMax: sched.growth_ticks_max,
      });
      ticksDone = 0;
      nextStr = computeNextTickMysqlUtc({
        segStartMs: segStart,
        segEndMs: segEnd,
        tickIndex: 0,
        ticksPlanned,
        allocMode: mode,
      });
    }

    const persistSegmentOnly = async (): Promise<void> => {
      await conn.query(
        `UPDATE invite_leaderboard_tenant_growth_schedule
         SET growth_segment_started_at = ?,
             growth_segment_ticks_planned = ?,
             growth_segment_ticks_done = ?,
             next_fake_growth_at = ?,
             growth_interval_hours_min = ?,
             growth_interval_hours_max = ?,
             updated_at = NOW(3)
         WHERE tenant_id = ?`,
        [
          mysqlUtcFromMs(segStart),
          ticksPlanned,
          ticksDone,
          nextStr,
          segH,
          segH,
          tenantId,
        ],
      );
    };

    if (!sched.auto_growth_enabled) {
      if (needsSegmentReset) await persistSegmentOnly();
      continue;
    }

    const nextMs = parseMysqlDate(nextStr);
    const due = nextMs == null || nowMs >= nextMs;

    if (!due) {
      if (needsSegmentReset) await persistSegmentOnly();
      continue;
    }

    tenantsEligible++;

    const dMin = Math.min(sched.growth_delta_min, sched.growth_delta_max);
    const dMax = Math.max(sched.growth_delta_min, sched.growth_delta_max);
    const lo = Math.min(dMin, dMax);
    const hi = Math.max(dMin, dMax);
    let evenDelta: number | null = null;
    if (mode === 'even') {
      if (hi <= 0) evenDelta = 0;
      else {
        const mid = Math.floor((lo + hi) / 2);
        evenDelta = Math.max(lo, Math.min(hi, mid));
      }
    }

    const runsPerUser = sched.growth_runs_per_user;
    const expandedIds = runsPerUser <= 1
      ? ids
      : ids.flatMap((id) => Array.from({ length: runsPerUser }, () => id));

    let lastNext = nextStr ?? computeNextTickMysqlUtc({
      segStartMs: segStart,
      segEndMs: segEnd,
      tickIndex: 0,
      ticksPlanned,
      allocMode: mode,
    });

    while (true) {
      const nm = parseMysqlDate(lastNext);
      if (nm != null && nowMs < nm) break;

      if (ticksDone >= ticksPlanned) {
        lastNext = mysqlUtcFromMs(segEnd + 60_000);
        break;
      }

      const k = ticksDone;
      const idsThis = inviteFakeUsersForGrowthTick(tenantId, segStart, k, ticksPlanned, expandedIds);

      for (const id of idsThis) {
        const delta =
          evenDelta !== null
            ? evenDelta
            : dMax <= 0
              ? 0
              : dMin >= dMax
                ? dMax
                : randomIntegerInclusive(lo, hi);
        await conn.query(
          `UPDATE invite_leaderboard_fake_users
           SET auto_increment_count = auto_increment_count + ?,
               growth_cycles = growth_cycles + 1,
               updated_at = NOW(3)
           WHERE tenant_id = ? AND id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles`,
          [delta, tenantId, id],
        );
        rowsUpdated++;
      }

      ticksDone += 1;
      if (ticksDone >= ticksPlanned) {
        lastNext = mysqlUtcFromMs(segEnd + 60_000);
        break;
      }
      lastNext = computeNextTickMysqlUtc({
        segStartMs: segStart,
        segEndMs: segEnd,
        tickIndex: ticksDone,
        ticksPlanned,
        allocMode: mode,
      });
    }

    await conn.query(
      `UPDATE invite_leaderboard_tenant_growth_schedule
       SET last_fake_growth_at = NOW(3),
           next_fake_growth_at = ?,
           growth_segment_started_at = ?,
           growth_segment_ticks_planned = ?,
           growth_segment_ticks_done = ?,
           growth_interval_hours_min = ?,
           growth_interval_hours_max = ?,
           updated_at = NOW(3)
       WHERE tenant_id = ?`,
      [
        lastNext,
        mysqlUtcFromMs(segStart),
        ticksPlanned,
        ticksDone,
        segH,
        segH,
        tenantId,
      ],
    );
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
    '[API] Invite leaderboard fake growth: hourly check; UTC segment + in-segment ticks; fakes bucketed per tick (邀请设置)',
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
