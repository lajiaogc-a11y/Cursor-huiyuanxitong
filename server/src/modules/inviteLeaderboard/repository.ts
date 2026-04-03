import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import { INVITE_LEADERBOARD_SEED_NAMES } from './seedNames.js';

/** 邀请榜假用户自动增长默认：12h 一段、段内随机时刻与分桶；每行增量 +1～+3（随机模式每行独立随机，均分模式每行相同） */
export const INVITE_LEADERBOARD_DEFAULT_GROWTH = {
  growth_segment_hours: 12,
  growth_alloc_mode: 'random' as const,
  growth_interval_hours_min: 72,
  growth_interval_hours_max: 84,
  growth_delta_min: 1,
  growth_delta_max: 3,
  auto_growth_enabled: true,
} as const;

export type InviteLeaderboardGrowthAllocMode = 'random' | 'even';

export function mysqlUtcFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 23).replace('T', ' ');
}

export function utcSegmentBounds(nowMs: number, segmentHours: number): { startMs: number; endMs: number } {
  const h = Math.max(1, Math.floor(segmentHours));
  const segMs = h * 3600 * 1000;
  const startMs = Math.floor(nowMs / segMs) * segMs;
  return { startMs, endMs: startMs + segMs };
}

export function parseGrowthAllocMode(v: unknown): InviteLeaderboardGrowthAllocMode {
  const s = String(v ?? '').toLowerCase();
  return s === 'even' ? 'even' : 'random';
}

export function planTicksPlanned(segmentHours: number, mode: InviteLeaderboardGrowthAllocMode): number {
  const h = Math.max(1, Math.min(168, Math.floor(segmentHours)));
  if (mode === 'even') {
    return Math.max(4, Math.min(24, h));
  }
  return randomIntegerInclusive(6, Math.max(6, Math.min(12, h * 2)));
}

/**
 * 本周期计划跑几批（tick 数）。
 * - 若 growth_ticks_min / max 均已配置：每进入新周期在 [min,max] 内随机取一批次数（上限 72）。
 * - 否则沿用 planTicksPlanned（按段长与均分/随机模式推算）。
 */
export function resolveTicksPlannedForSegment(opts: {
  segmentHours: number;
  mode: InviteLeaderboardGrowthAllocMode;
  ticksMin: number | null;
  ticksMax: number | null;
}): number {
  const a =
    opts.ticksMin != null && Number.isFinite(opts.ticksMin) ? Math.floor(Number(opts.ticksMin)) : null;
  const b =
    opts.ticksMax != null && Number.isFinite(opts.ticksMax) ? Math.floor(Number(opts.ticksMax)) : null;
  if (a != null && b != null && a >= 1 && b >= 1) {
    const lo = Math.max(1, Math.min(72, Math.min(a, b)));
    const hi = Math.max(1, Math.min(72, Math.max(a, b)));
    return randomIntegerInclusive(lo, hi);
  }
  return planTicksPlanned(opts.segmentHours, opts.mode);
}

