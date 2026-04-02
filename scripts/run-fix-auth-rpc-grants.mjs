#!/usr/bin/env node
/**
 * 授权 anon 角色执行登录相关 RPC
 * 执行后，后端使用 anon key 即可完成登录验证（无需 service_role）
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
  let DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    const password = (process.env.DATABASE_PASSWORD || '').trim();
    if (!password) {
      console.error('请在 .env 中设置 DATABASE_PASSWORD');
      process.exit(1);
    }
    const projectRef = getProjectRef();
    DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
  }

  const sql = `
GRANT EXECUTE ON FUNCTION public.verify_employee_login_detailed(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.log_employee_login(uuid, text, text, boolean, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_employee_login_2fa(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_employee_login_lock(text) TO anon;
GRANT EXECUTE ON FUNCTION public.clear_employee_login_failures(uuid) TO anon;
`;

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✓ 登录 RPC 授权成功！后端使用 anon key 即可完成登录。');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
