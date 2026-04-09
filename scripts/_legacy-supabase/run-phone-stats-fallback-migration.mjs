#!/usr/bin/env node
/**
 * 号码提取统计无参 RPC 回退迁移
 * 执行 20260408000020_phone_stats_my_tenant_fallback.sql
 */
import pg from 'pg';
import { createInterface } from 'readline';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'dhlwefrcowefvbxutsmc';

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
      console.log(`\n未找到 DATABASE_URL 或 DATABASE_PASSWORD，将使用交互式输入。`);
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
  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '20260408000020_phone_stats_my_tenant_fallback.sql');

  try {
    await client.connect();
    const sql = readFileSync(sqlPath, 'utf-8');
    await client.query(sql);
    console.log('✓ rpc_get_my_tenant_phone_stats 已创建');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
