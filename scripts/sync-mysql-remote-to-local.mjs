#!/usr/bin/env node
/**
 * 将「线上」MySQL（如 AWS RDS）整库同步到「本地」server/.env 指向的 MySQL。
 *
 * 前置：
 * - 本机已安装 MySQL Client（mysqldump + mysql 在 PATH），或设置 MYSQLDUMP_PATH / MYSQL_CLIENT_PATH
 * - 配置 server/.env.sync（从 server/.env.sync.example 复制），填写 SOURCE_* 或 SOURCE_DATABASE_URL
 * - server/.env 中为本地目标库（DATABASE_URL 或 MYSQL_*）
 *
 * 用法：
 *   node scripts/sync-mysql-remote-to-local.mjs --dry-run   # 只打印将执行的连接信息（脱敏）
 *   node scripts/sync-mysql-remote-to-local.mjs --yes       # 执行：先停本地 API 再跑更安全
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function loadDotEnv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    /* missing */
  }
}

function escapeCnfValue(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function tryParseMysqlDatabaseUrl(raw) {
  const t = String(raw || '').trim();
  if (!t.startsWith('mysql://') && !t.startsWith('mysql2://')) return null;
  try {
    const normalized = t.replace(/^mysql2:/, 'mysql:');
    const u = new URL(normalized);
    if (u.protocol !== 'mysql:') return null;
    const host = u.hostname;
    if (!host) return null;
    const port = u.port ? parseInt(u.port, 10) : 3306;
    const pathDb = (u.pathname || '/').replace(/^\//, '').split('/')[0] || '';
    const database = pathDb ? decodeURIComponent(pathDb) : '';
    const user = decodeURIComponent(u.username || '');
    const password = decodeURIComponent(u.password || '');
    return { host, port, user, password, database };
  } catch {
    return null;
  }
}

function resolveSourceConn() {
  const url = process.env.SOURCE_DATABASE_URL?.trim();
  const parsed = url ? tryParseMysqlDatabaseUrl(url) : null;
  if (parsed && parsed.database) {
    return {
      host: parsed.host,
      port: parsed.port,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      sslMode: (process.env.SOURCE_MYSQL_SSL_MODE || '').trim(),
    };
  }
  return {
    host: process.env.SOURCE_MYSQL_HOST?.trim() || '',
    port: parseInt(process.env.SOURCE_MYSQL_PORT || '3306', 10),
    user: process.env.SOURCE_MYSQL_USER?.trim() || '',
    password: process.env.SOURCE_MYSQL_PASSWORD ?? '',
    database: process.env.SOURCE_MYSQL_DATABASE?.trim() || 'gc_member_system',
    sslMode: (process.env.SOURCE_MYSQL_SSL_MODE || '').trim(),
  };
}

function resolveLocalConn() {
  const url = process.env.DATABASE_URL?.trim();
  const parsed = url ? tryParseMysqlDatabaseUrl(url) : null;
  if (parsed && parsed.database) {
    return {
      host: parsed.host,
      port: parsed.port,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      sslMode: '',
    };
  }
  return {
    host: process.env.MYSQL_HOST?.trim() || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER?.trim() || 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE?.trim() || 'gc_member_system',
    sslMode: '',
  };
}

function writeCnf(path, { host, port, user, password, sslMode }) {
  let body = `[client]\nhost="${escapeCnfValue(host)}"\nport=${port}\nuser="${escapeCnfValue(user)}"\npassword="${escapeCnfValue(password)}"\ndefault-character-set=utf8mb4\n`;
  if (sslMode) {
    body += `ssl-mode=${escapeCnfValue(sslMode)}\n`;
  }
  writeFileSync(path, body, { mode: 0o600 });
}

function sameTarget(a, b) {
  return (
    a.host === b.host &&
    a.port === b.port &&
    a.database === b.database &&
    a.user === b.user
  );
}

function runDump(mysqldumpPath, cnfPath, database, outFile) {
  const args = [
    `--defaults-file=${cnfPath}`,
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--set-gtid-purged=OFF',
    '--column-statistics=0',
    '--default-character-set=utf8mb4',
    '--databases',
    database,
    '--result-file',
    outFile,
  ];
  return new Promise((resolve, reject) => {
    const p = spawn(mysqldumpPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`mysqldump 退出码 ${code}`))));
  });
}

