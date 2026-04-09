#!/usr/bin/env node
/**
 * 清理所有历史备份数据
 * - 删除 data_backups 表所有记录
 * - 清空 data-backups 存储桶
 *
 * 用法：node scripts/cleanup-all-backups.mjs
 * 需要 .env：VITE_SUPABASE_URL, DATABASE_PASSWORD, SUPABASE_SERVICE_ROLE_KEY（清理 Storage 需 service_role）
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  for (const p of [resolve(root, '.env'), resolve(root, 'server', '.env')]) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
const projectRef = m ? m[1] : process.env.VITE_SUPABASE_PROJECT_ID || 'aoyvgvecvxfwgrmngnrc';
const password = (process.env.DATABASE_PASSWORD || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!password) {
  console.error('❌ 需要 DATABASE_PASSWORD');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 清理所有历史备份数据 ===\n');

  // 1. 获取备份记录（用于清理 Storage）
  const { rows } = await pool.query(
    `SELECT id, storage_path FROM data_backups WHERE storage_path IS NOT NULL`
  );
  console.log(`找到 ${rows.length} 条备份记录（含 Storage 路径）`);

  // 2. 用 Supabase 客户端清理 Storage
  if (serviceKey) {
    const supabase = createClient(url, serviceKey);
    let removed = 0;
    for (const row of rows) {
      try {
        const { data: files } = await supabase.storage
          .from('data-backups')
          .list(row.storage_path);
        if (files && files.length > 0) {
          const paths = files.map((f) => `${row.storage_path}/${f.name}`);
          await supabase.storage.from('data-backups').remove(paths);
          removed += paths.length;
        }
      } catch (e) {
        console.warn(`  清理 ${row.storage_path} 失败:`, e.message);
      }
    }
    console.log(`✓ Storage 已删除 ${removed} 个文件`);
  } else {
    console.warn('⚠ 未配置 SUPABASE_SERVICE_ROLE_KEY，无法清理 Storage 文件。');
    console.warn('  可在 Supabase 控制台 → Storage → data-backups 手动清空。');
  }

  // 3. 删除 data_backups 表所有记录
  const del = await pool.query(`DELETE FROM data_backups`);
  console.log(`✓ data_backups 表已删除 ${del.rowCount} 条记录`);

  console.log('\n✓ 清理完成\n');
}

main()
  .finally(() => pool.end())
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
