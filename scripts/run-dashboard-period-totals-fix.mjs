#!/usr/bin/env node
/**
 * 修复仪表盘 period_totals 作用域错误
 * 解决 "relation period_totals does not exist" 导致数据统计页加载失败
 *
 * 用法：npm run db:fix-dashboard-period-totals
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

  const sqlPath = join(__dirname, "..", "supabase", "migrations", "20260331200000_fix_dashboard_period_totals_scope.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log("✓ 已连接数据库");
    await client.query(sql);
    console.log("✓ platform_get_dashboard_trend_data 已修复");
    console.log("\n✓ 仪表盘修复完成，数据统计页应可正常加载");
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