function hashStringToUint32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeSeededRng(seedU32: number): () => number {
  let s = seedU32 >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** T 个正整数（或前 n 个为 1）之和为 n，用于把假用户拆成各批人数 */
function randomBatchSizes(n: number, T: number, rnd: () => number): number[] {
  const ticks = Math.max(1, Math.floor(T));
  if (ticks === 1) return [n];
  if (n <= 0) return Array(ticks).fill(0);
  if (n < ticks) {
    const sizes = Array(ticks).fill(0);
    for (let i = 0; i < n; i++) sizes[i] = 1;
    return sizes;
  }
  const pool = Array.from({ length: n - 1 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const cuts = pool.slice(0, ticks - 1).sort((x, y) => x - y);
  const sizes: number[] = [];
  let prev = 0;
  for (const c of cuts) {
    sizes.push(c - prev);
    prev = c;
  }
  sizes.push(n - prev);
  return sizes;
}

/**
 * 单个周期内：同一批假用户只会在某一个 tick 增长一次。
 * 每周期开始用 tenantId+段起点+批次数 做种子，打乱用户并随机拆成各批人数（如 5、8、12…之和为总人数）。
 */
export function inviteFakeUsersForGrowthTick(
  tenantId: string,
  segStartMs: number,
  tickIndex: number,
  ticksPlanned: number,
  sortedUserIds: string[],
): string[] {
  const T = Math.max(1, Math.floor(ticksPlanned));
  const k = Math.max(0, Math.min(T - 1, Math.floor(tickIndex)));
  const n = sortedUserIds.length;
  if (n === 0) return [];
  const seed = hashStringToUint32(`${tenantId}:${segStartMs}:${T}`);
  const rnd = makeSeededRng(seed);
  const shuffled = [...sortedUserIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const sizes = randomBatchSizes(n, T, rnd);
  let offset = 0;
  for (let t = 0; t < k; t++) offset += sizes[t] ?? 0;
  const sz = sizes[k] ?? 0;
  return shuffled.slice(offset, offset + sz);
}

/** @deprecated 已由 inviteFakeUsersForGrowthTick（随机分批人数）替代；保留以免外部引用报错 */
export function inviteFakeUserGrowthBucket(fakeUserId: string, segStartMs: number, ticksPlanned: number): number {
  const t = Math.max(1, Math.floor(ticksPlanned));
  const s = `${fakeUserId}:${segStartMs}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0) % t;
}

/** 段内第 tickIndex 次执行的 UTC 计划时刻（tickIndex ∈ [0, ticksPlanned)） */
export function computeNextTickMysqlUtc(opts: {
  segStartMs: number;
  segEndMs: number;
  tickIndex: number;
  ticksPlanned: number;
  allocMode: InviteLeaderboardGrowthAllocMode;
}): string {
  const { segStartMs, segEndMs, tickIndex, ticksPlanned, allocMode } = opts;
  const n = Math.max(1, Math.floor(ticksPlanned));
  const k = Math.max(0, Math.min(n - 1, Math.floor(tickIndex)));
  const segMs = Math.max(1, segEndMs - segStartMs);
  const slot = segMs / n;
  const bucketStart = segStartMs + k * slot;
  const span = Math.max(0, Math.floor(Math.min(slot * 0.9, segEndMs - bucketStart - 1)));
  let tMs: number;
  if (allocMode === 'even') {
    tMs = Math.floor(bucketStart + Math.min(slot / 2, segEndMs - bucketStart - 1));
  } else {
    tMs = bucketStart + (span > 0 ? randomIntegerInclusive(0, span) : 0);
  }
  if (tMs >= segEndMs) tMs = segEndMs - 1;
  if (tMs < bucketStart) tMs = bucketStart;
  return mysqlUtcFromMs(tMs);
}

export type InviteLeaderboardGrowthScheduleDto = {
  tenant_id: string;
  last_fake_growth_at: string | null;
  next_fake_growth_at: string | null;
  growth_segment_hours: number;
  growth_alloc_mode: InviteLeaderboardGrowthAllocMode;
  growth_segment_started_at: string | null;
  growth_segment_ticks_planned: number;
  growth_segment_ticks_done: number;
  /** 每周期批次数下限（含）；与 growth_ticks_max 均非空时覆盖自动推算 */
  growth_ticks_min: number | null;
  /** 每周期批次数上限（含） */
  growth_ticks_max: number | null;
  growth_interval_hours_min: number;
  growth_interval_hours_max: number;
  growth_delta_min: number;
  growth_delta_max: number;
  auto_growth_enabled: boolean;
  /** 每个周期内每个假用户最多执行几次增长（默认 1） */
  growth_runs_per_user: number;
};

export function randomIntegerInclusive(lo: number, hi: number): number {
  const a = Math.min(Math.floor(lo), Math.floor(hi));
  const b = Math.max(Math.floor(lo), Math.floor(hi));
  return a + Math.floor(Math.random() * (b - a + 1));
}

export function hoursFromNowMysqlUtc(hours: number): string {
  const d = new Date(Date.now() + hours * 3600 * 1000);
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

/** 当前时间起，在 [hMin,hMax] 小时内随机取整点间隔后的 UTC 时间串（写入 MySQL DATETIME(3)） */
export function randomNextGrowthMysqlUtc(hMin: number, hMax: number): string {
  return hoursFromNowMysqlUtc(randomIntegerInclusive(hMin, hMax));
}

function mapGrowthScheduleRow(row: Record<string, unknown>): InviteLeaderboardGrowthScheduleDto {
  const segH = Math.max(1, Math.min(168, Number(row.growth_segment_hours ?? 12)));
  return {
    tenant_id: String(row.tenant_id),
    last_fake_growth_at: row.last_fake_growth_at != null ? String(row.last_fake_growth_at) : null,
    next_fake_growth_at: row.next_fake_growth_at != null ? String(row.next_fake_growth_at) : null,
    growth_segment_hours: segH,
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
    growth_interval_hours_min: Math.max(1, Number(row.growth_interval_hours_min ?? 72)),
    growth_interval_hours_max: Math.max(1, Number(row.growth_interval_hours_max ?? 84)),
    growth_delta_min: Math.max(0, Number(row.growth_delta_min ?? 1)),
    growth_delta_max: Math.max(0, Number(row.growth_delta_max ?? 3)),
    auto_growth_enabled: Number(row.auto_growth_enabled ?? 1) !== 0,
    growth_runs_per_user: Math.max(1, Math.min(10, Math.floor(Number(row.growth_runs_per_user ?? 1)))),
  };
}

export function defaultGrowthScheduleDto(tenantId: string): InviteLeaderboardGrowthScheduleDto {
  return {
    tenant_id: tenantId,
    last_fake_growth_at: null,
    next_fake_growth_at: null,
    growth_segment_hours: INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_segment_hours,
    growth_alloc_mode: INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_alloc_mode,
    growth_segment_started_at: null,
    growth_segment_ticks_planned: 0,
    growth_segment_ticks_done: 0,
    growth_ticks_min: null,
    growth_ticks_max: null,
    growth_interval_hours_min: INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_interval_hours_min,
    growth_interval_hours_max: INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_interval_hours_max,
    growth_delta_min: INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_delta_min,
    growth_delta_max: INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_delta_max,
    auto_growth_enabled: INVITE_LEADERBOARD_DEFAULT_GROWTH.auto_growth_enabled,
    growth_runs_per_user: 1,
  };
}

export type InviteFakeUserRow = {
  id: string;
  tenant_id: string;
  name: string;
  base_invite_count: number;
  auto_increment_count: number;
  growth_cycles: number;
  max_growth_cycles: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export function totalInviteCount(row: Pick<InviteFakeUserRow, 'base_invite_count' | 'auto_increment_count'>): number {
  return Number(row.base_invite_count || 0) + Number(row.auto_increment_count || 0);
}

export async function listFakeUsersForTenant(tenantId: string): Promise<InviteFakeUserRow[]> {
  return query<InviteFakeUserRow>(
    `SELECT id, tenant_id, name, base_invite_count, auto_increment_count, growth_cycles, max_growth_cycles,
            is_active, created_at, updated_at
     FROM invite_leaderboard_fake_users
     WHERE tenant_id = ?
     ORDER BY (base_invite_count + auto_increment_count) DESC, updated_at DESC, name ASC`,
    [tenantId],
  );
}

export async function getFakeUser(tenantId: string, id: string): Promise<InviteFakeUserRow | null> {
  return queryOne<InviteFakeUserRow>(
    `SELECT id, tenant_id, name, base_invite_count, auto_increment_count, growth_cycles, max_growth_cycles,
            is_active, created_at, updated_at
     FROM invite_leaderboard_fake_users WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id],
  );
}

export async function countFakeUsersForTenant(tenantId: string): Promise<number> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM invite_leaderboard_fake_users WHERE tenant_id = ?`,
    [tenantId],
  );
  return Number(r?.c ?? 0);
}

export async function updateFakeUserBaseFields(
  tenantId: string,
  id: string,
  patch: { name?: string; base_invite_count?: number },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name != null) {
    sets.push('name = ?');
    params.push(String(patch.name).trim().slice(0, 128));
  }
  if (patch.base_invite_count != null) {
    sets.push('base_invite_count = ?');
    params.push(Math.max(0, Math.floor(Number(patch.base_invite_count))));
  }
  if (!sets.length) return true;
  params.push(tenantId, id);
  const res = await execute(
    `UPDATE invite_leaderboard_fake_users SET ${sets.join(', ')}, updated_at = NOW(3) WHERE tenant_id = ? AND id = ?`,
    params,
  );
  return res.affectedRows > 0;
}

export async function setFakeUserActive(tenantId: string, id: string, isActive: boolean): Promise<boolean> {
  const res = await execute(
    `UPDATE invite_leaderboard_fake_users SET is_active = ?, updated_at = NOW(3) WHERE tenant_id = ? AND id = ?`,
    [isActive ? 1 : 0, tenantId, id],
  );
  return res.affectedRows > 0;
}

/** 重置增长：growth_cycles=0, auto_increment_count=0（不动 base） */
export async function resetFakeUserGrowth(tenantId: string, id: string): Promise<boolean> {
  const res = await execute(
    `UPDATE invite_leaderboard_fake_users
     SET growth_cycles = 0, auto_increment_count = 0, updated_at = NOW(3)
     WHERE tenant_id = ? AND id = ?`,
    [tenantId, id],
  );
  return res.affectedRows > 0;
}

/** 仅清空自动增长累计，保留 growth_cycles 语义：用户要求可「清空自动增长次数后重新开始」— 同时归零 cycles */
export async function clearAutoIncrementOnly(tenantId: string, id: string): Promise<boolean> {
  return resetFakeUserGrowth(tenantId, id);
}

/** 删除本租户全部假用户及增长调度行（与「替换初始化」一致，不插入新数据） */
export async function deleteAllFakeUsersForTenant(tenantId: string): Promise<number> {
  return withTransaction(async (conn) => {
    await conn.query(`DELETE FROM invite_leaderboard_tenant_growth_schedule WHERE tenant_id = ?`, [tenantId]);
    const [res] = await conn.query<import('mysql2').ResultSetHeader>(
      `DELETE FROM invite_leaderboard_fake_users WHERE tenant_id = ?`,
      [tenantId],
    );
    return Number(res.affectedRows ?? 0);
  });
}

/** 将每条假用户的 base_invite_count 独立随机为 [minBase, maxBase] 区间内的整数（含端点） */
export async function randomizeBaseInviteCountsForTenant(
  tenantId: string,
  minBase: number,
  maxBase: number,
): Promise<number> {
  const lo = Math.max(0, Math.floor(Number(minBase)));
  const hi = Math.max(lo, Math.floor(Number(maxBase)));
  const span = hi - lo + 1;
  const res = await execute(
    `UPDATE invite_leaderboard_fake_users
     SET base_invite_count = FLOOR(? + RAND() * ?),
         updated_at = NOW(3)
     WHERE tenant_id = ?`,
    [lo, span, tenantId],
  );
  return Number(res.affectedRows ?? 0);
}

export async function seedFiftyFakeUsers(tenantId: string, replace: boolean): Promise<{ inserted: number }> {
  return withTransaction(async (conn) => {
    if (replace) {
      await conn.query(`DELETE FROM invite_leaderboard_fake_users WHERE tenant_id = ?`, [tenantId]);
      await conn.query(`DELETE FROM invite_leaderboard_tenant_growth_schedule WHERE tenant_id = ?`, [tenantId]);
    } else {
      const [countRows] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS c FROM invite_leaderboard_fake_users WHERE tenant_id = ?`,
        [tenantId],
      );
      const c = Number((countRows[0] as { c?: number })?.c ?? 0);
      if (c > 0) {
        return { inserted: 0 };
      }
    }

    const names = INVITE_LEADERBOARD_SEED_NAMES.slice(0, 50);
    let inserted = 0;
    for (let i = 0; i < names.length; i++) {
      const id = randomUUID();
      const name = names[i]!;
      const base = 6 + ((i * 17) % 55);
      await conn.query(
        `INSERT INTO invite_leaderboard_fake_users
         (id, tenant_id, name, base_invite_count, auto_increment_count, growth_cycles, max_growth_cycles, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, 30, 1, NOW(3), NOW(3))`,
        [id, tenantId, name, base],
      );
      inserted++;
    }
    if (inserted > 0) {
      const nowMs = Date.now();
      const segH = INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_segment_hours;
      const mode = INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_alloc_mode;
      const { startMs, endMs } = utcSegmentBounds(nowMs, segH);
      const ticksPlanned = resolveTicksPlannedForSegment({
        segmentHours: segH,
        mode,
        ticksMin: null,
        ticksMax: null,
      });
      const nextAt = computeNextTickMysqlUtc({
        segStartMs: startMs,
        segEndMs: endMs,
        tickIndex: 0,
        ticksPlanned,
        allocMode: mode,
      });
      const segStartStr = mysqlUtcFromMs(startMs);
      const dLo = INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_delta_min;
      const dHi = INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_delta_max;
      await conn.query(
        `INSERT INTO invite_leaderboard_tenant_growth_schedule
         (tenant_id, last_fake_growth_at, next_fake_growth_at,
          growth_segment_hours, growth_alloc_mode, growth_segment_started_at,
          growth_segment_ticks_planned, growth_segment_ticks_done,
          growth_ticks_min, growth_ticks_max,
          growth_interval_hours_min, growth_interval_hours_max, growth_delta_min, growth_delta_max, auto_growth_enabled, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, ?, ?, 1, NOW(3))
         ON DUPLICATE KEY UPDATE
           next_fake_growth_at = VALUES(next_fake_growth_at),
           growth_segment_hours = VALUES(growth_segment_hours),
           growth_alloc_mode = VALUES(growth_alloc_mode),
           growth_segment_started_at = VALUES(growth_segment_started_at),
           growth_segment_ticks_planned = VALUES(growth_segment_ticks_planned),
           growth_segment_ticks_done = VALUES(growth_segment_ticks_done),
           growth_interval_hours_min = VALUES(growth_interval_hours_min),
           growth_interval_hours_max = VALUES(growth_interval_hours_max),
           growth_delta_min = VALUES(growth_delta_min),
           growth_delta_max = VALUES(growth_delta_max),
           auto_growth_enabled = 1,
           updated_at = NOW(3)`,
        [tenantId, nextAt, segH, mode, segStartStr, ticksPlanned, segH, segH, dLo, dHi],
      );
    }
    return { inserted };
  });
}

