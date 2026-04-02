/**
 * MySQL 数据库连接 - 唯一可创建连接池的地方
 * Repository 层通过此模块获取连接池
 *
 * query/convertDecimals 使用 any：各行结构随 SQL 变化，由调用方泛型 T 约束。
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- mysql2 动态行与通用 query<T> */
import mysql from 'mysql2/promise';
import type { PoolConnection } from 'mysql2/promise';
import { config } from '../config/index.js';

let pool: mysql.Pool | null = null;

function poolConnectionLimit(): number {
  const raw = process.env.MYSQL_POOL_LIMIT;
  const n = raw != null && raw !== '' ? parseInt(raw, 10) : 10;
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(n, 100);
}

export function getPool(): mysql.Pool {
  if (pool) return pool;
  const connectionLimit = poolConnectionLimit();
  const poolOptions: mysql.PoolOptions = {
    waitForConnections: true,
    connectionLimit,
    charset: 'utf8mb4',
    timezone: config.mysql.timezone,
    decimalNumbers: true,
  };
  if (config.mysqlConnectionUri) {
    poolOptions.uri = config.mysqlConnectionUri;
  } else {
    poolOptions.host = config.mysql.host;
    poolOptions.port = config.mysql.port;
    poolOptions.user = config.mysql.user;
    poolOptions.password = config.mysql.password;
    poolOptions.database = config.mysql.database;
  }
  pool = mysql.createPool(poolOptions);
  const inner = (pool as unknown as { pool?: { on?: (ev: string, fn: (c: any) => void) => void } }).pool;
  inner?.on?.('connection', (conn: { query: (sql: string, cb: (err?: unknown) => void) => void }) => {
    conn.query(`SET time_zone = '${config.mysql.timezone}'`, () => {});
  });
  console.log(
    `[DB] MySQL pool → ${config.mysql.host}:${config.mysql.port}/${config.mysql.database} (session tz ${config.mysql.timezone}, limit ${connectionLimit})`,
  );
  return pool;
}

/**
 * 将 DECIMAL/BIGINT 类型的 string 结果转为 JS number。
 * 跳过已知的字符串标识列（phone_number、member_code 等），避免丢失前导零。
 * 连接池已配置 decimalNumbers:true，此函数仅作额外兜底。
 */
const SKIP_CONVERT_KEYS = new Set([
  'phone_number', 'phone', 'member_code', 'code', 'otp_code',
  'card_number', 'referrer_phone', 'referee_phone', 'referrer_member_code',
  'referee_member_code', 'member_code_snapshot', 'invite_token', 'referral_code', 'api_key',
  'bank_card',
]);
function convertDecimals(rows: any[]): any[] {
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (SKIP_CONVERT_KEYS.has(key)) continue;
      const v = row[key];
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v !== '' && /^-?\d+(\.\d+)?$/.test(v)) {
        row[key] = Number(v);
      }
    }
  }
  return rows;
}

/** 执行查询，返回行数组 */
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const p = getPool();
  const [rows] = await p.query(sql, params ?? []);
  return convertDecimals(rows as any[]) as T[];
}

/** 执行单行查询 */
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** 执行 INSERT/UPDATE/DELETE，返回 affectedRows 等信息 */
export async function execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
  const p = getPool();
  const [result] = await p.query(sql, params ?? []);
  return result as mysql.ResultSetHeader;
}

/**
 * Get a dedicated connection for transaction use.
 * Caller MUST call conn.release() in a finally block.
 */
export async function getConnection(): Promise<mysql.PoolConnection> {
  return getPool().getConnection();
}

/** Run a callback inside a database transaction. */
export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** 优雅关闭连接池 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
