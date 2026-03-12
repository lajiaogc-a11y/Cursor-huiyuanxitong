#!/usr/bin/env node
/**
 * 修复租户 002 员工看不到数据：更新 orders/members 的 RLS 策略
 * 当 002 员工查看时，允许看到 creator/sales/recorder 已删除或 tenant_id 为 null 的订单/会员
 *
 * 用法：npm run db:fix-tenant-002-employee-rls
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
    "20260325000000_fix_tenant_002_employee_rls.sql",
    "20260326000000_allow_tenant_employee_platform_rpc.sql",
    "20260327000000_force_restore_tenant_002_all_data.sql",
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
    console.log("\n✓ 租户 002 员工数据可见性修复完成");
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