export type MergedRankRow = {
  kind: 'real' | 'fake';
  id: string;
  display_name: string;
  invite_count: number;
  sort_ts: string;
};

export async function queryMergedRankingCandidates(tenantId: string): Promise<MergedRankRow[]> {
  return query<MergedRankRow>(
    `SELECT kind, id, display_name, invite_count, sort_ts FROM (
       SELECT 'fake' AS kind, f.id,
              f.name AS display_name,
              (f.base_invite_count + f.auto_increment_count) AS invite_count,
              f.updated_at AS sort_ts
       FROM invite_leaderboard_fake_users f
       WHERE f.tenant_id = ? AND f.is_active = 1
       UNION ALL
       SELECT 'real' AS kind, m.id,
              COALESCE(NULLIF(TRIM(m.nickname), ''), NULLIF(TRIM(m.member_code), ''), 'Member') AS display_name,
              m.invite_count AS invite_count,
              m.updated_at AS sort_ts
       FROM members m
       WHERE m.tenant_id <=> ? AND m.invite_count > 0
         AND (m.is_deleted IS NULL OR m.is_deleted = 0)
         AND (m.status IS NULL OR m.status = '' OR LOWER(m.status) = 'active')
     ) x
     ORDER BY invite_count DESC, sort_ts DESC, display_name ASC`,
    [tenantId, tenantId],
  );
}

