#!/usr/bin/env node
/**
 * 将指定员工的 2FA 验证码设置为 123456（用于无法登录时紧急修复）
 * 用法: node scripts/set-employee-2fa-123456.mjs [username]
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
  const code = '123456';

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
      INSERT INTO public.employee_login_2fa_settings (employee_id, enabled, code_hash, updated_at)
      VALUES ($1, true, crypt($2, gen_salt('bf')), now())
      ON CONFLICT (employee_id)
      DO UPDATE SET
        enabled = true,
        code_hash = crypt($2, gen_salt('bf')),
        updated_at = now()
    `, [employeeId, code]);

    console.log(`✓ 已将 ${username} 的 2FA 验证码设置为 ${code}`);
    console.log(`  登录时在「二次验证码」输入框输入: ${code}`);
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
