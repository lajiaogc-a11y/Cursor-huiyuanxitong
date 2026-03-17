#!/usr/bin/env node
/**
 * 诊断租户数据 - 检查 members/orders 的 tenant_id 分布
 * 用法: node scripts/diagnose-tenant-data.mjs
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('需要 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY（在 server/.env 或 .env）');
    process.exit(1);
  }
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = m ? m[1] : 'dhlwefrcowefvbxutsmc';
  const password = process.env.DATABASE_PASSWORD?.trim();
  const DATABASE_URL = process.env.DATABASE_URL ||
    (password ? `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres` : null);
  if (!DATABASE_URL) {
    console.error('需要 DATABASE_URL 或 DATABASE_PASSWORD');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();

    console.log('=== 租户列表 ===');
    const { rows: tenants } = await client.query(`
      SELECT id, tenant_code, tenant_name FROM tenants ORDER BY tenant_code
    `);
    tenants.forEach((t) => console.log(`  ${t.tenant_code}: ${t.id}`));
    console.log('');

    console.log('=== members 按 tenant_id 分布 ===');
    const { rows: memberDist } = await client.query(`
      SELECT tenant_id, COUNT(*) as cnt
      FROM members
      GROUP BY tenant_id
      ORDER BY cnt DESC
    `);
    memberDist.forEach((r) => {
      const tid = r.tenant_id || '(null)';
      const tcode = tenants.find((t) => t.id === r.tenant_id)?.tenant_code || '?';
      console.log(`  ${tid} (${tcode}): ${r.cnt} 条`);
    });
    if (memberDist.length === 0) console.log('  (无数据)');
    console.log('');

    console.log('=== orders 按 tenant_id 分布（未删除） ===');
    const { rows: orderDist } = await client.query(`
      SELECT tenant_id, COUNT(*) as cnt
      FROM orders
      WHERE is_deleted = false OR is_deleted IS NULL
      GROUP BY tenant_id
      ORDER BY cnt DESC
    `);
    orderDist.forEach((r) => {
      const tid = r.tenant_id || '(null)';
      const tcode = tenants.find((t) => t.id === r.tenant_id)?.tenant_code || '?';
      console.log(`  ${tid} (${tcode}): ${r.cnt} 条`);
    });
    if (orderDist.length === 0) console.log('  (无数据)');
    console.log('');

    console.log('=== wangchao 员工信息 ===');
    const { rows: [emp] } = await client.query(`
      SELECT id, username, real_name, tenant_id, is_super_admin
      FROM employees WHERE username = 'wangchao' LIMIT 1
    `);
    if (emp) {
      const tcode = tenants.find((t) => t.id === emp.tenant_id)?.tenant_code || '?';
      console.log(`  tenant_id: ${emp.tenant_id} (${tcode})`);
      console.log(`  该租户 members 数:`, memberDist.find((r) => r.tenant_id === emp.tenant_id)?.cnt ?? 0);
      console.log(`  该租户 orders 数:`, orderDist.find((r) => r.tenant_id === emp.tenant_id)?.cnt ?? 0);
    } else {
      console.log('  ❌ 未找到 wangchao');
    }
  } catch (err) {
    console.error('错误:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
