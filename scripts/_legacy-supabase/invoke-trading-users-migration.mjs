#!/usr/bin/env node
/**
 * 通过 run-migration Edge Function 执行交易用户修复
 * 需要 run-migration 已部署且支持 POST body 中的 sql 参数
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 从 .env 加载
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://dhlwefrcowefvbxutsmc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function main() {
  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '20260309160000_fix_trading_users_phone_fallback.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  const url = `${SUPABASE_URL}/functions/v1/run-migration`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'x-migration-secret': 'fix-password-2026',
    },
    body: JSON.stringify({ sql }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('请求失败:', res.status, data);
    process.exit(1);
  }
  if (data.results?.custom === 'ok') {
    console.log('✓ 交易用户修复迁移执行成功');
  } else {
    console.error('执行结果:', data);
    if (data.results?.custom) {
      console.error('错误:', data.results.custom);
    }
    process.exit(1);
  }
}

main();
