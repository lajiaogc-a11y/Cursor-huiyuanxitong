#!/usr/bin/env node
/**
 * 只读检查：invite_leaderboard_job_runs 与假用户增长是否异常一致。
 * 在已配置 MYSQL 的环境执行（本地 server/.env 或线上主机）：
 *   npm run check:invite-growth-jobs
 *   npm run check:invite-growth-jobs -- --hours 168
 */
import 'dotenv/config';
if (!process.env.TZ?.trim()) {
  process.env.TZ = (process.env.APP_TIMEZONE || 'Asia/Shanghai').trim();
}

import { query, closePool } from '../database/index.js';

type Row = {
  id: string;
  started_at: string;
  finished_at: string | null;
  tenants_eligible: number;
  tenants_processed: number;
  fake_rows_updated: number;
  message: string | null;
};

function parseHours(): number {
  const idx = process.argv.indexOf('--hours');
  if (idx >= 0 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (Number.isFinite(n) && n > 0 && n <= 24 * 365) return Math.floor(n);
  }
  return 72;
}

void (async () => {
  const hours = parseHours();
  try {
    const tableCheck = await query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'invite_leaderboard_job_runs'`,
    );
    if (!tableCheck[0] || Number(tableCheck[0].c) === 0) {
      console.log('[check] 表 invite_leaderboard_job_runs 不存在，跳过。');
      await closePool();
      process.exit(0);
    }

    const recent = await query<Row>(
      `SELECT id, started_at, finished_at, tenants_eligible, tenants_processed, fake_rows_updated, message
       FROM invite_leaderboard_job_runs
       WHERE finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 80`,
    );

    console.log('\n=== 最近 80 次已完成任务（按 finished_at 降序）===');
    console.log(
      'finished_at (server tz) | fake_rows | tenants_proc | eligible | message (截断)',
    );
    for (const r of recent) {
      const msg = (r.message ?? '').replace(/\s+/g, ' ').slice(0, 72);
      console.log(
        `${r.finished_at} | ${String(r.fake_rows_updated).padStart(4)} | ${String(r.tenants_processed).padStart(4)} | ${String(r.tenants_eligible).padStart(4)} | ${msg}`,
      );
    }

    const since = await query<{
      runs: number;
      sum_fake: number | null;
      max_fake: number | null;
      sum_eligible: number | null;
    }>(
      `SELECT
         COUNT(*) AS runs,
         SUM(fake_rows_updated) AS sum_fake,
         MAX(fake_rows_updated) AS max_fake,
         SUM(tenants_eligible) AS sum_eligible
       FROM invite_leaderboard_job_runs
       WHERE finished_at IS NOT NULL
         AND finished_at >= DATE_SUB(NOW(3), INTERVAL ? HOUR)`,
      [hours],
    );

    const s = since[0];
    console.log(`\n=== 最近 ${hours} 小时内汇总 ===`);
    console.log(`  完成任务次数 runs:     ${s?.runs ?? 0}`);
    console.log(`  fake_rows_updated 合计:  ${s?.sum_fake ?? 0}`);
    console.log(`  单次任务最大 fake_rows: ${s?.max_fake ?? 0}`);
    console.log(`  tenants_eligible 累计:   ${s?.sum_eligible ?? 0}`);
    console.log(
      '  说明：定时约每 2 分钟一次，故 72h 内约 2160 次 run；单次 fake_rows 应接近「本 tick 实际触发的假用户数」，',
    );
    console.log('       若长期单次远大于活跃假用户量，需结合周期与 next_growth_at 逻辑排查。\n');

    const hourly = await query<{ bucket: string; runs: number; sum_fake: number | null; max_fake: number | null }>(
      `SELECT
         DATE_FORMAT(finished_at, '%Y-%m-%d %H:00') AS bucket,
         COUNT(*) AS runs,
         SUM(fake_rows_updated) AS sum_fake,
         MAX(fake_rows_updated) AS max_fake
       FROM invite_leaderboard_job_runs
       WHERE finished_at IS NOT NULL
         AND finished_at >= DATE_SUB(NOW(3), INTERVAL ? HOUR)
       GROUP BY DATE_FORMAT(finished_at, '%Y-%m-%d %H:00')
       ORDER BY bucket DESC
       LIMIT 96`,
      [hours],
    );

    console.log(`=== 按小时聚合（最近 ${hours}h，最多 96 行）===`);
    console.log('bucket (hour)        | runs | sum(fake_rows) | max(fake_rows)');
    for (const h of hourly) {
      console.log(
        `${h.bucket} | ${String(h.runs).padStart(4)} | ${String(h.sum_fake ?? 0).padStart(14)} | ${String(h.max_fake ?? 0).padStart(13)}`,
      );
    }

    const stuck = await query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM invite_leaderboard_job_runs WHERE finished_at IS NULL`,
    );
    console.log(`\n未完成记录数（finished_at IS NULL）: ${stuck[0]?.c ?? 0}`);

    await closePool();
    process.exit(0);
  } catch (e) {
    console.error('[check] failed:', e);
    await closePool().catch(() => {});
    process.exit(1);
  }
})();
