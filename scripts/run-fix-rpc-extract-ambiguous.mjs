#!/usr/bin/env node
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

async function main() {
  loadEnv();
  const password = process.env.DATABASE_PASSWORD?.trim();
  if (!password) {
    console.error('❌ 未配置 DATABASE_PASSWORD');
    process.exit(1);
  }

  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260402000000_fix_rpc_extract_phones_ambiguous_id.sql');
  const sql = readFileSync(migrationPath, 'utf-8');

  const client = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.dhlwefrcowefvbxutsmc.supabase.co:5432/postgres`,
  });

  try {
    await client.connect();
    await client.query(sql);
    console.log('✓ 已应用迁移: fix_rpc_extract_phones_ambiguous_id');
  } catch (e) {
    console.error('❌ 执行失败:', e.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

