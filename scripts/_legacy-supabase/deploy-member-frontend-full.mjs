#!/usr/bin/env node
/**
 * 会员前端完整数据库迁移：表 + 所有 RPC
 * 使用 .env 中的 DATABASE_PASSWORD
 */
import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const PROJECT_REF = "dhlwefrcowefvbxutsmc";

function loadEnv() {
  try {
    const content = readFileSync(join(projectRoot, ".env"), "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch (_) {}
}
loadEnv();

const migrations = [
  "supabase/migrations/20260318000000_member_gamification_tables.sql",
  "supabase/migrations/20260318000001_member_checkin_spin_rpc.sql",
  "supabase/migrations/20260318000002_member_redeem_prize_rpc.sql",
  "supabase/migrations/20260318000003_invite_validate_and_submit.sql",
  "supabase/migrations/20260319000001_member_update_nickname_rpc.sql",
];

async function main() {
  const password = process.env.DATABASE_PASSWORD?.trim();
  if (!password) {
    console.error("❌ 未找到 DATABASE_PASSWORD，请在 .env 中配置");
    process.exit(1);
  }
  const encoded = encodeURIComponent(password);
  const DATABASE_URL = `postgresql://postgres:${encoded}@db.${PROJECT_REF}.supabase.co:5432/postgres`;

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log("✓ 已连接数据库");
    for (const rel of migrations) {
      const path = join(projectRoot, rel);
      const sql = readFileSync(path, "utf-8");
      await client.query(sql);
      console.log(`✓ ${rel.split("/").pop()}`);
    }
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("✓ 会员前端所需表与 RPC 已就绪。");
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
