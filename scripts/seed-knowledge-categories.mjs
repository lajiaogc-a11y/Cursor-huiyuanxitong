#!/usr/bin/env node
/**
 * 当 knowledge_categories 为空时，插入默认分类
 * 用法: node scripts/seed-knowledge-categories.mjs
 * 需要: server/.env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', 'server', '.env');
    const content = readFileSync(envPath, 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return env;
  } catch (_) {
    return {};
  }
}

const env = loadEnv();
const url = (env.SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ 请在 server/.env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const rpcUrl = url + '/rest/v1/rpc/rpc_seed_knowledge_categories';

async function main() {
  // 1. 调用 RPC（SECURITY DEFINER 绕过 tenant_id/RLS）
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (res.ok && data) {
    if (data.seeded) {
      console.log('✓ 已插入', data.count ?? 4, '个默认公司文档分类');
      return;
    }
    if (data.message) {
      console.log('✓', data.message);
      return;
    }
  }

  // 2. RPC 不存在或失败：提示执行 SQL
  const is404 = res.status === 404;
  const msg = String(data?.message || data?.raw || '');
  const isFnMissing = is404 || /function.*does not exist/i.test(msg);

  if (isFnMissing) {
    console.error('❌ RPC 函数尚未创建，请先在 Supabase SQL Editor 中执行以下 SQL：\n');
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260420000000_seed_knowledge_categories_rpc.sql');
    try {
      console.log(readFileSync(migrationPath, 'utf-8'));
    } catch (e) {
      console.error('无法读取迁移文件:', e.message);
    }
    console.error('\n执行完成后，再次运行: npm run db:seed-knowledge');
    process.exit(1);
  }

  console.error('❌ 插入失败:', msg || res.statusText);
  process.exit(1);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
