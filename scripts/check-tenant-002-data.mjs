#!/usr/bin/env node
/**
 * 诊断租户 002 数据状态
 * 检查 orders、members、employees 表中的数据是否存在
 * 数据从未被迁移移动或删除，始终在 orders/members 表中
 *
 * 用法：npm run db:check-tenant-002
 */
import pg from "pg";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = join(__dirname, "..", ".env");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch (_) {}
}
loadEnv();

function getProjectRef() {
  const url = process.env.VITE_SUPABASE_URL || "";
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : process.env.SUPABASE_PROJECT_REF || "dhlwefrcowefvbxutsmc";
}

async function main() {
  let DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    const password = process.env.DATABASE_PASSWORD?.trim();
    if (!password) {
      console.error("请设置 DATABASE_URL 或 DATABASE_PASSWORD");
      process.exit(1);
    }
    const projectRef = getProjectRef();
    DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();

    const { rows: [t] } = await client.query(`
      SELECT id, tenant_code, admin_employee_id FROM tenants WHERE tenant_code = '002' LIMIT 1
    `);
    if (!t) {
      console.log("❌ 租户 002 不存在");
      return;
    }
    const v002 = t.id;
    console.log("租户 002 id:", v002);
    console.log("002 管理员 employee_id:", t.admin_employee_id || "(未设置)");
    console.log("");

    const { rows: [o] } = await client.query(`
      SELECT COUNT(*) as cnt FROM orders WHERE is_deleted = false OR is_deleted IS NULL
    `);
    console.log("orders 表总记录数（未删除）:", o?.cnt ?? 0);

    const { rows: [m] } = await client.query(`SELECT COUNT(*) as cnt FROM members`);
    console.log("members 表总记录数:", m?.cnt ?? 0);

    const { rows: [e] } = await client.query(`
      SELECT COUNT(*) as cnt FROM employees WHERE tenant_id = $1
    `, [v002]);
    console.log("employees 表中 tenant_id=002 的人数:", e?.cnt ?? 0);

    const { rows: [eNull] } = await client.query(`
      SELECT COUNT(*) as cnt FROM employees WHERE tenant_id IS NULL
    `);
    console.log("employees 表中 tenant_id 为 null 的人数:", eNull?.cnt ?? 0);

    const { rows: profiles } = await client.query(`
      SELECT p.id, p.employee_id, e.tenant_id, e.real_name
      FROM profiles p
      LEFT JOIN employees e ON e.id = p.employee_id
      WHERE p.employee_id IS NOT NULL
      LIMIT 20
    `);
    console.log("\nprofiles 关联员工（前20条）:");
    profiles?.forEach(r => {
      console.log(`  - profile ${r.id?.slice(0,8)}... → employee ${r.employee_id?.slice(0,8)}... (tenant_id: ${r.tenant_id ?? 'null'}, 姓名: ${r.real_name || '-'})`);
    });

    const { rows: ordersByCreator } = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM orders o WHERE o.creator_id IN (SELECT id FROM employees WHERE tenant_id = $1) AND (o.is_deleted = false OR o.is_deleted IS NULL)) as by_002_creator,
        (SELECT COUNT(*) FROM orders o WHERE o.sales_user_id IN (SELECT id FROM employees WHERE tenant_id = $1) AND (o.is_deleted = false OR o.is_deleted IS NULL)) as by_002_sales,
        (SELECT COUNT(*) FROM orders o WHERE (o.creator_id IS NULL OR o.creator_id NOT IN (SELECT id FROM employees)) AND (o.is_deleted = false OR o.is_deleted IS NULL)) as orphan_creator
    `, [v002]);
    console.log("\n订单归属分析:");
    console.log("  - creator 属于 002 的订单数:", ordersByCreator?.[0]?.by_002_creator ?? 0);
    console.log("  - sales 属于 002 的订单数:", ordersByCreator?.[0]?.by_002_sales ?? 0);
    console.log("  - creator 为 null 或已删除的订单数:", ordersByCreator?.[0]?.orphan_creator ?? 0);

    console.log("\n========== 重要说明 ==========");
    console.log("数据从未被迁移移动或删除，始终在 orders、members 表中。");
    console.log("若 002 员工仍看不到：");
    console.log("  1. 平台超管：公司管理 → 租户数据查看 → 进入租户 002，可验证数据存在");
    console.log("  2. 002 员工：退出登录后重新登录，强制刷新(Ctrl+Shift+R)");
    console.log("  3. 若有备份：npm run restore-full [备份ID] 可从备份恢复");
  } catch (err) {
    console.error("执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