export async function listTenantIdsWithActiveFakes(): Promise<string[]> {
  const rows = await query<{ tenant_id: string }>(
    `SELECT DISTINCT tenant_id FROM invite_leaderboard_fake_users WHERE is_active = 1`,
  );
  return rows.map((r) => String(r.tenant_id));
}

export async function getTenantGrowthSchedule(tenantId: string): Promise<{ last_fake_growth_at: string | null } | null> {
  const full = await getTenantGrowthScheduleFull(tenantId);
  if (!full) return null;
  return { last_fake_growth_at: full.last_fake_growth_at };
}

export async function getTenantGrowthScheduleFull(
  tenantId: string,
): Promise<InviteLeaderboardGrowthScheduleDto | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT tenant_id, last_fake_growth_at, next_fake_growth_at,
            growth_segment_hours, growth_alloc_mode, growth_segment_started_at,
            growth_segment_ticks_planned, growth_segment_ticks_done,
            growth_ticks_min, growth_ticks_max,
            growth_interval_hours_min, growth_interval_hours_max,
            growth_delta_min, growth_delta_max, auto_growth_enabled,
            growth_runs_per_user
     FROM invite_leaderboard_tenant_growth_schedule WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  if (!row) return null;
  return mapGrowthScheduleRow(row);
}

