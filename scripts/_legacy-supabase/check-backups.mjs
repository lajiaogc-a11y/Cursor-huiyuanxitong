#!/usr/bin/env node
/** 用数据库密码直接查询备份列表（绕过 RLS） */
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

const PROJECT_REF = 'dhlwefrcowefvbxutsmc';
const password = process.env.DATABASE_PASSWORD?.trim();
if (!password) {
  console.error('❌ 未配置 DATABASE_PASSWORD');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
});

async function main() {
  await client.connect();
  const { rows } = await client.query(`
    SELECT id, backup_name, status, created_at, storage_path, record_counts
    FROM data_backups
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log('备份列表:');
  if (rows.length === 0) {
    console.log('  (无)');
  } else {
    rows.forEach((r) => {
      console.log(`  ${r.id} | ${r.status} | storage: ${r.storage_path || 'null'} | ${r.created_at} | ${r.backup_name}`);
    });
  }
  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
