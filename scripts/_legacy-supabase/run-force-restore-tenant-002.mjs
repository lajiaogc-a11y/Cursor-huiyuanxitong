#!/usr/bin/env node
/**
 * 强制恢复租户 002 的全部数据
 * 1. 强制将所有可能属于 002 的员工归属到 002
 * 2. 修改 RPC：002 查看时返回所有非其他租户的订单/会员
 *
 * 用法：npm run db:force-restore-tenant-002
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
    "20260327000000_force_restore_tenant_002_all_data.sql",
    "20260328000000_tenant_002_see_all_aggressive.sql",
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
    console.log("\n✓ 租户 002 激进恢复完成");
    console.log("  请让 002 员工重新登录或刷新页面后查看");
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
