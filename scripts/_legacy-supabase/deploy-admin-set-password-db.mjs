#!/usr/bin/env node
/**
 * 通过数据库连接执行「设置密码」相关 SQL（添加列 + 创建 RPC）
 * 使用 .env 中的 DATABASE_PASSWORD
 * 执行后前端将使用 RPC，无需部署 Edge Function
 */
import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = "dhlwefrcowefvbxutsmc";

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

const SQL = `
-- 1. 确保 members 表有密码/游戏化相关列
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS initial_password_sent_at timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS wallet_balance numeric DEFAULT 0;

-- 2. 创建 verify_member_password RPC（会员登录验证，支持手机号或会员编号）
CREATE OR REPLACE FUNCTION public.verify_member_password(p_phone text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM members
  WHERE phone_number = trim(p_phone) OR member_code = trim(p_phone)
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_NOT_FOUND');
  END IF;
  IF v_member.password_hash IS NULL OR v_member.password_hash = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_PASSWORD_SET');
  END IF;
  IF v_member.password_hash LIKE '$2%' AND v_member.password_hash = extensions.crypt(trim(p_password), v_member.password_hash) THEN
    RETURN jsonb_build_object(
      'success', true,
      'member', jsonb_build_object(
        'id', v_member.id,
        'member_code', v_member.member_code,
        'phone_number', v_member.phone_number,
        'nickname', v_member.nickname,
        'member_level', v_member.member_level,
        'wallet_balance', COALESCE(v_member.wallet_balance, 0)
      )
    );
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'WRONG_PASSWORD');
END;
$$;

-- 3. 创建 admin_set_member_initial_password RPC（员工后台设置密码）
CREATE OR REPLACE FUNCTION public.admin_set_member_initial_password(p_member_id uuid, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(trim(p_new_password)) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'PASSWORD_TOO_SHORT');
  END IF;
  UPDATE members SET
    password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
    initial_password_sent_at = now(),
    updated_at = now()
  WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_NOT_FOUND');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
`;

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
    await client.query(SQL);
    console.log("✓ 迁移执行成功！verify_member_password 与 admin_set_member_initial_password 已就绪。");
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
