#!/usr/bin/env node
/**
 * 执行迁移：将 orders 表中 platform 租户的订单归属到 FastGC
 * 用法：npm run db:reassign-orders-fastgc
 * 需要：DATABASE_URL 或 DATABASE_PASSWORD（在 .env 或 server/.env）
 */
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
function getProjectRef() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : (process.env.SUPABASE_PROJECT_REF || "dhlwefrcowefvbxutsmc");
}
const migrationFile = "20260408000023_reassign_orders_platform_to_fastgc.sql";
const migrationPath = join(__dirname, "..", "supabase", "migrations", migrationFile);

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

const { Client } = pg;

async function main() {
  const sql = await fs.readFile(migrationPath, "utf8");
  let databaseUrl =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL;

  if (!databaseUrl) {
    const password = process.env.DATABASE_PASSWORD?.trim();
    if (password) {
      const projectRef = getProjectRef();
      databaseUrl = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
    }
  }

  if (!databaseUrl) {
    console.error("需要 DATABASE_URL 或 DATABASE_PASSWORD（在 .env 或 server/.env）");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("✓ 已连接数据库");
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`✓ ${migrationFile} 执行成功`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("✗ 迁移失败:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
