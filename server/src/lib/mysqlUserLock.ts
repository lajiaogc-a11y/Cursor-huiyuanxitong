/**
 * MySQL GET_LOCK / RELEASE_LOCK：同一连接内串行化会员敏感操作（防并发双抽、双领分享奖等）。
 * 锁名最长 64 字符（MySQL 限制）。
 */
import type { PoolConnection } from 'mysql2/promise';

const MAX_MYSQL_LOCK_NAME_LEN = 64;

export function buildMysqlUserLockName(prefix: string, id: string): string {
  const s = `${prefix}:${id}`;
  return s.length <= MAX_MYSQL_LOCK_NAME_LEN ? s : s.slice(0, MAX_MYSQL_LOCK_NAME_LEN);
}

export async function mysqlGetLock(conn: PoolConnection, name: string, timeoutSec: number): Promise<boolean> {
  const [rows] = await conn.query('SELECT GET_LOCK(?, ?) AS got', [name, timeoutSec]);
  const got = (rows as { got: number | null }[])[0]?.got;
  return Number(got) === 1;
}

export async function mysqlReleaseLock(conn: PoolConnection, name: string): Promise<void> {
  await conn.query('SELECT RELEASE_LOCK(?) AS rel', [name]);
}
