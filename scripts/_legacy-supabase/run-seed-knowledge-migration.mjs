#!/usr/bin/env node
/**
 * 通过直接数据库连接执行 RPC 迁移并填充公司文档分类
 * 用法: node scripts/run-seed-knowledge-migration.mjs
 * 需要: server/.env 中 DATABASE_URL 或 (SUPABASE_URL + DATABASE_PASSWORD)
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const p of [join(__dirname, '..', 'server', '.env'), join(__dirname, '..', '.env')]) {
    try {
      const content = readFileSync(p, 'utf-8');
      for (const line of content.split('\n')) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    } catch (_) {}
  }
}
loadEnv();

function getDbUrl() {
  let url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
  if (url) return url;
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const m = supabaseUrl.match(/https:\/\/([^.]+)/);
  const projectRef = m ? m[1] : '';
  const password = process.env.DATABASE_PASSWORD || process.env.SUPABASE_DB_PASSWORD || '';
  if (projectRef && password) {
    return `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
  }
  return null;
}

async function main() {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    console.error('❌ 需要 DATABASE_URL 或 (SUPABASE_URL + DATABASE_PASSWORD)');
    console.error('   或先在 Supabase SQL Editor 执行 docs/FIX_KNOWLEDGE_CATEGORIES.md 中的 SQL');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260420000000_seed_knowledge_categories_rpc.sql');

  try {
    await client.connect();
    const sql = readFileSync(migrationPath, 'utf-8');
    await client.query(sql);
    console.log('✓ RPC 函数已创建');

    const { rows } = await client.query('SELECT rpc_seed_knowledge_categories() as result');
    const raw = rows[0]?.result;
    const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (r?.seeded) {
      console.log('✓ 已插入', r.count ?? 4, '个默认公司文档分类');
    } else if (r?.message) {
      console.log('✓', r.message);
    } else {
      console.log('结果:', r);
    }
  } catch (err) {
    console.error('❌ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
