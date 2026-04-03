/**
 * 会员系统「活动数据」保留策略：配置存 shared_data_store，按天清理本租户
 * 抽奖流水（lottery_logs）、签到流水（check_ins）、抽奖类积分流水（points_ledger 中 lottery）。
 * 不删除会员汇总、订单、活动赠送、推荐关系、消费/推荐类积分流水。
 */
import { execute, query } from '../../database/index.js';
import { getSharedDataRepository, upsertSharedDataRepository } from './repository.js';

export const ACTIVITY_DATA_RETENTION_STORE_KEY = 'activity_data_retention';

export interface ActivityDataRetentionSettings {
  enabled: boolean;
  retentionDays: number;
  lastRunAt: string | null;
  lastSummary: {
    lotteryLogs: number;
    checkIns: number;
    lotteryPointsLedger: number;
    spinCredits: number;
  } | null;
}

const DEFAULTS: ActivityDataRetentionSettings = {
  enabled: false,
  retentionDays: 365,
  lastRunAt: null,
  lastSummary: null,
};

function clampRetentionDays(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.retentionDays;
  return Math.min(3650, Math.max(1, Math.floor(n)));
}

function parseStored(raw: unknown): ActivityDataRetentionSettings {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULTS };
  const o = raw as Record<string, unknown>;
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : DEFAULTS.enabled,
    retentionDays: clampRetentionDays(Number(o.retentionDays ?? DEFAULTS.retentionDays)),
    lastRunAt: typeof o.lastRunAt === 'string' ? o.lastRunAt : null,
    lastSummary:
      o.lastSummary != null && typeof o.lastSummary === 'object' && !Array.isArray(o.lastSummary)
        ? {
            lotteryLogs: Number((o.lastSummary as Record<string, unknown>).lotteryLogs) || 0,
            checkIns: Number((o.lastSummary as Record<string, unknown>).checkIns) || 0,
            lotteryPointsLedger:
              Number((o.lastSummary as Record<string, unknown>).lotteryPointsLedger) || 0,
            spinCredits: Number((o.lastSummary as Record<string, unknown>).spinCredits) || 0,
          }
        : null,
  };
}

export async function getActivityDataRetentionSettingsRepository(
  tenantId: string,
): Promise<ActivityDataRetentionSettings> {
  const raw = await getSharedDataRepository(tenantId, ACTIVITY_DATA_RETENTION_STORE_KEY);
  return parseStored(raw);
}

export async function saveActivityDataRetentionSettingsRepository(
  tenantId: string,
  input: { enabled: boolean; retentionDays: number },
): Promise<ActivityDataRetentionSettings> {
  const prev = await getActivityDataRetentionSettingsRepository(tenantId);
  const next: ActivityDataRetentionSettings = {
    enabled: !!input.enabled,
    retentionDays: clampRetentionDays(input.retentionDays),
    lastRunAt: prev.lastRunAt,
    lastSummary: prev.lastSummary,
  };
  await upsertSharedDataRepository(tenantId, ACTIVITY_DATA_RETENTION_STORE_KEY, next);
  return next;
}

async function persistAfterRun(
  tenantId: string,
  base: ActivityDataRetentionSettings,
  summary: { lotteryLogs: number; checkIns: number; lotteryPointsLedger: number; spinCredits: number },
): Promise<void> {
  const iso = new Date().toISOString();
  await upsertSharedDataRepository(tenantId, ACTIVITY_DATA_RETENTION_STORE_KEY, {
    ...base,
    lastRunAt: iso,
    lastSummary: summary,
  });
}

