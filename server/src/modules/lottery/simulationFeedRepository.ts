/**
 * 抽奖模拟滚动：独立表 lottery_simulation_feed，与 lottery_logs 无关。
 */
import { randomUUID } from 'node:crypto';
import { execute, query, queryOne } from '../../database/index.js';

export type SimulationFeedSource = 'cron_fake' | 'member_sim';

export type SimulationSettingsResolved = {
  retention_days: number;
  /** 每个假用户每小时模拟抽奖次数（该租户本小时总调度 = 假人数 × 本值；≤20） */
  cron_fake_draws_per_hour: number;
  /** 进入滚动展示的奖品排序名次区间（与后台奖品 sort_order 排名一致，1=最高） */
  sim_feed_rank_min: number;
  sim_feed_rank_max: number;
  enable_cron_fake_feed: boolean;
  /** 非空时按「锚点起每整点小时」轮询；空且开启自动生成时走上海时区整点 */
  cron_fake_anchor_at: string | null;
};

function rowToAnchorIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** 每个假人每小时最多调度次数（总次数 = 池人数 × 本值） */
export const MAX_CRON_FAKE_DRAWS_PER_FAKE_PER_HOUR = 20;

function clampDrawsPerFakePerHour(n: number): number {
  return Math.max(0, Math.min(MAX_CRON_FAKE_DRAWS_PER_FAKE_PER_HOUR, Math.floor(Number(n) || 0)));
}

function clampFeedRank(n: number): number {
  return Math.max(1, Math.min(8, Math.floor(Number(n) || 1)));
}

function normalizeRankPair(min: number, max: number): { min: number; max: number } {
  let a = clampFeedRank(min);
  let b = clampFeedRank(max);
  if (a > b) [a, b] = [b, a];
  return { min: a, max: b };
}

