#!/usr/bin/env node
/**
 * 执行租户数据隔离迁移
 *
 * 方式一：.env 中配置 DATABASE_URL
 * 方式二：.env 中配置 DATABASE_PASSWORD（需有 VITE_SUPABASE_PROJECT_ID 或使用默认 project）
 * 方式三：命令行 $env:DATABASE_PASSWORD="密码"; node scripts/run-tenant-isolation-migration.mjs
 */
import pg from 'pg';
import { createInterface } from 'readline';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.VITE_SUPABASE_PROJECT_ID || 'dhlwefrcowefvbxutsmc';

// 简单加载 .env
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

function askPassword() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('请输入 Supabase 数据库密码（Project Settings → Database）: ', (pwd) => {
      rl.close();
      resolve((pwd || '').trim());
    });
  });
}

async function main() {
  let DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    let password = process.env.DATABASE_PASSWORD?.trim();
    if (!password) {
      console.log(`\n未找到 DATABASE_URL，将使用 DATABASE_PASSWORD。\n数据库: postgres@db.${PROJECT_REF}.supabase.co:5432/postgres\n`);
      password = await askPassword();
    }
    if (!password) {
      console.error('❌ 未输入密码，已退出。');
      process.exit(1);
    }
    const encoded = encodeURIComponent(password);
    DATABASE_URL = `postgresql://postgres:${encoded}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  }

  const migrations = [
    '20260310100000_tenant_data_isolation_fix.sql',
    '20260310110000_fix_employee_rpc_tenant_filter.sql',
    '20260310120000_fix_delete_tenant_member_activity_fk.sql',
  ];

  const client = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✓ 已连接数据库');

    for (const name of migrations) {
      const sqlPath = join(__dirname, '..', 'supabase', 'migrations', name);
      const sql = readFileSync(sqlPath, 'utf-8');
      await client.query(sql);
      console.log(`✓ ${name} 执行成功`);
    }

    console.log('\n✓ 租户数据隔离迁移全部完成！');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