function cutoffDateStr(retentionDays: number): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())} ${pad(cutoff.getHours())}:${pad(cutoff.getMinutes())}:${pad(cutoff.getSeconds())}`;
}

/**
 * 按租户删除早于 cutoff 的：抽奖流水、签到流水、抽奖类积分流水（points_ledger lottery）。
 * 先删可能引用抽奖记录的积分流水，再删 lottery_logs。
 */
export async function purgeActivityDataByTenantRepository(
  tenantId: string,
  retentionDays: number,
): Promise<{ lotteryLogs: number; checkIns: number; lotteryPointsLedger: number; spinCredits: number }> {
  const days = clampRetentionDays(retentionDays);
  const cutoff = cutoffDateStr(days);

  // 抽奖类积分流水（先删，避免外键/引用关系）
  const r1 = await execute(
    `DELETE pl FROM points_ledger pl
     INNER JOIN members m ON m.id = pl.member_id
     WHERE m.tenant_id <=> ?
       AND pl.created_at < ?
       AND (pl.type = 'lottery' OR pl.transaction_type = 'lottery')`,
    [tenantId, cutoff],
  );

  // 抽奖流水（tenant_id 对齐；兼容历史行 tenant_id 为空但会员属本租户）
  const r2 = await execute(
    `DELETE l FROM lottery_logs l
     LEFT JOIN members m ON m.id = l.member_id
     WHERE l.created_at < ?
       AND (l.tenant_id <=> ? OR (l.tenant_id IS NULL AND m.tenant_id <=> ?))`,
    [cutoff, tenantId, tenantId],
  );

  // 签到流水（与会员系统活动数据：按会员租户）
  const r3 = await execute(
    `DELETE c FROM check_ins c
     INNER JOIN members m ON m.id = c.member_id
     WHERE m.tenant_id <=> ? AND c.created_at < ?`,
    [tenantId, cutoff],
  );

  // 抽奖次数记录（spin_credits: share/order/referral/checkin 等来源的抽奖次数发放记录）
  const r4 = await execute(
    `DELETE sc FROM spin_credits sc
     INNER JOIN members m ON m.id = sc.member_id
     WHERE m.tenant_id <=> ? AND sc.created_at < ?`,
    [tenantId, cutoff],
  );

  return {
    lotteryPointsLedger: r1.affectedRows ?? 0,
    lotteryLogs: r2.affectedRows ?? 0,
    checkIns: r3.affectedRows ?? 0,
    spinCredits: r4.affectedRows ?? 0,
  };
}

export async function runActivityDataRetentionForTenantRepository(tenantId: string): Promise<{
  ran: boolean;
  summary: { lotteryLogs: number; checkIns: number; lotteryPointsLedger: number; spinCredits: number };
  settings: ActivityDataRetentionSettings;
}> {
  const settings = await getActivityDataRetentionSettingsRepository(tenantId);
  if (!settings.enabled || settings.retentionDays < 1) {
    return {
      ran: false,
      summary: { lotteryLogs: 0, checkIns: 0, lotteryPointsLedger: 0, spinCredits: 0 },
      settings,
    };
  }
  const summary = await purgeActivityDataByTenantRepository(tenantId, settings.retentionDays);
  await persistAfterRun(tenantId, settings, summary);
  const updated = await getActivityDataRetentionSettingsRepository(tenantId);
  return { ran: true, summary, settings: updated };
}

/** 手动立即清理：按当前保留天数执行（与是否启用自动无关），并更新 lastRunAt */
export async function runManualActivityDataPurgeRepository(tenantId: string): Promise<{
  summary: { lotteryLogs: number; checkIns: number; lotteryPointsLedger: number; spinCredits: number };
  settings: ActivityDataRetentionSettings;
}> {
  const settings = await getActivityDataRetentionSettingsRepository(tenantId);
  if (settings.retentionDays < 1) {
    return {
      summary: { lotteryLogs: 0, checkIns: 0, lotteryPointsLedger: 0, spinCredits: 0 },
      settings,
    };
  }
  const summary = await purgeActivityDataByTenantRepository(tenantId, settings.retentionDays);
  await persistAfterRun(tenantId, settings, summary);
  const updated = await getActivityDataRetentionSettingsRepository(tenantId);
  return { summary, settings: updated };
}

/**
 * 删除租户全部活动数据（无日期截止限制），用于一键清空场景。
 */
export async function purgeAllActivityDataByTenantRepository(
  tenantId: string,
): Promise<{ lotteryLogs: number; checkIns: number; lotteryPointsLedger: number; spinCredits: number }> {
  const r1 = await execute(
    `DELETE pl FROM points_ledger pl
     INNER JOIN members m ON m.id = pl.member_id
     WHERE m.tenant_id <=> ?
       AND (pl.type = 'lottery' OR pl.transaction_type = 'lottery')`,
    [tenantId],
  );
  const r2 = await execute(
    `DELETE l FROM lottery_logs l
     LEFT JOIN members m ON m.id = l.member_id
     WHERE l.tenant_id <=> ? OR (l.tenant_id IS NULL AND m.tenant_id <=> ?)`,
    [tenantId, tenantId],
  );
  const r3 = await execute(
    `DELETE c FROM check_ins c
     INNER JOIN members m ON m.id = c.member_id
     WHERE m.tenant_id <=> ?`,
    [tenantId],
  );
  const r4 = await execute(
    `DELETE sc FROM spin_credits sc
     INNER JOIN members m ON m.id = sc.member_id
     WHERE m.tenant_id <=> ?`,
    [tenantId],
  );
  return {
    lotteryPointsLedger: r1.affectedRows ?? 0,
    lotteryLogs: r2.affectedRows ?? 0,
    checkIns: r3.affectedRows ?? 0,
    spinCredits: r4.affectedRows ?? 0,
  };
}

export async function listTenantIdsWithActivityRetentionEnabledRepository(): Promise<string[]> {
  const rows = await query<{ tenant_id: string | null; store_value: unknown }>(
    `SELECT tenant_id, store_value FROM shared_data_store WHERE store_key = ? AND tenant_id IS NOT NULL`,
    [ACTIVITY_DATA_RETENTION_STORE_KEY],
  );
  const out: string[] = [];
  for (const r of rows) {
    if (!r.tenant_id) continue;
    const s = parseStored(r.store_value);
    if (s.enabled && s.retentionDays >= 1) out.push(r.tenant_id);
  }
  return out;
}
