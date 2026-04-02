#!/usr/bin/env node
/**
 * 恢复租户 002 的所有数据
 *
 * 方式 1：从备份恢复（推荐，若有备份）
 *   npm run restore-full
 *   或
 *   node scripts/restore-full.mjs [备份ID]
 *
 * 方式 2：执行 restore_tenant_002 迁移（修复 tenant_id 归属）
 *   npm run db:restore-tenant-002
 *
 * 本脚本执行方式 2：将 tenant_id 为 null 的员工归属到 002，并将曾被误移出的员工移回
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
    "20260323000000_restore_tenant_002_all_data.sql",
    "20260324000000_fix_tenant_002_data_visibility.sql",
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
    console.log("\n✓ 租户 002 数据恢复完成（含 RLS 策略，002 员工可见数据）！");
    console.log("\n若数据仍不完整，请检查：");
    console.log("  1. 是否有备份：在平台设置→数据备份中执行「立即备份」后，可用 npm run restore-full 从备份恢复");
    console.log("  2. 员工 tenant_id 是否正确：登录 Supabase 控制台查看 employees 表");
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
