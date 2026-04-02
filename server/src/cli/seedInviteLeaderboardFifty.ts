#!/usr/bin/env node
/**
 * 活动数据 → 邀请设置「初始化 50 条」等价操作（需 MySQL 与 server/.env）。
 * 用法：
 *   npx tsx src/cli/seedInviteLeaderboardFifty.ts [tenantId] [--replace]
 * 未传 tenantId 时：用环境变量 INVITE_LB_SEED_TENANT_ID，否则取首个非 platform 租户。
 */
import 'dotenv/config';
if (!process.env.TZ?.trim()) {
  process.env.TZ = (process.env.APP_TIMEZONE || 'Asia/Shanghai').trim();
}
import { queryOne } from '../database/index.js';
import { seedFiftyFakeUsers } from '../modules/inviteLeaderboard/repository.js';

async function resolveTenantId(argv: string[]): Promise<string> {
  const pos = argv.find((a) => a && !a.startsWith('-'));
  if (pos) return pos.trim();
  const fromEnv = (process.env.INVITE_LB_SEED_TENANT_ID || '').trim();
  if (fromEnv) return fromEnv;
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM tenants
     ORDER BY CASE WHEN tenant_code <=> 'platform' THEN 1 ELSE 0 END, created_at ASC
     LIMIT 1`,
  );
  if (!row?.id) throw new Error('No tenant row in DB (tenants table empty?)');
  return row.id;
}

void (async () => {
  const replace = process.argv.includes('--replace');
  const posArgs = process.argv.slice(2).filter((a) => a !== '--replace' && a !== '--');
  try {
    const tenantId = await resolveTenantId(posArgs);
    const { inserted } = await seedFiftyFakeUsers(tenantId, replace);
    console.log(JSON.stringify({ ok: true, tenantId, replace, inserted }, null, 2));
    if (!replace && inserted === 0) {
      console.error('[seed] ALREADY_SEEDED: pass --replace to wipe and re-seed (admin UI equivalent).');
      process.exit(2);
    }
    process.exit(0);
  } catch (e) {
    console.error('[seed] failed:', e);
    process.exit(1);
  }
})();
