#!/usr/bin/env node
/**
 * 列出可用的数据备份（用于恢复）
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

const url = process.env.VITE_SUPABASE_URL || '';
const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
const projectRef = m ? m[1] : 'dhlwefrcowefvbxutsmc';
const password = process.env.DATABASE_PASSWORD?.trim();
if (!password) {
  console.error('需要 DATABASE_PASSWORD');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`,
});

async function main() {
  await client.connect();
  const { rows } = await client.query(`
    SELECT id, backup_name, status, created_at, record_counts
    FROM data_backups
    WHERE status = 'success'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  await client.end();
  if (rows.length === 0) {
    console.log('没有找到成功备份。请先在 平台设置→数据备份 中执行「立即备份」');
    process.exit(1);
  }
  console.log('可用备份:');
  rows.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.backup_name} (${r.created_at})`);
    console.log(`     ID: ${r.id}`);
    if (r.record_counts) console.log(`     记录: ${JSON.stringify(r.record_counts)}`);
  });
  console.log('\n恢复命令: npm run restore-full-db ' + rows[0].id);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
