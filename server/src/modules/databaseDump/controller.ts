/**
 * 使用系统 mysqldump 生成真实、可恢复的 MySQL 全库备份（结构+数据+例程+触发器）。
 */
import type { Response } from 'express';
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { config } from '../../config/index.js';
import { execute } from '../../database/index.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';

const lastDumpByUser = new Map<string, number>();
const MIN_INTERVAL_MS = Math.max(
  30_000,
  parseInt(process.env.DUMP_MIN_INTERVAL_MS || '120000', 10) || 120_000,
);

function escapeCnfValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function auditLog(req: AuthenticatedRequest, mode: string, ok: boolean, detail: string): void {
  const u = req.user!;
  const desc = JSON.stringify({ mode, ok, detail: detail.slice(0, 2000), path: '/api/admin/database/mysql-dump' });
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  execute(
    `INSERT INTO operation_logs (operator_id, operator_account, operator_role, module, operation_type, object_description, ip_address)
     VALUES (?, ?, ?, 'system_settings', 'mysql_mysqldump', ?, ?)`,
    [u.id, u.username || null, u.role || null, desc, ip || null],
  ).catch(() => {
    console.warn('[databaseDump] operation_logs insert skipped:', detail.slice(0, 200));
  });
}

export function mysqlDumpController(req: AuthenticatedRequest, res: Response): void {
  const u = req.user!;
  const now = Date.now();
  const prev = lastDumpByUser.get(u.id) || 0;
  if (now - prev < MIN_INTERVAL_MS) {
    const waitSec = Math.ceil((MIN_INTERVAL_MS - (now - prev)) / 1000);
    res.status(429).json({
      success: false,
      error: { code: 'DUMP_COOLDOWN', message: `导出冷却中，请 ${waitSec} 秒后再试` },
    });
    return;
  }

  const mode = String(req.query.mode || 'full').toLowerCase();
  if (!['full', 'schema', 'data'].includes(mode)) {
    res.status(400).json({ success: false, error: { code: 'BAD_MODE', message: 'mode 须为 full | schema | data' } });
    return;
  }

  const mysqldumpPath = (process.env.MYSQLDUMP_PATH || 'mysqldump').trim();
  const { host, port, user, password, database } = config.mysql;

  let cnfPath = '';
  try {
    cnfPath = join(tmpdir(), `mysqldump-${randomBytes(12).toString('hex')}.cnf`);
    const cnf = `[client]\nhost="${escapeCnfValue(host)}"\nport=${port}\nuser="${escapeCnfValue(user)}"\npassword="${escapeCnfValue(password)}"\n`;
    writeFileSync(cnfPath, cnf, { mode: 0o600 });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: { code: 'CNF_WRITE_FAILED', message: (e as Error).message },
    });
    return;
  }

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
  ];

  if (mode === 'schema') {
    args.push('--no-data');
  } else if (mode === 'data') {
    args.push('--no-create-info');
  }

  const safeDb = database.replace(/[^a-zA-Z0-9_-]/g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${safeDb}_${mode}_${stamp}.sql`;

  const child = spawn(mysqldumpPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let spawned = false;
  let stderrBuf = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8');
    if (stderrBuf.length > 16_384) stderrBuf = stderrBuf.slice(-16_384);
  });

  child.on('spawn', () => {
    spawned = true;
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    child.stdout?.pipe(res);
  });

  child.on('error', (err: NodeJS.ErrnoException) => {
    try {
      unlinkSync(cnfPath);
    } catch {
      /* ignore */
    }
    if (res.headersSent) return;
    if (err.code === 'ENOENT') {
      res.status(503).json({
        success: false,
        error: {
          code: 'MYSQLDUMP_NOT_FOUND',
          message: `未找到 mysqldump 可执行文件（PATH: ${mysqldumpPath}）。请在服务器安装 MySQL Client 或设置 MYSQLDUMP_PATH。`,
        },
      });
    } else {
      res.status(500).json({ success: false, error: { code: 'SPAWN_ERROR', message: err.message } });
    }
    auditLog(req, mode, false, err.message);
  });

  child.on('close', (code) => {
    try {
      unlinkSync(cnfPath);
    } catch {
      /* ignore */
    }
    lastDumpByUser.set(u.id, Date.now());
    if (code === 0) {
      auditLog(req, mode, true, 'stream completed');
      return;
    }
    auditLog(req, mode, false, stderrBuf || `exit ${code}`);
    if (!spawned && !res.headersSent) {
      res.status(500).json({
        success: false,
        error: { code: 'MYSQLDUMP_FAILED', message: stderrBuf || `mysqldump 退出码 ${code}` },
      });
      return;
    }
    if (!res.writableEnded) {
      try {
        res.destroy();
      } catch {
        /* ignore */
      }
    }
  });
}
