#!/usr/bin/env node
/**
 * 通过数据库直连恢复（绕过 RLS）
 * 从公开 URL 读取备份，用 postgres 用户直接写入
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BACKUP_TABLES = [
  'orders', 'members', 'employees', 'employee_permissions',
  'ledger_transactions', 'member_activity', 'points_ledger', 'points_accounts',
  'activity_gifts', 'shared_data_store', 'balance_change_logs',
  'operation_logs', 'audit_records', 'employee_login_logs',
  'permission_change_logs', 'employee_name_history',
  'role_permissions', 'permission_versions', 'profiles', 'invitation_codes',
  'vendors', 'cards', 'card_types', 'payment_providers',
  'currencies', 'customer_sources', 'activity_types',
  'activity_reward_tiers', 'referral_relations',
  'shift_handovers', 'shift_receivers',
  'knowledge_articles', 'knowledge_categories', 'knowledge_read_status',
  'data_settings', 'navigation_config', 'report_titles',
  'exchange_rate_state', 'user_data_store',
  'api_keys', 'webhooks', 'webhook_delivery_logs',
];

function loadEnv() {
  try {
    const content = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
}
loadEnv();

const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const dbPassword = process.env.DATABASE_PASSWORD?.trim();
if (!supabaseUrl || !dbPassword) {
  console.error('❌ 需要 VITE_SUPABASE_URL 和 DATABASE_PASSWORD');
  process.exit(1);
}

const pgClient = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.dhlwefrcowefvbxutsmc.supabase.co:5432/postgres`,
});

async function fetchBackup(backupId, table) {
  const url = `${supabaseUrl}/storage/v1/object/public/data-backups/${backupId}/${table}.json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return JSON.parse(await res.text());
}

async function upsertBatch(client, table, rows) {
  if (!rows || rows.length === 0) return 0;
  const cols = Object.keys(rows[0]).filter((c) => rows[0][c] !== undefined);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const setClause = cols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  let count = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    for (const row of batch) {
      const vals = cols.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === 'object' && v !== null && !(v instanceof Date)) return JSON.stringify(v);
        return v;
      });
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${setClause}`;
      try {
        await client.query(sql, vals);
        count++;
      } catch (e) {
        console.error(`  ${table} 行错误:`, e.message?.slice(0, 80));
      }
    }
  }
  return count;
}

async function main() {
  const backupId = process.argv[2] || '99b21bbe-37bf-451b-a2ed-904ae1f9a182';
  console.log('备份ID:', backupId);
  await pgClient.connect();

  const restored = {};
  for (const table of BACKUP_TABLES) {
    try {
      const rows = await fetchBackup(backupId, table);
      const n = await upsertBatch(pgClient, table, rows);
      restored[table] = n;
      if (n > 0) process.stdout.write(`  ${table}: ${n}\r`);
    } catch (e) {
      console.error(`  ${table} 错误:`, e.message);
      restored[table] = 0;
    }
  }

  await pgClient.end();
  const total = Object.values(restored).reduce((a, b) => a + b, 0);
  console.log('\n✓ 恢复完成，共', total, '条');
  console.log('  订单:', restored.orders || 0);
  console.log('  会员:', restored.members || 0);
  console.log('  员工:', restored.employees || 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
