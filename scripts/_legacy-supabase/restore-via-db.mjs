#!/usr/bin/env node
/**
 * 通过数据库直接恢复：从 storage 下载 JSON（需 service_role），用 pg 批量插入
 * 若 .env 无 SUPABASE_SERVICE_ROLE_KEY，会提示获取方式
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
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
  'data_settings', 'report_titles',
  'exchange_rate_state', 'user_data_store',
  'api_keys', 'webhooks', 'webhook_delivery_logs',
];

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
}
loadEnv();

const PROJECT_REF = 'dhlwefrcowefvbxutsmc';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbPassword = process.env.DATABASE_PASSWORD?.trim();

if (!serviceRoleKey) {
  console.error(`
❌ 必须配置 SUPABASE_SERVICE_ROLE_KEY 才能从 Storage 读取备份。

获取方式：
1. 打开 https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api
2. 在 Project API keys 中找到 service_role（secret）
3. 复制后添加到 .env: SUPABASE_SERVICE_ROLE_KEY=eyJ...
`);
  process.exit(1);
}

if (!dbPassword) {
  console.error('❌ 需要 DATABASE_PASSWORD');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const pgClient = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
});

async function getBackupSnapshot(backupId, table) {
  const { data, error } = await supabase.storage
    .from('data-backups')
    .download(`${backupId}/${table}.json`);

  if (error) return [];
  const text = await data.text();
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function upsertViaPg(client, table, rows) {
  if (!rows || rows.length === 0) return 0;
  const cols = Object.keys(rows[0]).filter((c) => rows[0][c] !== undefined);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const setClause = cols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  const colList = cols.map((c) => `"${c}"`).join(', ');

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    for (const row of batch) {
      const vals = cols.map((c) => {
        const v = row[c];
        if (v === null) return null;
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      });
      const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${setClause}`;
      try {
        await client.query(sql, vals);
        inserted++;
      } catch (e) {
        console.error(`${table} row error:`, e.message);
      }
    }
  }
  return inserted;
}

async function main() {
  const backupId = process.argv[2] || '99b21bbe-37bf-451b-a2ed-904ae1f9a182';
  console.log('备份ID:', backupId);
  await pgClient.connect();

  const restored = {};
  for (const table of BACKUP_TABLES) {
    const rows = await getBackupSnapshot(backupId, table);
    if (rows.length === 0) {
      restored[table] = 0;
      continue;
    }
    const n = await upsertViaPg(pgClient, table, rows);
    restored[table] = n;
    process.stdout.write(`  ${table}: ${n}\r`);
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
