#!/usr/bin/env node
/**
 * 数据库无用数据清理脚本
 * 安全删除可清理的日志/临时数据，减轻 Disk I/O 压力
 *
 * 用法：node scripts/cleanup-unused-data.mjs
 * 需要 .env 中配置 DATABASE_PASSWORD 和 VITE_SUPABASE_PROJECT_ID（或使用默认 aoyvgvecvxfwgrmngnrc）
 */

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// 加载 .env
function loadEnv() {
  const envPath = resolve(root, '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        const val = m[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}
loadEnv();

const PROJECT_REF = process.env.VITE_SUPABASE_PROJECT_ID || 'aoyvgvecvxfwgrmngnrc';
const PASSWORD = (process.env.DATABASE_PASSWORD || '').trim();

if (!PASSWORD) {
  console.error('❌ 请在 .env 中设置 DATABASE_PASSWORD');
  process.exit(1);
}

const connectionString = `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectTimeout: 30000,
});

async function runSql(sql, params = [], label) {
  try {
    const r = await pool.query(sql, params);
    return { ok: true, rowCount: r.rowCount ?? 0 };
  } catch (e) {
    if (e.code === '42P01') return { ok: false, skip: true }; // 表不存在
    console.error(`  ❌ ${label || 'query'}:`, e.message);
    return { ok: false };
  }
}

async function cleanup() {
  console.log('\n=== 数据库无用数据清理 ===');
  console.log(`项目: ${PROJECT_REF}\n`);

  let totalDeleted = 0;

  // 1. OTP 验证码 - 删除 7 天前过期的
  const otp = await runSql(
    `DELETE FROM otp_verifications WHERE expires_at < NOW() - INTERVAL '7 days'`,
    [],
    'otp_verifications'
  );
  if (otp.ok) {
    console.log(`✓ otp_verifications: 删除 ${otp.rowCount} 条过期记录`);
    totalDeleted += otp.rowCount;
  } else if (!otp.skip) process.exit(1);

  // 2. API 限流 - 删除 7 天前的
  const rate = await runSql(
    `DELETE FROM api_rate_limits WHERE updated_at < NOW() - INTERVAL '7 days'`,
    [],
    'api_rate_limits'
  );
  if (rate.ok) {
    console.log(`✓ api_rate_limits: 删除 ${rate.rowCount} 条旧记录`);
    totalDeleted += rate.rowCount;
  } else if (!rate.skip) process.exit(1);

  // 3. 错误上报 - 保留 30 天
  const err = await runSql(
    `DELETE FROM error_reports WHERE created_at < NOW() - INTERVAL '30 days'`,
    [],
    'error_reports'
  );
  if (err.ok) {
    console.log(`✓ error_reports: 删除 ${err.rowCount} 条旧记录`);
    totalDeleted += err.rowCount;
  } else if (!err.skip) process.exit(1);

  // 4. 登录日志 - 保留 90 天
  const login = await runSql(
    `DELETE FROM employee_login_logs WHERE login_time < NOW() - INTERVAL '90 days'`,
    [],
    'employee_login_logs'
  );
  if (login.ok) {
    console.log(`✓ employee_login_logs: 删除 ${login.rowCount} 条旧记录`);
    totalDeleted += login.rowCount;
  } else if (!login.skip) process.exit(1);

  // 5. 迁移任务 - 已完成且 30 天前的
  const migJob = await runSql(
    `DELETE FROM tenant_migration_jobs WHERE status = 'completed' AND created_at < NOW() - INTERVAL '30 days'`,
    [],
    'tenant_migration_jobs'
  );
  if (migJob.ok) {
    console.log(`✓ tenant_migration_jobs: 删除 ${migJob.rowCount} 条`);
    totalDeleted += migJob.rowCount;
  } else if (!migJob.skip) process.exit(1);

  // 6. 迁移回滚记录 - 30 天前
  const migRoll = await runSql(
    `DELETE FROM tenant_migration_rollbacks WHERE created_at < NOW() - INTERVAL '30 days'`,
    [],
    'tenant_migration_rollbacks'
  );
  if (migRoll.ok) {
    console.log(`✓ tenant_migration_rollbacks: 删除 ${migRoll.rowCount} 条`);
    totalDeleted += migRoll.rowCount;
  } else if (!migRoll.skip) process.exit(1);

  // 7. 数据备份元数据 - 保留 60 天（不删 Storage 文件，只删元数据需谨慎，这里只删非常旧的）
  const backup = await runSql(
    `DELETE FROM data_backups WHERE status IN ('completed','failed') AND created_at < NOW() - INTERVAL '60 days'`,
    [],
    'data_backups'
  );
  if (backup.ok) {
    console.log(`✓ data_backups: 删除 ${backup.rowCount} 条旧元数据`);
    totalDeleted += backup.rowCount;
  } else if (!backup.skip) process.exit(1);

  // 8. api_request_logs（如有）
  const apiLog = await runSql(
    `DELETE FROM api_request_logs WHERE created_at < NOW() - INTERVAL '30 days'`,
    [],
    'api_request_logs'
  );
  if (apiLog.ok) {
    console.log(`✓ api_request_logs: 删除 ${apiLog.rowCount} 条`);
    totalDeleted += apiLog.rowCount;
  } else if (!apiLog.skip) process.exit(1);

  console.log(`\n--- 共删除 ${totalDeleted} 条记录 ---`);

  // 9. VACUUM ANALYZE 回收空间（对受影响的大表）
  console.log('\n执行 VACUUM ANALYZE 回收空间...');
  const tables = ['otp_verifications', 'api_rate_limits', 'error_reports', 'employee_login_logs', 'tenant_migration_jobs', 'tenant_migration_rollbacks'];
  for (const t of tables) {
    try {
      await pool.query(`VACUUM ANALYZE ${t}`);
      console.log(`  ✓ VACUUM ${t}`);
    } catch (e) {
      if (e.code !== '42P01') console.warn(`  ⚠ VACUUM ${t}:`, e.message);
    }
  }

  console.log('\n✓ 清理完成\n');
}

cleanup()
  .then(() => pool.end())
  .catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
  });
