import pg from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');

const c = new pg.Client({
  host: 'db.dhlwefrcowefvbxutsmc.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'AE2n91Qs6MBxCEAZ',
  ssl: { rejectUnauthorized: false }
});

await c.connect();

// 获取已执行的 migration
const { rows } = await c.query(`SELECT name FROM supabase_migrations.schema_migrations`);
const applied = new Set(rows.map(r => r.name));

// 获取本地 migration 文件
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

// 找出未执行的
const pending = files.filter(f => {
  const name = f.replace('.sql', '');
  // 检查完整名称或时间戳部分
  if (applied.has(name)) return false;
  // 有些 migration 名称可能只记录了 UUID 部分
  const parts = name.split('_');
  const uuid = parts.slice(1).join('_');
  if (applied.has(uuid)) return false;
  return true;
});

console.log(`已执行: ${applied.size}, 本地文件: ${files.length}, 待执行: ${pending.length}`);
if (pending.length > 0) {
  console.log('\n待执行的 migration:');
  pending.forEach(f => console.log(`  ${f}`));
}

// 执行未应用的 migration
if (pending.length > 0 && process.argv.includes('--apply')) {
  console.log('\n开始执行迁移...');
  let success = 0, failed = 0;
  for (const f of pending) {
    const sql = readFileSync(join(migrationsDir, f), 'utf-8');
    const name = f.replace('.sql', '');
    try {
      await c.query('BEGIN');
      await c.query(sql);
      // 记录到 migration 表
      await c.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [name, name, [sql]]
      );
      await c.query('COMMIT');
      console.log(`  ✅ ${f}`);
      success++;
    } catch (e) {
      await c.query('ROLLBACK');
      console.error(`  ❌ ${f}: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n完成: ${success} 成功, ${failed} 失败`);
}

await c.end();
