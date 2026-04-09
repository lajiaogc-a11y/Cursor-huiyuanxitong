#!/usr/bin/env node
/**
 * 调用 rpc_seed_knowledge_categories RPC 填充知识库分类
 * 用法: node scripts/call-seed-knowledge-rpc.mjs
 * 依赖: server/.env 需包含 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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
const url = env.SUPABASE_URL || process.env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('错误: 请在 server/.env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const rpcUrl = url.replace(/\/$/, '') + '/rest/v1/rpc/rpc_seed_knowledge_categories';

async function main() {
  console.log('调用 RPC:', rpcUrl);
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

  if (!res.ok) {
    console.error('RPC 调用失败');
    console.error('HTTP 状态:', res.status, res.statusText);
    console.error('响应:', JSON.stringify(data, null, 2));

    const msg = typeof data?.message === 'string' ? data.message : '';
    const hint = typeof data?.hint === 'string' ? data.hint : '';
    const isFunctionMissing =
      res.status === 404 ||
      /function.*does not exist|relation.*does not exist/i.test(msg) ||
      /function.*does not exist/i.test(hint);

    if (isFunctionMissing) {
      const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260420000000_seed_knowledge_categories_rpc.sql');
      console.error('\n--- RPC 函数可能尚未创建，请先执行迁移 SQL ---');
      console.error('方法 1: 在 Supabase Dashboard -> SQL Editor 中执行以下文件内容:');
      console.error('  ' + migrationPath);
      console.error('\n方法 2: 使用 supabase db push 或 supabase migration up 应用迁移');
      try {
        const sql = readFileSync(migrationPath, 'utf-8');
        console.error('\n--- 迁移 SQL 内容 (可复制到 SQL Editor) ---\n');
        console.error(sql);
      } catch (e) {
        console.error('无法读取迁移文件:', e.message);
      }
    }
    process.exit(1);
  }

  console.log('RPC 响应:', JSON.stringify(data, null, 2));
  if (data?.seeded) {
    console.log('成功: 已填充', data.count ?? 4, '条知识库分类');
  } else if (data?.message) {
    console.log('提示:', data.message);
  }
}

main().catch((e) => {
  console.error('异常:', e.message);
  process.exit(1);
});
