import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Client } = pg;

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260407000000_phone_pool_extract_guard_and_consume.sql"
);

async function main() {
  const sql = await fs.readFile(migrationPath, "utf8");

  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL;

  if (!databaseUrl) {
    console.error("Missing DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log("✓ 已连接数据库");
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✓ 20260407000000_phone_pool_extract_guard_and_consume.sql 执行成功");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("✗ 迁移失败:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

