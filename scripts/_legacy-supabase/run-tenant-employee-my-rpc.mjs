#!/usr/bin/env node
/**
 * 租户员工专用 RPC 迁移
 * 创建 get_my_tenant_orders_full、get_my_tenant_usdt_orders_full、
 * get_my_tenant_members_full、get_my_tenant_dashboard_trend
 *
 * 用法：npm run db:tenant-employee-my-rpc
 */
import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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
      console.error("请设置 DATABASE_URL 或 DATABASE_PASSWORD 环境变量（.env 中）");
      process.exit(1);
    }
    const projectRef = getProjectRef();
    DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
  }

  const migrations = [
    "20260329000000_tenant_employee_my_orders_rpc.sql",
    "20260330000000_fix_tenant_employee_data_visibility.sql",
  ];

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    for (const name of migrations) {
      const sqlPath = join(__dirname, "..", "supabase", "migrations", name);
      const sql = readFileSync(sqlPath, "utf-8");
      await client.query(sql);
      console.log(`✓ ${name}`);
    }
    console.log("\n✓ 租户员工专用 RPC 与 verify 修复已应用");
    console.log("  002 员工登录后应能正常看到订单、会员和仪表盘数据");
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
