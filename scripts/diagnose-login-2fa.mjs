#!/usr/bin/env node
/**
 * 诊断登录 2FA 问题：检查 RPC、2FA 配置、权限
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

  const client = new pg.Client({ connectionString: DATABASE_URL });
  const results = { rpcResult: null, twoFaSettings: null, functionDef: null, grantCheck: null };

  try {
    await client.connect();

    console.log('=== 1. verify_employee_login_2fa RPC 直接调用 ===');
    const rpcRes = await client.query("SELECT * FROM verify_employee_login_2fa('wangchao', NULL)");
    results.rpcResult = rpcRes.rows;
    console.log('返回行数:', rpcRes.rows.length);
    console.log('返回数据:', JSON.stringify(rpcRes.rows, null, 2));

    console.log('\n=== 2. employee_login_2fa_settings 表数据 ===');
    const twoFaRes = await client.query(`
      SELECT s.*, e.username
      FROM employee_login_2fa_settings s
      JOIN employees e ON e.id = s.employee_id
      WHERE e.username = 'wangchao'
    `);
    results.twoFaSettings = twoFaRes.rows;
    console.log('返回行数:', twoFaRes.rows.length);
    if (twoFaRes.rows.length > 0) {
      const r = twoFaRes.rows[0];
      console.log('enabled:', r.enabled, '| code_hash:', r.code_hash ? '***' : null, '| updated_at:', r.updated_at);
    } else {
      console.log('(无记录)');
    }

    console.log('\n=== 3. 函数定义（简化） ===');
    try {
      const fnRes = await client.query(`
        SELECT pg_get_functiondef(oid) as def
        FROM pg_proc WHERE proname = 'verify_employee_login_2fa'
      `);
      if (fnRes.rows.length > 0) {
        const def = fnRes.rows[0].def;
        results.functionDef = def;
        const retMatch = def.match(/RETURNS TABLE\s*\(([^)]+)\)/);
        console.log('RETURNS TABLE:', retMatch ? retMatch[1] : 'N/A');
      } else {
        console.log('函数未找到');
      }
    } catch (e) {
      console.log('获取函数定义失败:', e.message);
    }

    console.log('\n=== 4. anon 执行权限 ===');
    const grantRes = await client.query(`
      SELECT has_function_privilege('anon', 'verify_employee_login_2fa(text, text)', 'EXECUTE') as can_execute
    `);
    results.grantCheck = grantRes.rows[0]?.can_execute;
    console.log('anon 可执行:', results.grantCheck);

    return results;
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

main();