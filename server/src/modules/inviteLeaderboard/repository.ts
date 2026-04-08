import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import { INVITE_LEADERBOARD_SEED_NAMES } from './seedNames.js';

export const INVITE_LEADERBOARD_DEFAULT_GROWTH = {
  growth_segment_hours: 72,
  growth_delta_min: 0,
  growth_delta_max: 3,
  auto_growth_enabled: true,
} as const;

export function mysqlUtcFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 23).replace('T', ' ');
}

export function randomIntegerInclusive(lo: number, hi: number): number {
  const a = Math.min(Math.floor(lo), Math.floor(hi));
  const b = Math.max(Math.floor(lo), Math.floor(hi));
  return a + Math.floor(Math.random() * (b - a + 1));
}

export type InviteLeaderboardGrowthScheduleDto = {
  tenant_id: string;
  last_fake_growth_at: string | null;
  next_fake_growth_at: string | null;
  growth_segment_hours: number;
  growth_segment_started_at: string | null;
  growth_delta_min: number;
  growth_delta_max: number;
  auto_growth_enabled: boolean;
};

function mapGrowthScheduleRow(row: Record<string, unknown>): InviteLeaderboardGrowthScheduleDto {
  return {
    tenant_id: String(row.tenant_id),
    last_fake_growth_at: row.last_fake_growth_at != null ? String(row.last_fake_growth_at) : null,
    next_fake_growth_at: row.next_fake_growth_at != null ? String(row.next_fake_growth_at) : null,
    growth_segment_hours: Math.max(1, Math.min(720, Number(row.growth_segment_hours ?? 72))),
    growth_segment_started_at:
      row.growth_segment_started_at != null ? String(row.growth_segment_started_at) : null,
    growth_delta_min: Math.max(0, Number(row.growth_delta_min ?? 0)),
    growth_delta_max: Math.max(0, Number(row.growth_delta_max ?? 3)),
    auto_growth_enabled: Number(row.auto_growth_enabled ?? 1) !== 0,
  };
}

export function defaultGrowthScheduleDto(tenantId: string): InviteLeaderboardGrowthScheduleDto {
  return {
    tenant_id: tenantId,
    last_fake_growth_at: null,
    next_fake_growth_at: null,
    growth_segment_hours: INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_segment_hours,
    growth_segment_started_at: null,
    growth_delta_min: INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_delta_min,
    growth_delta_max: INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_delta_max,
    auto_growth_enabled: INVITE_LEADERBOARD_DEFAULT_GROWTH.auto_growth_enabled,
  };
}

// ── Fake user CRUD ──

export type InviteFakeUserRow = {
  id: string;
  tenant_id: string;
  name: string;
  base_invite_count: number;
  auto_increment_count: number;
  growth_cycles: number;
  max_growth_cycles: number;
  is_active: number;
  next_growth_at: string | null;
  created_at: string;
  updated_at: string;
};

export function totalInviteCount(row: Pick<InviteFakeUserRow, 'base_invite_count' | 'auto_increment_count'>): number {
  return Number(row.base_invite_count || 0) + Number(row.auto_increment_count || 0);
}

export async function listFakeUsersForTenant(tenantId: string): Promise<InviteFakeUserRow[]> {
  return query<InviteFakeUserRow>(
    `SELECT id, tenant_id, name, base_invite_count, auto_increment_count, growth_cycles, max_growth_cycles,
            is_active, next_growth_at, created_at, updated_at
     FROM invite_leaderboard_fake_users
     WHERE tenant_id = ?
     ORDER BY (base_invite_count + auto_increment_count) DESC, updated_at DESC, name ASC`,
    [tenantId],
  );
}

