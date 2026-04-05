/**
 * Distributed scheduler lock using MySQL advisory locks (GET_LOCK / RELEASE_LOCK).
 *
 * Each scheduler tick acquires a named lock with timeout=0 (non-blocking).
 * If another instance already holds the lock, the tick is skipped.
 * The lock is held on a dedicated PoolConnection for the duration of the callback,
 * then released and the connection returned to the pool.
 *
 * MySQL advisory locks are re-entrant within the same session but exclusive
 * across sessions, making them ideal for cross-instance mutual exclusion.
 */
import { getConnection } from '../database/index.js';

const LOCK_PREFIX = 'sched:';

/**
 * Try to acquire a MySQL advisory lock and run `fn`.
 * @returns `true` if the lock was acquired and `fn` executed; `false` if skipped.
 */
export async function withSchedulerLock(
  lockName: string,
  fn: () => Promise<void>,
): Promise<boolean> {
  const fullName = `${LOCK_PREFIX}${lockName}`.slice(0, 64);
  let conn;
  try {
    conn = await getConnection();
  } catch (e) {
    console.warn(`[schedulerLock] cannot get DB connection for "${lockName}":`, (e as Error).message);
    return false;
  }
  try {
    const [rows] = await conn.query('SELECT GET_LOCK(?, 0) AS acquired', [fullName]);
    const acquired = (rows as { acquired: number | null }[])[0]?.acquired === 1;
    if (!acquired) return false;
    try {
      await fn();
      return true;
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [fullName]).catch(() => {});
    }
  } finally {
    conn.release();
  }
}
