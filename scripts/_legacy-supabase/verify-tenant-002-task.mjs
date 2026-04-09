#!/usr/bin/env node
/**
 * TASK STEP 1 — Verify Tenant 002 Data Exists
 *
 * Schema note: orders and members do NOT have tenant_id column.
 * Data is linked via creator_id/sales_user_id/recorder_id → employees.tenant_id.
 * For tenant 002, RPC returns all orders/members (including orphans).
 *
 * 用法：npm run verify:tenant-002
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
      SELECT id FROM tenants WHERE tenant_code = '002' LIMIT 1
    `);
    if (!t) {
      console.log("❌ 租户 002 不存在");
      process.exit(1);
    }
    const v002 = t.id;

    // 002 RPC 返回全部订单和会员（含孤儿数据），此处统计总数
    const { rows: [o] } = await client.query(`
      SELECT COUNT(*)::int as cnt FROM orders WHERE (is_deleted = false OR is_deleted IS NULL)
    `);
    const { rows: [m] } = await client.query(`SELECT COUNT(*)::int as cnt FROM members`);

    const ordersCount = o?.cnt ?? 0;
    const membersCount = m?.cnt ?? 0;

    console.log("STEP 1 — Verify Tenant 002 Data Exists");
    console.log("--------------------------------------");
    console.log("orders (tenant 002 visible):", ordersCount, ordersCount >= 800 ? "✓" : "(expected ~808)");
    console.log("members (tenant 002 visible):", membersCount, membersCount >= 500 ? "✓" : "(expected ~550)");
    console.log("");

    if (ordersCount > 0 && membersCount > 0) {
      console.log("✓ Data exists. Continue to STEP 2-7.");
    } else {
      console.log("⚠ Data count lower than expected. Check migrations.");
    }
  } catch (err) {
    console.error("执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
