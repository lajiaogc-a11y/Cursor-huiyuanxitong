import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "dhlwefrcowefvbxutsmc";
const migrationFile = "20260408000013_data_migration_verify_and_audit_bundle.sql";
const migrationPath = join(__dirname, "..", "supabase", "migrations", migrationFile);

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
      databaseUrl = `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
    }
  }

  if (!databaseUrl) {
    console.error("Missing DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL / DATABASE_PASSWORD");
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
    console.error("✗ 迁移失败:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
