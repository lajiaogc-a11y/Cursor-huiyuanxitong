#!/usr/bin/env node
/**
 * 号码提取统计：增加 user_today_extract_actions
 * 执行 20260403000010_phone_stats_extract_actions.sql
 *
 * 需要 .env 中配置 DATABASE_PASSWORD
 */
import pg from 'pg';
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

async function main() {
  const password = process.env.DATABASE_PASSWORD?.trim();
  if (!password) {
    console.error('❌ 未配置 DATABASE_PASSWORD');
    process.exit(1);
  }
  const client = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
  });
  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '20260403000010_phone_stats_extract_actions.sql');
  try {
    await client.connect();
    console.log('✓ 已连接数据库');
    await client.query(readFileSync(sqlPath, 'utf-8'));
    console.log('✓ 20260403000010_phone_stats_extract_actions.sql 执行成功');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
