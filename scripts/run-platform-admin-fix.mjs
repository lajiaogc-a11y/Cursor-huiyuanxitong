#!/usr/bin/env node
/**
 * 执行平台总管理员归属修复：将 admin 等平台总管理从 002 移至 platform 租户
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'dhlwefrcowefvbxutsmc';

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
  let DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    const password = process.env.DATABASE_PASSWORD?.trim();
    if (!password) {
      console.error('请设置 DATABASE_URL 或 DATABASE_PASSWORD');
      process.exit(1);
    }
    DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  }

  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '20260311400000_platform_super_admin_to_platform_tenant.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✓ 迁移执行成功！平台总管理员已归属到 platform 租户，独立于 002 等业务租户。');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
