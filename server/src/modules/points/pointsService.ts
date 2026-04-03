/**
 * 统一积分服务 — 所有积分变动必须经由此模块。
 *
 * 数据源层级：
 *   1. points_ledger  — 唯一完整账本（含 balance_after 快照）
 *   2. points_accounts — 可用余额缓存（同事务更新）
 *   3. points_log      — 兼容审计表（同事务写入，与 ledger 保持同步）
 *   4. members.total_points / lifetime_reward_points_earned — 汇总缓存
 *
 * 禁止事项：
 *   - 禁止在本模块之外直接 UPDATE points_accounts.balance
 *   - 禁止在本模块之外直接 INSERT points_ledger（仅 freeze/unfreeze 除外）
 *   - 禁止在本模块之外直接 UPDATE member_activity 与积分相关的列
 */
import type { PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { applyPointsLedgerDeltaOnConn, type PointsLedgerGiftExtras } from './pointsLedgerAccount.js';

async function execConn(conn: PoolConnection, sql: string, params?: unknown[]): Promise<void> {
  await conn.query(sql, params ?? []);
}

async function qOneConn<T>(conn: PoolConnection, sql: string, params?: unknown[]): Promise<T | null> {
  const [rows] = await conn.query(sql, params ?? []);
  return (rows as T[])[0] ?? null;
}

export interface PointsMutationResult {
  ledgerId: string;
  amount: number;
  balanceAfter: number;
  type: string;
  referenceId: string | null;
}

export interface PointsMutationInput {
  memberId: string;
  amount: number;
  type: string;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  createdBy?: string | null;
  extras?: PointsLedgerGiftExtras | null;
  /** clampToZero: if true, insufficient balance won't throw — balance floors at 0 */
  clampToZero?: boolean;
}

/**
 * 增加积分（正向变动）。
 * 在调用方已持有的事务连接上执行，保证原子性。
 */
export async function addPoints(
  conn: PoolConnection,
  input: PointsMutationInput,
): Promise<PointsMutationResult> {
  const { memberId, amount, type, referenceType, referenceId, description, createdBy, extras } = input;
  if (amount <= 0) throw new Error('addPoints: amount must be positive');
  const ledgerId = randomUUID();

  await applyPointsLedgerDeltaOnConn(conn, {
    ledgerId,
    memberId,
    type,
    delta: amount,
    description: description ?? null,
    referenceType: referenceType ?? null,
    referenceId: referenceId ?? null,
    createdBy: createdBy ?? null,
    extras: extras ?? null,
  });

  await syncPointsLog(conn, memberId, amount, type, description ?? null, extras?.tenant_id ?? null);

  const after = await getBalanceOnConn(conn, memberId);
  return { ledgerId, amount, balanceAfter: after, type, referenceId: referenceId ?? null };
}

/**
 * 扣减积分（负向变动）。
 * 在调用方已持有的事务连接上执行，保证原子性。
 */
export async function deductPoints(
  conn: PoolConnection,
  input: PointsMutationInput,
): Promise<PointsMutationResult> {
  const { memberId, amount, type, referenceType, referenceId, description, createdBy, extras, clampToZero } = input;
  if (amount <= 0) throw new Error('deductPoints: amount must be positive');
  const ledgerId = randomUUID();

  await applyPointsLedgerDeltaOnConn(conn, {
    ledgerId,
    memberId,
    type,
    delta: -amount,
    description: description ?? null,
    referenceType: referenceType ?? null,
    referenceId: referenceId ?? null,
    createdBy: createdBy ?? null,
    extras: extras ?? null,
    clampToZero,
  });

  await syncPointsLog(conn, memberId, -amount, type, description ?? null, extras?.tenant_id ?? null);

  const after = await getBalanceOnConn(conn, memberId);
  return { ledgerId, amount, balanceAfter: after, type, referenceId: referenceId ?? null };
}

/** 查询当前可用余额（事务内） */
async function getBalanceOnConn(conn: PoolConnection, memberId: string): Promise<number> {
  const row = await qOneConn<{ balance: number }>(
    conn,
    'SELECT COALESCE(balance, 0) AS balance FROM points_accounts WHERE member_id = ? LIMIT 1',
    [memberId],
  );
  return Number(row?.balance ?? 0);
}

/** 同步写入 points_log（兼容审计表）— 可被外部 freeze/unfreeze 调用 */
export async function syncPointsLog(
  conn: PoolConnection,
  memberId: string,
  change: number,
  type: string,
  remark: string | null,
  tenantId?: string | null,
): Promise<void> {
  const tid = tenantId ?? (
    await qOneConn<{ tenant_id: string | null }>(
      conn, 'SELECT tenant_id FROM members WHERE id = ? LIMIT 1', [memberId],
    )
  )?.tenant_id ?? null;

  await execConn(conn,
    `INSERT INTO points_log (id, member_id, tenant_id, \`change\`, type, category, remark)
     VALUES (?, ?, ?, ?, ?, 'online_points', ?)`,
    [randomUUID(), memberId, tid, change, type, remark],
  );
}

/**
 * 数据校正：用 points_ledger 的 SUM 重算 points_accounts.balance。
 * 仅供管理员/迁移脚本调用，不属于常规业务流程。
 */
export async function reconcileBalance(
  conn: PoolConnection,
  memberId: string,
): Promise<{ ledgerSum: number; accountBalance: number; fixed: boolean }> {
  const sumRow = await qOneConn<{ s: number }>(
    conn,
    `SELECT COALESCE(SUM(amount), 0) AS s FROM points_ledger WHERE member_id = ?`,
    [memberId],
  );
  const ledgerSum = Number(sumRow?.s ?? 0);

  const acctRow = await qOneConn<{ balance: number }>(
    conn,
    'SELECT COALESCE(balance, 0) AS balance FROM points_accounts WHERE member_id = ? FOR UPDATE',
    [memberId],
  );
  const accountBalance = Number(acctRow?.balance ?? 0);

  const drift = Math.abs(ledgerSum - accountBalance);
  if (drift > 0.005) {
    await execConn(conn,
      'UPDATE points_accounts SET balance = ?, updated_at = NOW(3) WHERE member_id = ?',
      [Math.max(0, ledgerSum), memberId],
    );
    return { ledgerSum, accountBalance, fixed: true };
  }
  return { ledgerSum, accountBalance, fixed: false };
}
