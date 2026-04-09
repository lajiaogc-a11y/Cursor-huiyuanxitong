#!/usr/bin/env node
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const content = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
}
loadEnv();

const sql1 = readFileSync(
  join(__dirname, '..', 'supabase', 'migrations', '20260311000000_allow_public_read_backups_for_restore.sql'),
  'utf-8'
);
const sql2 = readFileSync(
  join(__dirname, '..', 'supabase', 'migrations', '20260311000001_make_backups_bucket_public.sql'),
  'utf-8'
);
const sql3 = readFileSync(
  join(__dirname, '..', 'supabase', 'migrations', '20260311000002_restore_disable_rls_temporarily.sql'),
  'utf-8'
);
const sql = sql1 + '\n' + sql2 + '\n' + sql3;

const password = (process.env.DATABASE_PASSWORD || '').trim();
if (!password) { console.error('❌ 需要 DATABASE_PASSWORD'); process.exit(1); }
const projectRef = process.env.VITE_SUPABASE_PROJECT_ID || 'aoyvgvecvxfwgrmngnrc';
const client = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`,
});

client.connect()
  .then(() => client.query(sql))
  .then(() => {
    console.log('✓ 迁移执行成功，备份桶已允许公开读取');
    return client.end();
  })
  .catch((e) => {
    console.error('✗', e.message);
    process.exit(1);
  });
