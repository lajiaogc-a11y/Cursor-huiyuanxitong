#!/usr/bin/env node
/**
 * 公司文档（知识库）定向恢复脚本
 *
 * 仅恢复以下三张表：
 * - knowledge_categories
 * - knowledge_articles
 * - knowledge_read_status
 *
 * 用法：
 *   node scripts/restore-knowledge.mjs [备份ID]
 *   不传备份ID时，自动使用最新 success 备份
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'dhlwefrcowefvbxutsmc';
const TABLES = ['knowledge_categories', 'knowledge_articles', 'knowledge_read_status'];

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

function getPublicBackupUrl(supabaseUrl, backupId, table) {
  const base = (supabaseUrl || '').replace(/\/$/, '');
  return `${base}/storage/v1/object/public/data-backups/${backupId}/${table}.json`;
}

async function fetchBackupRows(supabaseUrl, backupId, table) {
  const url = getPublicBackupUrl(supabaseUrl, backupId, table);
  const res = await fetch(url);
  if (!res.ok) return [];
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getTableColumns(client, table) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    [table]
  );
  return new Set(rows.map((r) => r.column_name));
}

async function getFallbackTenantId(client) {
  const { rows } = await client.query(
    `
      SELECT id
      FROM tenants
      WHERE tenant_code <> 'platform'
      ORDER BY created_at DESC
      LIMIT 1
    `
  );
  return rows[0]?.id || null;
}

async function upsertRows(client, table, rows, tableColumns, fallbackTenantId) {
  if (!rows.length) return 0;
  if (tableColumns.has('tenant_id') && fallbackTenantId) {
    rows = rows.map((row) => ({
      ...row,
      tenant_id: row.tenant_id ?? fallbackTenantId,
    }));
  }

  const cols = Object.keys(rows[0]).filter((c) => tableColumns.has(c) && rows[0][c] !== undefined);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const setClause = cols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');

  let done = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    for (const row of batch) {
      const vals = cols.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
        return v;
      });
      const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${setClause}`;
      await client.query(sql, vals);
      done++;
    }
  }
  return done;
}

async function restoreSingleTable(client, supabaseUrl, backupId, table, fallbackTenantId) {
  const rows = await fetchBackupRows(supabaseUrl, backupId, table);
  if (!rows.length) return 0;
  const tableColumns = await getTableColumns(client, table);
  await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
  try {
    return await upsertRows(client, table, rows, tableColumns, fallbackTenantId);
  } finally {
    await client.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
  }
}

async function pickLatestBackupId(client) {
  const { rows } = await client.query(`
    SELECT id
    FROM data_backups
    WHERE status = 'success'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return rows[0]?.id || null;
}

async function main() {
  loadEnv();
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const dbPassword = process.env.DATABASE_PASSWORD?.trim();
  if (!supabaseUrl || !dbPassword) {
    console.error('❌ 缺少 VITE_SUPABASE_URL 或 DATABASE_PASSWORD');
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
  });

  await client.connect();
  try {
    let backupId = process.argv[2];
    if (!backupId) {
      backupId = await pickLatestBackupId(client);
    }
    if (!backupId) {
      console.error('❌ 未找到可用的 success 备份');
      process.exit(1);
    }

    console.log(`使用备份: ${backupId}`);
    const fallbackTenantId = await getFallbackTenantId(client);
    if (fallbackTenantId) {
      console.log(`恢复租户: ${fallbackTenantId}`);
    }
    const summary = {};

    // 先分类，再文章，再已读状态，避免外键依赖问题
    for (const table of TABLES) {
      const restored = await restoreSingleTable(client, supabaseUrl, backupId, table, fallbackTenantId);
      summary[table] = restored;
      console.log(`  ${table}: ${restored}`);
    }

    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    console.log(`\n✓ 公司文档恢复完成，共 ${total} 条记录`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('❌ 恢复失败:', e?.message || e);
  process.exit(1);
});
