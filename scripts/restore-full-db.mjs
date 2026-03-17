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

const TABLES_WITH_TENANT_ID = new Set([
  'orders', 'members', 'employees', 'member_activity', 'activity_gifts', 'shared_data_store',
  'balance_change_logs', 'operation_logs', 'audit_records', 'employee_login_logs',
  'points_ledger', 'points_accounts', 'ledger_transactions',
  'shift_handovers', 'shift_receivers', 'knowledge_articles', 'knowledge_categories',
  'knowledge_read_status', 'navigation_config', 'user_data_store',
  'activity_types', 'activity_reward_tiers', 'referral_relations',
]);

function loadEnv() {
  for (const p of [join(__dirname, '..', 'server', '.env'), join(__dirname, '..', '.env')]) {
    try {
      const content = readFileSync(p, 'utf-8');
      for (const line of content.split('\n')) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    } catch (_) {}
  }
}
loadEnv();

const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const dbPassword = process.env.DATABASE_PASSWORD?.trim();
if (!supabaseUrl || !dbPassword) {
  console.error('❌ 需要 VITE_SUPABASE_URL 和 DATABASE_PASSWORD');
  process.exit(1);
}

const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'dhlwefrcowefvbxutsmc';
const pgClient = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});

async function fetchBackup(backupId, table) {
  const fetchUrl = `${supabaseUrl}/storage/v1/object/public/data-backups/${backupId}/${table}.json`;
  const res = await fetch(fetchUrl);
  if (!res.ok) return [];
  return JSON.parse(await res.text());
}

async function upsertBatch(client, table, rows, fallbackTenantId) {
  if (!rows || rows.length === 0) return 0;
  if (TABLES_WITH_TENANT_ID.has(table) && fallbackTenantId) {
    rows = rows.map((r) => (r.tenant_id == null ? { ...r, tenant_id: fallbackTenantId } : r));
  }
  const cols = Object.keys(rows[0]).filter((c) => rows[0][c] !== undefined);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const setClause = cols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  let count = 0;
  try {
    await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
  } catch (_) {}
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    for (const row of batch) {
      const vals = cols.map((c) => {
        let v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === 'string' && v.startsWith('[') && v.endsWith(']')) {
          try {
            v = JSON.parse(v);
          } catch (_) {}
        }
        if (Array.isArray(v)) return v;
        if (typeof v === 'object' && v !== null && !(v instanceof Date)) return JSON.stringify(v);
        return v;
      });
      const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${setClause}`;
      try {
        await client.query(sql, vals);
        count++;
      } catch (e) {
        console.error(`  ${table} 行错误:`, e.message?.slice(0, 80));
      }
    }
  }
  try {
    await client.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
  } catch (_) {}
  return count;
}

async function main() {
  let backupId = process.argv[2];
  await pgClient.connect();
  if (!backupId) {
    const { rows } = await pgClient.query(`
      SELECT id, backup_name, created_at FROM data_backups
      WHERE status = 'success' ORDER BY created_at DESC LIMIT 1
    `);
    if (!rows?.length) {
      console.error('❌ 没有找到成功备份。请先在 平台设置→数据备份 中执行「立即备份」');
      await pgClient.end();
      process.exit(1);
    }
    backupId = rows[0].id;
    console.log('使用最新备份:', rows[0].backup_name, '(' + rows[0].created_at + ')');
  }
  console.log('备份ID:', backupId);

  const { rows: tenantRows } = await pgClient.query(`
    SELECT id FROM tenants WHERE tenant_code = '002' OR tenant_code = 'fastgc' LIMIT 1
  `);
  const fallbackTenantId = tenantRows[0]?.id || null;
  if (fallbackTenantId) console.log('空 tenant_id 将填充为:', fallbackTenantId);

  const restored = {};
  for (const table of BACKUP_TABLES) {
    try {
      const rows = await fetchBackup(backupId, table);
      const n = await upsertBatch(pgClient, table, rows, fallbackTenantId);
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
