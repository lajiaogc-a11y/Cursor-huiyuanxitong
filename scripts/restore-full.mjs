#!/usr/bin/env node
/**
 * 从备份完整恢复数据（订单、会员、员工等所有表）
 *
 * 使用方式：
 *   node scripts/restore-full.mjs [备份ID]
 *   不传备份ID时，使用最新的成功备份
 *
 * 环境变量（.env）：
 *   VITE_SUPABASE_URL - 必填
 *   SUPABASE_SERVICE_ROLE_KEY - 必填（Supabase 控制台 → Settings → API → service_role）
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BACKUP_TABLES = [
  'orders', 'members', 'ledger_transactions', 'member_activity',
  'points_ledger', 'points_accounts', 'activity_gifts',
  'shared_data_store', 'balance_change_logs',
  'operation_logs', 'audit_records', 'employee_login_logs',
  'permission_change_logs', 'employee_name_history',
  'employees', 'employee_permissions', 'role_permissions',
  'permission_versions', 'profiles', 'invitation_codes',
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
    const envPath = join(__dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
}
loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ 缺少 VITE_SUPABASE_URL 或密钥');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠ 使用 anon key，Storage 可能无法读取。建议配置 SUPABASE_SERVICE_ROLE_KEY');
  console.warn('  获取: https://supabase.com/dashboard/project/dhlwefrcowefvbxutsmc/settings/api\n');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function getBackupSnapshot(backupId, table) {
  const storagePath = backupId;
  const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/data-backups/${storagePath}/${table}.json`;

  try {
    const res = await fetch(publicUrl);
    if (!res.ok) return [];
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function restoreFull(backupId) {
  const restored = {};
  const errors = [];

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await getBackupSnapshot(backupId, table);
      if (!rows || rows.length === 0) {
        restored[table] = 0;
        continue;
      }

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { error } = await supabase
          .from(table)
          .upsert(batch, { onConflict: 'id' });

        if (error) {
          errors.push(`${table}: ${error.message}`);
          break;
        }
      }
      restored[table] = rows.length;
      process.stdout.write(`  ${table}: ${rows.length}\r`);
    } catch (err) {
      errors.push(`${table}: ${err.message}`);
    }
  }

  return { success: errors.length === 0, restored, errors };
}

async function main() {
  let backupId = process.argv[2];

  if (!backupId) {
    console.log('正在获取最新成功备份...');
    const { data: backups, error } = await supabase
      .from('data_backups')
      .select('id, backup_name, created_at, record_counts')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('❌ 获取备份失败:', error.message);
      console.error('请确认 .env 中已配置 SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }
    if (!backups || backups.length === 0) {
      console.error('❌ 没有找到成功备份。请先在平台设置→数据备份中执行「立即备份」');
      process.exit(1);
    }

    backupId = backups[0].id;
    console.log(`使用备份: ${backups[0].backup_name} (${backups[0].created_at})\n`);
  }

  console.log('开始完整恢复...');
  const result = await restoreFull(backupId);

  if (result.success) {
    const total = Object.values(result.restored).reduce((a, b) => a + b, 0);
    console.log('\n✓ 恢复成功！共', total, '条记录');
    console.log('  订单:', result.restored.orders || 0);
    console.log('  会员:', result.restored.members || 0);
    console.log('  员工:', result.restored.employees || 0);
  } else {
    console.error('\n✗ 部分失败:');
    result.errors.forEach((e) => console.error('  -', e));
    console.log('\n已恢复:', result.restored);
    process.exit(1);
  }
}

main();