export async function getFakeUser(tenantId: string, id: string): Promise<InviteFakeUserRow | null> {
  return queryOne<InviteFakeUserRow>(
    `SELECT id, tenant_id, name, base_invite_count, auto_increment_count, growth_cycles, max_growth_cycles,
            is_active, next_growth_at, created_at, updated_at
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

export async function resetFakeUserGrowth(tenantId: string, id: string): Promise<boolean> {
  const res = await execute(
    `UPDATE invite_leaderboard_fake_users
     SET growth_cycles = 0, auto_increment_count = 0, next_growth_at = NULL, last_auto_growth_at = NULL, updated_at = NOW(3)
     WHERE tenant_id = ? AND id = ?`,
    [tenantId, id],
  );
  return res.affectedRows > 0;
}

export async function clearAutoIncrementOnly(tenantId: string, id: string): Promise<boolean> {
  return resetFakeUserGrowth(tenantId, id);
}

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
      const segH = INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_segment_hours;
      const dLo = INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_delta_min;
      const dHi = INVITE_LEADERBOARD_DEFAULT_GROWTH.growth_delta_max;
      await conn.query(
        `INSERT INTO invite_leaderboard_tenant_growth_schedule
         (tenant_id, growth_segment_hours, growth_delta_min, growth_delta_max, auto_growth_enabled, updated_at)
         VALUES (?, ?, ?, ?, 1, NOW(3))
         ON DUPLICATE KEY UPDATE
           growth_segment_hours = VALUES(growth_segment_hours),
           growth_delta_min = VALUES(growth_delta_min),
           growth_delta_max = VALUES(growth_delta_max),
           auto_growth_enabled = 1,
           updated_at = NOW(3)`,
        [tenantId, segH, dLo, dHi],
      );
    }
    return { inserted };
  });
}

// ── Merged ranking ──

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

// ── Growth schedule read/write ──

export async function getTenantGrowthScheduleFull(
  tenantId: string,
): Promise<InviteLeaderboardGrowthScheduleDto | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT tenant_id, last_fake_growth_at, next_fake_growth_at,
            growth_segment_hours, growth_segment_started_at,
            growth_delta_min, growth_delta_max, auto_growth_enabled
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

function clampDelta(dMin: number, dMax: number): { dMin: number; dMax: number } {
  let diMin = Math.max(0, Math.min(100, Math.floor(dMin)));
  let diMax = Math.max(0, Math.min(100, Math.floor(dMax)));
  if (diMin > diMax) [diMin, diMax] = [diMax, diMin];
  return { dMin: diMin, dMax: diMax };
}

export async function upsertInviteLeaderboardGrowthSettings(
  tenantId: string,
  patch: Partial<{
    auto_growth_enabled: boolean;
    growth_segment_hours: number;
    growth_delta_min: number;
    growth_delta_max: number;
  }>,
): Promise<InviteLeaderboardGrowthScheduleDto> {
  const cur = (await getTenantGrowthScheduleFull(tenantId)) ?? defaultGrowthScheduleDto(tenantId);
  const auto = patch.auto_growth_enabled ?? cur.auto_growth_enabled;
  const segH = patch.growth_segment_hours != null
    ? Math.max(1, Math.min(720, Math.floor(Number(patch.growth_segment_hours))))
    : cur.growth_segment_hours;
  const c = clampDelta(patch.growth_delta_min ?? cur.growth_delta_min, patch.growth_delta_max ?? cur.growth_delta_max);

  await execute(
    `INSERT INTO invite_leaderboard_tenant_growth_schedule
     (tenant_id, growth_segment_hours, growth_delta_min, growth_delta_max, auto_growth_enabled,
      growth_segment_started_at, next_fake_growth_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NOW(3))
     ON DUPLICATE KEY UPDATE
       growth_segment_hours = VALUES(growth_segment_hours),
       growth_delta_min = VALUES(growth_delta_min),
       growth_delta_max = VALUES(growth_delta_max),
       auto_growth_enabled = VALUES(auto_growth_enabled),
       updated_at = NOW(3)`,
    [tenantId, segH, c.dMin, c.dMax, auto ? 1 : 0],
  );

  const after = await getTenantGrowthScheduleFull(tenantId);
  return after ?? defaultGrowthScheduleDto(tenantId);
}

/**
 * Explicitly reset the current growth cycle for a tenant.
 * Clears per-user schedules so the next job run starts a fresh cycle.
 */
export async function resetGrowthCycleForTenant(tenantId: string): Promise<InviteLeaderboardGrowthScheduleDto> {
  await execute(
    `UPDATE invite_leaderboard_tenant_growth_schedule
     SET growth_segment_started_at = NULL, next_fake_growth_at = NULL, updated_at = NOW(3)
     WHERE tenant_id = ?`,
    [tenantId],
  );
  await execute(
    `UPDATE invite_leaderboard_fake_users SET next_growth_at = NULL, last_auto_growth_at = NULL WHERE tenant_id = ?`,
    [tenantId],
  );
  const after = await getTenantGrowthScheduleFull(tenantId);
  return after ?? defaultGrowthScheduleDto(tenantId);
}

// ── Job run audit ──

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
            is_active, next_growth_at, created_at, updated_at
     FROM invite_leaderboard_fake_users
     WHERE tenant_id = ? AND is_active = 1 AND growth_cycles < max_growth_cycles`,
    [tenantId],
  );
}
