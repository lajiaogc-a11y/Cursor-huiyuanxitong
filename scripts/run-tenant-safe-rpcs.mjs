#!/usr/bin/env node
/**
 * 租户隔离 RPC 迁移：upsert_shared_data_for_my_tenant、get_member_by_phone_for_my_tenant
 * 不迁移任何数据，仅新增函数，租户数据永不跨租户
 *
 * 用法：npm run db:tenant-safe-rpcs
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

  const sqlPath = join(__dirname, "..", "supabase", "migrations", "run_tenant_safe_rpcs.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log("✓ 已连接数据库");
    await client.query(sql);
    console.log("✓ upsert_shared_data_for_my_tenant 已创建");
    console.log("✓ get_member_by_phone_for_my_tenant 已创建");
    console.log("\n✓ 租户隔离 RPC 迁移完成");
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
