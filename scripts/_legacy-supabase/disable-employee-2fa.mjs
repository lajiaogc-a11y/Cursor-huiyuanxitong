#!/usr/bin/env node
/**
 * 取消指定员工的 2FA，使其仅用用户名+密码登录
 * 用法: node scripts/disable-employee-2fa.mjs [username]
 * 默认: wangchao
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
  const username = process.argv[2] || 'wangchao';

  const password = (process.env.DATABASE_PASSWORD || '').trim();
  if (!password) {
    console.error('请在 .env 中设置 DATABASE_PASSWORD');
    process.exit(1);
  }

  const projectRef = getProjectRef();
  const DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();

    const empRes = await client.query(
      "SELECT id FROM public.employees WHERE username = $1 LIMIT 1",
      [username.trim()]
    );
    if (empRes.rows.length === 0) {
      console.error(`员工 "${username}" 不存在`);
      process.exit(1);
    }
    const employeeId = empRes.rows[0].id;

    await client.query(`
      INSERT INTO public.employee_login_2fa_settings (employee_id, enabled, updated_at)
      VALUES ($1, false, now())
      ON CONFLICT (employee_id) DO UPDATE SET enabled = false, updated_at = now()
    `, [employeeId]);

    console.log(`✓ 已取消 ${username} 的 2FA，现仅需用户名+密码登录`);
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
