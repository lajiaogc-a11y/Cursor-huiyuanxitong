#!/usr/bin/env node
/**
 * 号码提取器（Phone Extractor）数据库迁移
 * 执行 4 个迁移文件：表结构、函数、管理员 RPC、RLS 回退
 *
 * 方式一：.env 中配置 DATABASE_URL 或 DATABASE_PASSWORD
 * 方式二：PowerShell: $env:DATABASE_PASSWORD="密码"; npm run db:phone-pool
 * 方式三：直接运行，按提示输入密码
 */
import pg from 'pg';
import { createInterface } from 'readline';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'dhlwefrcowefvbxutsmc';

const MIGRATIONS = [
  '20260401000000_phone_pool_tables.sql',
  '20260401000001_phone_pool_functions.sql',
  '20260401000002_phone_pool_admin_rpcs.sql',
  '20260401000003_phone_pool_rls_fallback.sql',
  '20260401000004_phone_extract_records_rpc.sql',
  '20260401000005_phone_pool_grants_and_fix.sql',
  '20260401000006_phone_bulk_import_fix.sql',
  '20260401000007_phone_bulk_import_no_check.sql',
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
      console.log(`
未找到 DATABASE_URL 或 DATABASE_PASSWORD，将使用交互式输入。
数据库：postgres@db.${PROJECT_REF}.supabase.co:5432/postgres
`);
      password = await askPassword();
    }
    if (!password) {
      console.error('❌ 未输入密码，已退出。');
      process.exit(1);
    }
    const encoded = encodeURIComponent(password);
    DATABASE_URL = `postgresql://postgres:${encoded}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');

  try {
    await client.connect();
    console.log('✓ 已连接数据库');
    for (const name of MIGRATIONS) {
      const sqlPath = join(migrationsDir, name);
      const sql = readFileSync(sqlPath, 'utf-8');
      await client.query(sql);
      console.log(`✓ ${name}`);
    }
    console.log('\n✓ 号码提取器迁移全部执行成功！');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
