#!/usr/bin/env node
/**
 * 添加公司文档公开读取策略，使 Supabase 客户端能直接读到数据
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
  let url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
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
    console.error('   或复制 supabase/migrations/20260422000000_knowledge_public_read.sql 到 Supabase SQL Editor 执行');
    process.exit(1);
  }

  const sql = `
DROP POLICY IF EXISTS "知识库分类公开可读" ON public.knowledge_categories;
DROP POLICY IF EXISTS "知识库文章公开可读" ON public.knowledge_articles;
CREATE POLICY "知识库分类公开可读" ON public.knowledge_categories FOR SELECT USING (true);
CREATE POLICY "知识库文章公开可读" ON public.knowledge_articles FOR SELECT USING (is_published = true);
`;

  const client = new pg.Client({ connectionString: dbUrl });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✓ 公司文档公开读取策略已添加');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
