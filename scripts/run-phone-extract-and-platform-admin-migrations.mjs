#!/usr/bin/env node
/**
 * 执行号码提取与平台管理员迁移
 * 1. rpc_extract_phones_by_employee - 支持通过 employee_id 提取
 * 2. 平台总管理员归属到 platform 租户
 */
import pg from "pg";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "dhlwefrcowefvbxutsmc";

function loadEnv() {
  for (const p of [join(__dirname, "..", "server", ".env"), join(__dirname, "..", ".env")]) {
    try {
      const content = readFileSync(p, "utf-8");
      for (const line of content.split("\n")) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    } catch (_) {}
  }
}
loadEnv();

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const m = url?.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = m ? m[1] : PROJECT_REF;
  const password = process.env.DATABASE_PASSWORD?.trim();
  const DATABASE_URL =
    process.env.DATABASE_URL ||
    (password ? `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres` : null);
  if (!DATABASE_URL) {
    console.error("需要 DATABASE_URL 或 DATABASE_PASSWORD（在 server/.env 或 .env）");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log("✓ 已连接数据库");
    const migrations = [
      "20260415000000_phone_extract_by_employee_id.sql",
      "20260415000001_platform_super_admin_all_to_platform.sql",
    ];
    for (const m of migrations) {
      const sqlPath = join(__dirname, "..", "supabase", "migrations", m);
      const sql = readFileSync(sqlPath, "utf-8");
      await client.query(sql);
      console.log(`✓ ${m} 执行成功`);
    }
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
