#!/usr/bin/env node
/**
 * 任务表 RLS 迁移：允许平台总管理员在查看租户时操作任务数据
 * 修复「创建并分配」失败（平台管理员查看租户时 RLS 拒绝）
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
}
loadEnv();

function getProjectRef() {
  const url = process.env.VITE_SUPABASE_URL || '';
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : process.env.SUPABASE_PROJECT_REF || 'dhlwefrcowefvbxutsmc';
}

async function main() {
  let DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    const password = process.env.DATABASE_PASSWORD?.trim();
    if (!password) {
      console.error('请设置 DATABASE_URL 或 DATABASE_PASSWORD 环境变量（.env 中）');
      process.exit(1);
    }
    const projectRef = getProjectRef();
    DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
  }

  const basePath = join(__dirname, '..', 'supabase', 'migrations');
  const tablesPath = join(basePath, '20260314000000_task_management_tables.sql');
  const platformAdminPath = join(basePath, '20260316000000_task_tables_platform_admin.sql');

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();

    // 1. 先执行任务管理表迁移（若表已存在则 CREATE TABLE IF NOT EXISTS 会跳过）
    try {
      const tablesSql = readFileSync(tablesPath, 'utf-8');
      await client.query(tablesSql);
      console.log('✓ 任务管理表迁移已执行');
    } catch (e) {
      if (e.message?.includes('does not exist')) throw e;
      console.warn('任务管理表迁移跳过或部分失败:', e.message);
    }

    // 2. 执行平台管理员 RLS 迁移
    const sql = readFileSync(platformAdminPath, 'utf-8');
    await client.query(sql);
    console.log('✓ 任务表 RLS 迁移成功！平台管理员查看租户时可创建并分配任务。');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