export async function getGrowthSettingsMerged(tenantId: string): Promise<InviteLeaderboardGrowthScheduleDto> {
  const row = await getTenantGrowthScheduleFull(tenantId);
  return row ?? defaultGrowthScheduleDto(tenantId);
}

function clampGrowthIntervals(
  hMin: number,
  hMax: number,
  dMin: number,
  dMax: number,
): { hMin: number; hMax: number; dMin: number; dMax: number } {
  let hiMin = Math.max(1, Math.min(8760, Math.floor(hMin)));
  let hiMax = Math.max(1, Math.min(8760, Math.floor(hMax)));
  if (hiMin > hiMax) [hiMin, hiMax] = [hiMax, hiMin];
  let diMin = Math.max(0, Math.min(100, Math.floor(dMin)));
  let diMax = Math.max(0, Math.min(100, Math.floor(dMax)));
  if (diMin > diMax) [diMin, diMax] = [diMax, diMin];
  return { hMin: hiMin, hMax: hiMax, dMin: diMin, dMax: diMax };
}

/**
 * 保存邀请榜增长策略；重置当前 UTC 时间段的 tick 计划，并写入段内第一次执行时刻；不改动 last_fake_growth_at。
 */
export async function upsertInviteLeaderboardGrowthSettings(
  tenantId: string,
  patch: Partial<{
    auto_growth_enabled: boolean;
    growth_segment_hours: number;
    growth_alloc_mode: InviteLeaderboardGrowthAllocMode | string;
    growth_interval_hours_min: number;
    growth_interval_hours_max: number;
    growth_delta_min: number;
    growth_delta_max: number;
    /** true：改回系统按段长自动推算批次数 */
    growth_ticks_use_auto: boolean;
    growth_ticks_min: number | null;
    growth_ticks_max: number | null;
    growth_runs_per_user: number;
  }>,
): Promise<InviteLeaderboardGrowthScheduleDto> {
  const cur = (await getTenantGrowthScheduleFull(tenantId)) ?? defaultGrowthScheduleDto(tenantId);
  const auto = patch.auto_growth_enabled ?? cur.auto_growth_enabled;
  let segH =
    patch.growth_segment_hours != null
      ? Math.max(1, Math.min(168, Math.floor(Number(patch.growth_segment_hours))))
      : cur.growth_segment_hours;
  const mode =
    patch.growth_alloc_mode != null ? parseGrowthAllocMode(patch.growth_alloc_mode) : cur.growth_alloc_mode;
  let dMin = patch.growth_delta_min ?? cur.growth_delta_min;
  let dMax = patch.growth_delta_max ?? cur.growth_delta_max;
  const c = clampGrowthIntervals(segH, segH, dMin, dMax);
  dMin = c.dMin;
  dMax = c.dMax;
  segH = c.hMin;

  let ticksMin: number | null = cur.growth_ticks_min;
  let ticksMax: number | null = cur.growth_ticks_max;
  if (patch.growth_ticks_use_auto === true) {
    ticksMin = null;
    ticksMax = null;
  } else {
    if (patch.growth_ticks_min !== undefined) {
      ticksMin =
        patch.growth_ticks_min === null
          ? null
          : Math.max(1, Math.min(72, Math.floor(Number(patch.growth_ticks_min))));
    }
    if (patch.growth_ticks_max !== undefined) {
      ticksMax =
        patch.growth_ticks_max === null
          ? null
          : Math.max(1, Math.min(72, Math.floor(Number(patch.growth_ticks_max))));
    }
  }
  if (ticksMin == null || ticksMax == null) {
    ticksMin = null;
    ticksMax = null;
  }

  const runsPerUser = Math.max(1, Math.min(10, Math.floor(Number(patch.growth_runs_per_user ?? cur.growth_runs_per_user ?? 1))));

  const nowMs = Date.now();
  const { startMs, endMs } = utcSegmentBounds(nowMs, segH);
  const ticksPlanned = resolveTicksPlannedForSegment({
    segmentHours: segH,
    mode,
    ticksMin,
    ticksMax,
  });
  const nextAt = computeNextTickMysqlUtc({
    segStartMs: startMs,
    segEndMs: endMs,
    tickIndex: 0,
    ticksPlanned,
    allocMode: mode,
  });
  const segStartStr = mysqlUtcFromMs(startMs);

  await execute(
    `INSERT INTO invite_leaderboard_tenant_growth_schedule
     (tenant_id, last_fake_growth_at, next_fake_growth_at,
      growth_segment_hours, growth_alloc_mode, growth_segment_started_at,
      growth_segment_ticks_planned, growth_segment_ticks_done,
      growth_ticks_min, growth_ticks_max,
      growth_interval_hours_min, growth_interval_hours_max, growth_delta_min, growth_delta_max, auto_growth_enabled, growth_runs_per_user, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
       next_fake_growth_at = VALUES(next_fake_growth_at),
       growth_segment_hours = VALUES(growth_segment_hours),
       growth_alloc_mode = VALUES(growth_alloc_mode),
       growth_segment_started_at = VALUES(growth_segment_started_at),
       growth_segment_ticks_planned = VALUES(growth_segment_ticks_planned),
       growth_segment_ticks_done = 0,
       growth_ticks_min = VALUES(growth_ticks_min),
       growth_ticks_max = VALUES(growth_ticks_max),
       growth_interval_hours_min = VALUES(growth_interval_hours_min),
       growth_interval_hours_max = VALUES(growth_interval_hours_max),
       growth_delta_min = VALUES(growth_delta_min),
       growth_delta_max = VALUES(growth_delta_max),
       auto_growth_enabled = VALUES(auto_growth_enabled),
       growth_runs_per_user = VALUES(growth_runs_per_user),
       updated_at = NOW(3)`,
    [
      tenantId,
      nextAt,
      segH,
      mode,
      segStartStr,
      ticksPlanned,
      ticksMin,
      ticksMax,
      segH,
      segH,
      dMin,
      dMax,
      auto ? 1 : 0,
      runsPerUser,
    ],
  );
  const after = await getTenantGrowthScheduleFull(tenantId);
  return (
    after ?? {
      ...defaultGrowthScheduleDto(tenantId),
      growth_segment_hours: segH,
      growth_alloc_mode: mode,
      growth_segment_started_at: segStartStr,
      growth_segment_ticks_planned: ticksPlanned,
      growth_segment_ticks_done: 0,
      growth_ticks_min: ticksMin,
      growth_ticks_max: ticksMax,
      growth_interval_hours_min: segH,
      growth_interval_hours_max: segH,
      growth_delta_min: dMin,
      growth_delta_max: dMax,
      auto_growth_enabled: auto,
      growth_runs_per_user: runsPerUser,
      next_fake_growth_at: nextAt,
    }
  );
}