function runMysqlImport(mysqlPath, cnfPath, sqlFile) {
  return new Promise((resolve, reject) => {
    const p = spawn(mysqlPath, [`--defaults-file=${cnfPath}`], { stdio: ['pipe', 'inherit', 'inherit'] });
    const rd = createReadStream(sqlFile);
    rd.on('error', reject);
    p.on('error', reject);
    rd.pipe(p.stdin);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`mysql 导入退出码 ${code}`))));
  });
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const yes = process.argv.includes('--yes');
  if (!dry && !yes) {
    console.log(`
用法:
  node scripts/sync-mysql-remote-to-local.mjs --dry-run   查看源/目标（密码脱敏）
  node scripts/sync-mysql-remote-to-local.mjs --yes       执行同步（会覆盖本地目标库中的数据）

步骤:
  1. 复制 server/.env.sync.example → server/.env.sync，填写线上 RDS 的 SOURCE_DATABASE_URL 或 SOURCE_MYSQL_*
  2. server/.env 中保持本地 MySQL 的 DATABASE_URL 或 MYSQL_*
  3. 建议先停止本地 Node API，再执行 --yes
`);
    process.exit(1);
  }

  loadDotEnv(join(__dirname, '..', 'server', '.env.sync'));
  loadDotEnv(join(__dirname, '..', 'server', '.env'));

  const source = resolveSourceConn();
  const dest = resolveLocalConn();

  if (!source.host || !source.user || !source.database) {
    console.error('❌ 未配置线上数据源。请创建 server/.env.sync，设置 SOURCE_DATABASE_URL 或 SOURCE_MYSQL_HOST / USER / PASSWORD / DATABASE。');
    console.error('   参考: server/.env.sync.example');
    process.exit(1);
  }

  if (!dest.host || !dest.user || !dest.database) {
    console.error('❌ 未配置本地目标。请检查 server/.env 中的 DATABASE_URL 或 MYSQL_*。');
    process.exit(1);
  }

  if (sameTarget(source, dest)) {
    console.error('❌ 源与目标主机/库/用户相同，拒绝执行以免误伤线上。请确认本地使用不同的 MYSQL_HOST。');
    process.exit(1);
  }

  const mask = (s) => (s ? `${String(s).slice(0, 2)}***` : '(空)');

  console.log('[sync] 源（线上）:', {
    host: source.host,
    port: source.port,
    user: source.user,
    password: mask(source.password),
    database: source.database,
    sslMode: source.sslMode || '(默认)',
  });
  console.log('[sync] 目标（本地）:', {
    host: dest.host,
    port: dest.port,
    user: dest.user,
    password: mask(dest.password),
    database: dest.database,
  });

  if (dry) {
    console.log('\n✓ dry-run 结束。确认无误后使用 --yes 执行。');
    process.exit(0);
  }

  const mysqldumpPath = (process.env.MYSQLDUMP_PATH || 'mysqldump').trim();
  const mysqlPath = (process.env.MYSQL_CLIENT_PATH || 'mysql').trim();

  const tmp = mkdtempSync(join(tmpdir(), 'mysql-sync-'));
  const srcCnf = join(tmp, `src-${randomBytes(8).toString('hex')}.cnf`);
  const dstCnf = join(tmp, `dst-${randomBytes(8).toString('hex')}.cnf`);
  const sqlFile = join(tmp, 'dump.sql');

  try {
    writeCnf(srcCnf, source);
    writeCnf(dstCnf, dest);
    console.log('\n[1/2] mysqldump 导出到临时文件...');
    await runDump(mysqldumpPath, srcCnf, source.database, sqlFile);
    console.log('[2/2] mysql 导入到本地库（将覆盖本地同名库数据）...');
    await runMysqlImport(mysqlPath, dstCnf, sqlFile);
    console.log('\n✓ 同步完成。可启动本地 API 验证登录与数据。');
  } finally {
    for (const f of [srcCnf, dstCnf, sqlFile]) {
      try {
        unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
