#!/usr/bin/env node
/**
 * 从备份恢复员工数据到数据库
 * 用于员工误删后的恢复，会恢复 employees 和 employee_permissions 表
 *
 * 使用方式：
 *   node scripts/restore-employees.mjs [备份ID]
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
  console.error(`
❌ 缺少环境变量。请在 .env 中配置：
   VITE_SUPABASE_URL=你的项目URL
   SUPABASE_SERVICE_ROLE_KEY=service_role密钥（Supabase 控制台 → Settings → API）

注意：使用 service_role 可绕过 RLS，确保恢复能写入数据库。
`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function getBackupSnapshot(backupId, table) {
  const { data: record } = await supabase
    .from('data_backups')
    .select('storage_path')
    .eq('id', backupId)
    .single();

  const storagePath = record?.storage_path;
  if (!storagePath) return [];

  const { data, error } = await supabase.storage
    .from('data-backups')
    .download(`${storagePath}/${table}.json`);

  if (error) throw new Error(error.message);
  const text = await data.text();
  return JSON.parse(text);
}

async function restoreEmployeesOnly(backupId) {
  const restored = {};
  const errors = [];
  const tables = ['employees', 'employee_permissions'];

  for (const table of tables) {
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
          errors.push(`${table} batch ${Math.floor(i / 200) + 1}: ${error.message}`);
        }
      }
      restored[table] = rows.length;
    } catch (err) {
      errors.push(`${table}: ${err.message}`);
    }
  }

  return { success: errors.length === 0, restored, errors };
}

async function main() {
  let backupId = process.argv[2];

  if (!backupId) {
    console.log('未指定备份ID，正在获取最新成功备份...');
    const { data: backups, error } = await supabase
      .from('data_backups')
      .select('id, backup_name, created_at, record_counts')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('❌ 获取备份列表失败:', error.message);
      process.exit(1);
    }
    if (!backups || backups.length === 0) {
      console.error(`
❌ 没有找到可用的成功备份。

可能原因：
1. 请确认 .env 中已配置 SUPABASE_SERVICE_ROLE_KEY（Supabase 控制台 → Settings → API → service_role）
   使用 anon key 可能因 RLS 无法读取备份列表
2. 系统中确实没有成功备份，需先在平台设置 → 数据备份 中执行「立即备份」
`);
      process.exit(1);
    }

    backupId = backups[0].id;
    console.log(`\n使用备份: ${backups[0].backup_name} (${backups[0].created_at})`);
    console.log(`  备份ID: ${backupId}`);
    console.log(`  员工数: ${backups[0].record_counts?.employees ?? 0}`);
    console.log('\n如需使用其他备份，请运行: node scripts/restore-employees.mjs <备份ID>');
  }

  console.log('\n开始恢复员工数据...');
  const result = await restoreEmployeesOnly(backupId);

  if (result.success) {
    console.log('\n✓ 恢复成功！');
    console.log(`  员工: ${result.restored.employees || 0} 条`);
    console.log(`  权限: ${result.restored.employee_permissions || 0} 条`);
  } else {
    console.error('\n✗ 恢复失败:');
    result.errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }
}

main();
