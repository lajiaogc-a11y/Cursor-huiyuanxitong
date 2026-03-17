#!/usr/bin/env node
/**
 * 通过数据库连接执行「号码池 return/consume 的 employee_id 版本」SQL
 * 解决：归还失败 (function rpc_return_phones_by_employee does not exist)
 *      删除失败 (function rpc_consume_phones_by_employee does not exist)
 *
 * 使用 .env 中的 DATABASE_PASSWORD 或 DATABASE_URL
 * 执行后号码提取的归还、删除将正常工作
 */
import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const rel of [".env", "server/.env"]) {
    try {
      const envPath = join(__dirname, "..", rel);
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
      break;
    } catch (_) {}
  }
}
loadEnv();

function getProjectRef() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : process.env.SUPABASE_PROJECT_REF || "dhlwefrcowefvbxutsmc";
}

const SQL = `
-- 号码池 return/consume 的 employee_id 版本，供后端 API 使用
-- 前端 JWT 登录时 auth.uid() 为 null，需通过后端 API 调用这些函数

CREATE OR REPLACE FUNCTION public.rpc_return_phones_by_employee(
  phone_ids BIGINT[],
  p_employee_id UUID
)
RETURNS TABLE(returned_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pid BIGINT;
BEGIN
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_id_required';
  END IF;
  IF phone_ids IS NULL OR array_length(phone_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  FOREACH pid IN ARRAY phone_ids LOOP
    UPDATE phone_pool
    SET status = 'available', reserved_by = NULL, reserved_at = NULL
    WHERE id = pid AND reserved_by = p_employee_id AND status = 'reserved';
    IF FOUND THEN
      INSERT INTO phone_reservations (phone_pool_id, user_id, action) VALUES (pid, p_employee_id, 'return');
      RETURN QUERY SELECT pid;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_consume_phones_by_employee(
  phone_ids BIGINT[],
  p_employee_id UUID
)
RETURNS TABLE(consumed_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pid BIGINT;
BEGIN
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_id_required';
  END IF;
  IF phone_ids IS NULL OR array_length(phone_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  FOREACH pid IN ARRAY phone_ids LOOP
    UPDATE phone_pool
    SET status = 'consumed', reserved_by = NULL, reserved_at = NULL
    WHERE id = pid AND reserved_by = p_employee_id AND status = 'reserved';
    IF FOUND THEN
      INSERT INTO phone_reservations (phone_pool_id, user_id, action) VALUES (pid, p_employee_id, 'consume');
      RETURN QUERY SELECT pid;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.rpc_return_phones_by_employee(bigint[], uuid) IS 'Backend-only: return phones using employee_id';
COMMENT ON FUNCTION public.rpc_consume_phones_by_employee(bigint[], uuid) IS 'Backend-only: consume phones using employee_id';
`;

async function main() {
  let DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
  if (!DATABASE_URL) {
    const password = process.env.DATABASE_PASSWORD?.trim();
    if (!password) {
      console.error("❌ 未找到 DATABASE_PASSWORD 或 DATABASE_URL，请在 .env 中配置");
      process.exit(1);
    }
    const projectRef = getProjectRef();
    DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("✓ 已连接数据库");
    await client.query(SQL);
    console.log("✓ 迁移执行成功！rpc_return_phones_by_employee 与 rpc_consume_phones_by_employee 已就绪。");
    console.log("  号码提取的归还、删除功能将正常工作。");
  } catch (err) {
    console.error("✗ 执行失败:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
