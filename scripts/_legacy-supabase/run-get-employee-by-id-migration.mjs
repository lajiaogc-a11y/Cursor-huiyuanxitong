#!/usr/bin/env node
/**
 * 执行 get_employee_by_id RPC 迁移
 * 供 /api/auth/me 使用，修复登录后 /me 返回 401 的问题
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', 'server', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
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
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('❌ 需要 DATABASE_URL。请在 .env 或 server/.env 中配置，或运行: supabase db push');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '20260408000022_get_employee_by_id_rpc.sql');

  try {
    await client.connect();
    const sql = readFileSync(sqlPath, 'utf-8');
    await client.query(sql);
    console.log('✓ get_employee_by_id RPC 已创建');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
