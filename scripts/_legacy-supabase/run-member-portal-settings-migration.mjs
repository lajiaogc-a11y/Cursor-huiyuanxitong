#!/usr/bin/env node
/**
 * 执行迁移：会员前端租户化设置后台
 * 文件：20260403000002_member_portal_settings.sql
 */
import pg from "pg";
import { createInterface } from "readline";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "dhlwefrcowefvbxutsmc";

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

function askPassword() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question("请输入 Supabase 数据库密码（Project Settings → Database）: ", (pwd) => {
      rl.close();
      resolve((pwd || "").trim());
    });
  });
}

async function main() {
  let DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    let password = process.env.DATABASE_PASSWORD?.trim();
    if (!password) {
      console.log(`
未找到 DATABASE_URL 或 DATABASE_PASSWORD，将使用交互式输入。
数据库：postgres@db.${PROJECT_REF}.supabase.co:5432/postgres
`);
      password = await askPassword();
    }
    if (!password) {
      console.error("❌ 未输入密码，已退出。");
      process.exit(1);
    }
    DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  const migrationFile = "20260403000002_member_portal_settings.sql";
  const sqlPath = join(__dirname, "..", "supabase", "migrations", migrationFile);

  try {
    await client.connect();
    console.log("✓ 已连接数据库");
    await client.query(readFileSync(sqlPath, "utf-8"));
    console.log(`✓ ${migrationFile} 执行成功`);
    console.log("✓ 已启用会员系统租户化设置（公司名/Logo/活动开关）");
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
