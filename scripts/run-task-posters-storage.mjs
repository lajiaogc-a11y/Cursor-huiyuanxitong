#!/usr/bin/env node
/**
 * 任务海报存储桶迁移：创建 task-posters 存储桶，用于保存汇率海报
 * 解决「保存到海报库」失败（base64 过大无法存入数据库）
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

  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '20260315000000_task_posters_storage.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✓ 任务海报存储桶迁移成功！task-posters 桶已创建，保存到海报库功能可用。');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
