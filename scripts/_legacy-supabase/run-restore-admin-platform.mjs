#!/usr/bin/env node
/**
 * 恢复 admin 为平台总后台账号（总跟后台）
 * 问题：admin 被误设为租户账号（如 002），导致只能看租户数据
 * 修复：将 admin 归属到 platform 租户，is_super_admin=true，并确保 platform 的 admin_employee_id 指向 admin
 *
 * 用法: npm run db:restore-admin-platform
 * 或: node scripts/run-restore-admin-platform.mjs
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getProjectRef() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : process.env.SUPABASE_PROJECT_REF || 'dhlwefrcowefvbxutsmc';
}

function loadEnv() {
  for (const p of [join(__dirname, '..', 'server', '.env'), join(__dirname, '..', '.env')]) {
    try {
      const content = readFileSync(p, 'utf-8');
      for (const line of content.split('\n')) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    } catch (_) {}
  }
}
loadEnv();

const SQL = `
-- 恢复 admin 为平台总后台账号
DO $$
DECLARE
  v_platform_tenant_id uuid;
  v_admin_id uuid;
  v_updated int := 0;
BEGIN
  SELECT id INTO v_platform_tenant_id FROM public.tenants WHERE tenant_code = 'platform' LIMIT 1;
  IF v_platform_tenant_id IS NULL THEN
    INSERT INTO public.tenants (tenant_code, tenant_name, status)
    VALUES ('platform', '平台管理', 'active')
    RETURNING id INTO v_platform_tenant_id;
    RAISE NOTICE '已创建 platform 租户';
  END IF;

  -- 1. 将 admin 归属到 platform，并确保 is_super_admin=true
  UPDATE public.employees e
  SET tenant_id = v_platform_tenant_id, is_super_admin = true
  WHERE e.username = 'admin';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  SELECT id INTO v_admin_id FROM public.employees WHERE username = 'admin' LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE '未找到 admin 账号，请先创建';
    RETURN;
  END IF;

  RAISE NOTICE 'admin 已归属到 platform 租户 (id: %)', v_admin_id;

  -- 2. 清除其他租户对 admin 的引用（防止 admin 被误当作租户管理员）
  UPDATE public.tenants t
  SET admin_employee_id = NULL
  WHERE t.tenant_code != 'platform' AND t.admin_employee_id = v_admin_id;

  -- 3. 确保 platform 的 admin_employee_id 指向 admin
  UPDATE public.tenants t
  SET admin_employee_id = v_admin_id
  WHERE t.tenant_code = 'platform' AND t.id = v_platform_tenant_id;

  RAISE NOTICE 'admin 已恢复为平台总后台账号';
END $$;
`;

async function main() {
  let DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    const password = process.env.DATABASE_PASSWORD?.trim();
    if (!password) {
      console.error('请设置 DATABASE_URL 或 DATABASE_PASSWORD（在 .env 或 server/.env）');
      process.exit(1);
    }
    const projectRef = getProjectRef();
    DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();

    // 先诊断
    const { rows: [adminRow] } = await client.query(`
      SELECT e.id, e.username, e.tenant_id, e.is_super_admin, t.tenant_code
      FROM employees e
      LEFT JOIN tenants t ON t.id = e.tenant_id
      WHERE e.username = 'admin'
    `);
    if (adminRow) {
      console.log('=== 修复前 admin 状态 ===');
      console.log('  tenant:', adminRow.tenant_code || '(null)');
      console.log('  is_super_admin:', adminRow.is_super_admin);
    }

    await client.query(SQL);
    console.log('\n✓ admin 已恢复为平台总后台账号');

    // 修复后确认
    const { rows: [after] } = await client.query(`
      SELECT e.username, t.tenant_code, e.is_super_admin
      FROM employees e
      LEFT JOIN tenants t ON t.id = e.tenant_id
      WHERE e.username = 'admin'
    `);
    if (after) {
      console.log('\n=== 修复后 ===');
      console.log('  tenant:', after.tenant_code || '(null)');
      console.log('  is_super_admin:', after.is_super_admin);
    }
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
