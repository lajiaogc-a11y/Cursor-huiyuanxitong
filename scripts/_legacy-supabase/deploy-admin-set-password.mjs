#!/usr/bin/env node
/**
 * 部署 admin-set-member-password Edge Function
 *
 * 方式一：使用 Access Token（推荐）
 *   1. 打开 https://supabase.com/dashboard/account/tokens 创建 token
 *   2. 执行: $env:SUPABASE_ACCESS_TOKEN="你的token"; npm run deploy:set-password-fn
 *
 * 方式二：先登录
 *   1. 执行: npx supabase login（会打开浏览器）
 *   2. 执行: npm run deploy:set-password-fn
 */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const projectRef = "dhlwefrcowefvbxutsmc";
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.log("提示：设置 SUPABASE_ACCESS_TOKEN 可免登录部署");
  console.log("  获取: https://supabase.com/dashboard/account/tokens");
  console.log("  PowerShell: $env:SUPABASE_ACCESS_TOKEN=\"你的token\"; npm run deploy:set-password-fn\n");
}

console.log("正在部署 admin-set-member-password Edge Function...");
try {
  const env = { ...process.env };
  if (token) env.SUPABASE_ACCESS_TOKEN = token;
  execSync(
    `npx supabase functions deploy admin-set-member-password --project-ref ${projectRef}`,
    { cwd: projectRoot, stdio: "inherit", env }
  );
  console.log("\n✅ 部署成功！");
  console.log("\n请确保 members 表已添加密码列，在 Supabase SQL Editor 执行：");
  console.log("  ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash text;");
  console.log("  ALTER TABLE members ADD COLUMN IF NOT EXISTS initial_password_sent_at timestamptz;");
} catch (e) {
  const msg = e.message || "";
  if (msg.includes("Access token") || msg.includes("not provided")) {
    console.error("\n❌ 未认证。请任选一种方式：");
    console.error("  1. 设置 SUPABASE_ACCESS_TOKEN 后重试（见上方提示）");
    console.error("  2. 先执行 npx supabase login，再运行此脚本");
  } else {
    throw e;
  }
  process.exit(1);
}