/** 事务内：无调度行时插入，按默认段长与模式初始化当前 UTC 段与首次 tick */
export async function insertGrowthScheduleIfMissing(
  conn: PoolConnection,
  tenantId: string,
  _hMin: number,
  _hMax: number,
  dMin: number,
  dMax: number,
): Promise<void> {
  const [existing] = await conn.query<RowDataPacket[]>(
    `SELECT 1 FROM invite_leaderboard_tenant_growth_schedule WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  if (Array.isArray(existing) && existing.length > 0) return;
  const c = clampGrowthIntervals(
    INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_segment_hours,
    INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_segment_hours,
    dMin,
    dMax,
  );
  const nowMs = Date.now();
  const segH = c.hMin;
  const mode = INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_alloc_mode;
  const { startMs, endMs } = utcSegmentBounds(nowMs, segH);
  const ticksPlanned = resolveTicksPlannedForSegment({
    segmentHours: segH,
    mode,
    ticksMin: null,
    ticksMax: null,
  });
  const nextAt = computeNextTickMysqlUtc({
    segStartMs: startMs,
    segEndMs: endMs,
    tickIndex: 0,
    ticksPlanned,
    allocMode: mode,
  });
  const segStartStr = mysqlUtcFromMs(startMs);
  await conn.query(
    `INSERT INTO invite_leaderboard_tenant_growth_schedule
     (tenant_id, last_fake_growth_at, next_fake_growth_at,
      growth_segment_hours, growth_alloc_mode, growth_segment_started_at,
      growth_segment_ticks_planned, growth_segment_ticks_done,
      growth_ticks_min, growth_ticks_max,
      growth_interval_hours_min, growth_interval_hours_max, growth_delta_min, growth_delta_max, auto_growth_enabled, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, ?, ?, 1, NOW(3))`,
    [tenantId, nextAt, segH, mode, segStartStr, ticksPlanned, segH, segH, c.dMin, c.dMax],
  );
}

export async function insertJobRunStart(id: string): Promise<void> {
  await execute(
    `INSERT INTO invite_leaderboard_job_runs (id, started_at, tenants_eligible, tenants_processed, fake_rows_updated, message)
     VALUES (?, NOW(3), 0, 0, 0, 'running')`,
    [id],
  );
}

export async function finishJobRun(
  id: string,
  patch: { tenants_eligible: number; tenants_processed: number; fake_rows_updated: number; message: string },
): Promise<void> {
  await execute(
    `UPDATE invite_leaderboard_job_runs
     SET finished_at = NOW(3), tenants_eligible = ?, tenants_processed = ?, fake_rows_updated = ?, message = ?
     WHERE id = ?`,
    [patch.tenants_eligible, patch.tenants_processed, patch.fake_rows_updated, patch.message.slice(0, 512), id],
  );
}

export async function listActiveFakesEligibleForGrowth(tenantId: string): Promise<InviteFakeUserRow[]> {
  return query<InviteFakeUserRow>(
    `SELECT id, tenant_id, name, base_invite_count, auto_increment_count, growth_cycles, max_growth_cycles,
            is_active, created_at, updated_at
     FROM invite_leaderboard_fake_users
     WHERE tenant_id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles`,
    [tenantId],
  );
}

export async function applyOneGrowthCycle(
  tenantId: string,
  userId: string,
  delta: number,
): Promise<void> {
  await execute(
    `UPDATE invite_leaderboard_fake_users
     SET auto_increment_count = auto_increment_count + ?,
         growth_cycles = growth_cycles + 1,
         updated_at = NOW(3)
     WHERE tenant_id = ? AND id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles`,
    [delta, tenantId, userId],
  );
}
