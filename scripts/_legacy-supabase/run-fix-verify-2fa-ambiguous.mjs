#!/usr/bin/env node
/**
 * 执行 verify_employee_login_2fa 歧义修复
 */
import pg from 'pg';
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

function getProjectRef() {
  const url = (process.env.VITE_SUPABASE_URL || '').replace(/^["']|["']$/g, '');
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : process.env.VITE_SUPABASE_PROJECT_ID || 'dhlwefrcowefvbxutsmc';
}

async function main() {
  const password = (process.env.DATABASE_PASSWORD || '').trim();
  if (!password) {
    console.error('请在 .env 中设置 DATABASE_PASSWORD');
    process.exit(1);
  }
  const projectRef = getProjectRef();
  const DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;

  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '20260408000016_fix_verify_employee_login_2fa_ambiguous.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✓ verify_employee_login_2fa 歧义修复成功');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