export async function getSimulationSettingsRow(tenantId: string): Promise<SimulationSettingsResolved> {
  const row = await queryOne<{
    retention_days: number | string | null;
    cron_fake_draws_per_hour: number | string | null;
    sim_feed_rank_min: number | string | null;
    sim_feed_rank_max: number | string | null;
    enable_cron_fake_feed: number | string | null;
    cron_fake_anchor_at: Date | string | null;
  }>(
    `SELECT retention_days, cron_fake_draws_per_hour, sim_feed_rank_min, sim_feed_rank_max,
            enable_cron_fake_feed, cron_fake_anchor_at
     FROM lottery_simulation_settings WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  if (!row) {
    return {
      retention_days: 3,
      cron_fake_draws_per_hour: 3,
      sim_feed_rank_min: 1,
      sim_feed_rank_max: 8,
      enable_cron_fake_feed: false,
      cron_fake_anchor_at: null,
    };
  }
  const retention = Math.max(1, Math.min(365, Math.floor(Number(row.retention_days ?? 3))));
  const draws = clampDrawsPerFakePerHour(Number(row.cron_fake_draws_per_hour ?? 3));
  const ranks = normalizeRankPair(
    Number(row.sim_feed_rank_min ?? 1),
    Number(row.sim_feed_rank_max ?? 8),
  );
  return {
    retention_days: retention,
    cron_fake_draws_per_hour: draws,
    sim_feed_rank_min: ranks.min,
    sim_feed_rank_max: ranks.max,
    enable_cron_fake_feed: Number(row.enable_cron_fake_feed ?? 0) === 1,
    cron_fake_anchor_at: rowToAnchorIso(row.cron_fake_anchor_at ?? null),
  };
}

export async function upsertSimulationSettings(
  tenantId: string,
  patch: Partial<
    Pick<
      SimulationSettingsResolved,
      | 'retention_days'
      | 'cron_fake_draws_per_hour'
      | 'sim_feed_rank_min'
      | 'sim_feed_rank_max'
      | 'enable_cron_fake_feed'
    >
  >,
): Promise<SimulationSettingsResolved> {
  const cur = await getSimulationSettingsRow(tenantId);
  const retention_days =
    patch.retention_days != null
      ? Math.max(1, Math.min(365, Math.floor(patch.retention_days)))
      : cur.retention_days;
  const cron_fake_draws_per_hour =
    patch.cron_fake_draws_per_hour != null
      ? clampDrawsPerFakePerHour(patch.cron_fake_draws_per_hour)
      : cur.cron_fake_draws_per_hour;
  const rankPair =
    patch.sim_feed_rank_min != null || patch.sim_feed_rank_max != null
      ? normalizeRankPair(
          patch.sim_feed_rank_min != null ? patch.sim_feed_rank_min : cur.sim_feed_rank_min,
          patch.sim_feed_rank_max != null ? patch.sim_feed_rank_max : cur.sim_feed_rank_max,
        )
      : normalizeRankPair(cur.sim_feed_rank_min, cur.sim_feed_rank_max);
  const enable_cron_fake_feed =
    patch.enable_cron_fake_feed != null ? !!patch.enable_cron_fake_feed : cur.enable_cron_fake_feed;

  await execute(
    `INSERT INTO lottery_simulation_settings (
       tenant_id, retention_days, cron_fake_draws_per_hour, sim_feed_rank_min, sim_feed_rank_max,
       enable_cron_fake_feed, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
       retention_days = VALUES(retention_days),
       cron_fake_draws_per_hour = VALUES(cron_fake_draws_per_hour),
       sim_feed_rank_min = VALUES(sim_feed_rank_min),
       sim_feed_rank_max = VALUES(sim_feed_rank_max),
       enable_cron_fake_feed = VALUES(enable_cron_fake_feed),
       cron_fake_anchor_at = IF(VALUES(enable_cron_fake_feed) = 0, NULL, cron_fake_anchor_at),
       updated_at = NOW(3)`,
    [
      tenantId,
      retention_days,
      cron_fake_draws_per_hour,
      rankPair.min,
      rankPair.max,
      enable_cron_fake_feed ? 1 : 0,
    ],
  );
  return getSimulationSettingsRow(tenantId);
}

export async function setCronFakeAnchorAt(tenantId: string, at: Date): Promise<void> {
  await execute(
    `UPDATE lottery_simulation_settings SET cron_fake_anchor_at = ?, updated_at = NOW(3) WHERE tenant_id = ?`,
    [at, tenantId],
  );
}

export async function insertSimulationFeedRow(
  tenantId: string,
  source: SimulationFeedSource,
  feedText: string,
  memberId: string | null,
): Promise<string> {
  const id = randomUUID();
  const text = String(feedText || '').trim().slice(0, 512);
  if (!text) return id;
  await execute(
    `INSERT INTO lottery_simulation_feed (id, tenant_id, source, feed_text, member_id, created_at)
     VALUES (?, ?, ?, ?, ?, NOW(3))`,
    [id, tenantId, source, text, memberId],
  );
  return id;
}

export async function purgeSimulationFeedOlderThan(tenantId: string, retentionDays: number): Promise<number> {
  const days = Math.max(1, Math.min(365, Math.floor(retentionDays)));
  const res = await execute(
    `DELETE FROM lottery_simulation_feed
     WHERE tenant_id = ? AND created_at < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [tenantId, days],
  );
  return Number(res.affectedRows ?? 0);
}

export async function listSimulationFeedForTenant(
  tenantId: string,
  limit: number,
): Promise<{ id: string; text: string; at: number }[]> {
  const lim = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await query<{ id: string; feed_text: string; created_at: Date | string }>(
    `SELECT id, feed_text, created_at FROM lottery_simulation_feed
     WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
    [tenantId, lim],
  );
  return rows.map((r) => ({
    id: r.id,
    text: r.feed_text,
    at: new Date(r.created_at).getTime(),
  }));
}

export async function listSimulationFeedRowsAdmin(
  tenantId: string,
  limit: number,
): Promise<
  {
    id: string;
    source: string;
    feed_text: string;
    member_id: string | null;
    created_at: string;
  }[]
> {
  const lim = Math.max(1, Math.min(500, Math.floor(limit)));
  return query(
    `SELECT id, source, feed_text, member_id, created_at FROM lottery_simulation_feed
     WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
    [tenantId, lim],
  );
}

/** 后台查看：每小时模拟任务认领记录（上海整点 key 或 锚点 slot key） */
export async function listSpinFakeHourRunsAdmin(
  tenantId: string,
  limit: number,
): Promise<{ hour_key: string; created_at: string }[]> {
  const lim = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await query<{ hour_key: string; created_at: Date | string }>(
    `SELECT hour_key, created_at FROM spin_fake_lottery_hour_run
     WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
    [tenantId, lim],
  );
  return rows.map((r) => ({
    hour_key: r.hour_key,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}
