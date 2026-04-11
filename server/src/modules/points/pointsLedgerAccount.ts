/**
 * MySQL points_ledger 与 schema 对齐：account_id / member_id / type / amount / balance_after 为硬约束。
 * 所有写入流水必须先锁定并更新 points_accounts，避免「无默认值的 account_id」与账务不一致。
 */
import type { PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { syncMemberLevelFromTotalOnConn } from '../memberLevels/repository.js';

async function qOne<T>(conn: PoolConnection, sql: string, params?: unknown[]): Promise<T | null> {
  const [rows] = await conn.query(sql, params ?? []);
  const arr = rows as T[];
  return arr[0] ?? null;
}

async function exec(conn: PoolConnection, sql: string, params?: unknown[]): Promise<void> {
  await conn.query(sql, params ?? []);
}

export type PointsLedgerGiftExtras = {
  member_code?: string | null;
  phone_number?: string | null;
  order_id?: string | null;
  transaction_type?: string | null;
  actual_payment?: number | null;
  currency?: string | null;
  exchange_rate?: number | null;
  usd_amount?: number | null;
  points_multiplier?: number | null;
  points_earned?: number | null;
  status?: string | null;
  creator_id?: string | null;
  tenant_id?: string | null;
};

export async function applyPointsLedgerDeltaOnConn(
  conn: PoolConnection,
  input: {
    ledgerId: string;
    memberId: string;
    type: string;
    /** 账户 balance 的变化量，与 points_ledger.amount 一致（可负，如兑换扣减） */
    delta: number;
    description: string | null;
    referenceType: string | null;
    referenceId: string | null;
    createdBy: string | null;
    extras?: PointsLedgerGiftExtras | null;
    /** 当 true 时，余额不足不抛错，而是将 balance 截止到 0（用于订单删除回滚等非消费场景） */
    clampToZero?: boolean;
  }
): Promise<{ actualDelta: number; balanceAfter: number }> {
  const { ledgerId, memberId, type, delta, description, referenceType, referenceId, createdBy, extras, clampToZero } = input;
  const x = extras ?? {};

  const memberRow = await qOne<{ tenant_id: string | null; member_code: string | null; phone_number: string | null }>(
    conn,
    'SELECT tenant_id, member_code, phone_number FROM members WHERE id = ? LIMIT 1',
    [memberId],
  );
  const memberTenantId = memberRow?.tenant_id ?? null;
  const memberCodeFromDb = memberRow?.member_code ?? null;
  const phoneFromDb = memberRow?.phone_number ?? null;

  let acct = await qOne<{ id: string; balance: number; tenant_id: string | null; member_code: string | null; phone: string | null }>(
    conn,
    'SELECT id, balance, tenant_id, member_code, phone FROM points_accounts WHERE member_id = ? FOR UPDATE',
    [memberId]
  );
  if (!acct) {
    if (delta < 0 && !clampToZero) {
      throw new Error('INSUFFICIENT_POINTS_NO_ACCOUNT');
    }
    const newId = randomUUID();
    await exec(
      conn,
      'INSERT INTO points_accounts (id, member_id, tenant_id, balance, total_earned, total_spent, member_code, phone) VALUES (?, ?, ?, 0, 0, 0, ?, ?)',
      [newId, memberId, memberTenantId, memberCodeFromDb, phoneFromDb]
    );
    acct = { id: newId, balance: 0, tenant_id: memberTenantId, member_code: memberCodeFromDb, phone: phoneFromDb };
  } else {
    const needsTenant = !acct.tenant_id && memberTenantId;
    const needsCode = !acct.member_code && memberCodeFromDb;
    const needsPhone = !acct.phone && phoneFromDb;
    if (needsTenant || needsCode || needsPhone) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (needsTenant) { sets.push('tenant_id = ?'); vals.push(memberTenantId); }
      if (needsCode) { sets.push('member_code = ?'); vals.push(memberCodeFromDb); }
      if (needsPhone) { sets.push('phone = ?'); vals.push(phoneFromDb); }
      vals.push(acct.id);
      await exec(conn, `UPDATE points_accounts SET ${sets.join(', ')} WHERE id = ?`, vals);
      acct = { ...acct, tenant_id: acct.tenant_id || memberTenantId, member_code: acct.member_code || memberCodeFromDb, phone: acct.phone || phoneFromDb };
    }
  }

  const before = Number(acct.balance);
  let after = before + delta;
  if (after < 0) {
    if (!clampToZero) {
      throw new Error('INSUFFICIENT_POINTS');
    }
    after = 0;
  }
  const actualDelta = after - before;

  await exec(
    conn,
    `UPDATE points_accounts SET
       balance = ?,
       total_earned = total_earned + ?,
       total_spent = total_spent + ?,
       updated_at = NOW(3)
     WHERE id = ?`,
    [after, Math.max(0, actualDelta), Math.max(0, -actualDelta), acct.id]
  );

  const cr = createdBy;
  await exec(
    conn,
    `INSERT INTO points_ledger (
       id, account_id, member_id, type, amount, balance_after,
       reference_type, reference_id, description, created_by,
       member_code, phone_number, order_id, transaction_type,
       actual_payment, currency, exchange_rate, usd_amount, points_multiplier,
       points_earned, status, creator_id, tenant_id
     ) VALUES (
       ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?
     )`,
    [
      ledgerId,
      acct.id,
      memberId,
      type,
      actualDelta,
      after,
      referenceType,
      referenceId,
      description,
      cr,
      x.member_code ?? null,
      x.phone_number ?? null,
      x.order_id ?? null,
      x.transaction_type ?? null,
      x.actual_payment ?? null,
      x.currency ?? null,
      x.exchange_rate ?? null,
      x.usd_amount ?? null,
      x.points_multiplier ?? null,
      x.points_earned ?? null,
      x.status ?? null,
      x.creator_id ?? cr,
      x.tenant_id ?? memberTenantId,
    ]
  );

  if (actualDelta > 0) {
    await exec(
      conn,
      `UPDATE members SET
         lifetime_reward_points_earned = lifetime_reward_points_earned + ?,
         total_points = total_points + ?
       WHERE id = ?`,
      [actualDelta, actualDelta, memberId],
    );
    const ptsRow = await qOne<{ total_points: number | string; tenant_id: string | null }>(
      conn,
      'SELECT total_points, tenant_id FROM members WHERE id = ? LIMIT 1',
      [memberId],
    );
    const tp = Number(ptsRow?.total_points) || 0;
    await syncMemberLevelFromTotalOnConn(conn, memberId, ptsRow?.tenant_id ?? null, tp);
  }

  // C3: keep member_activity.remaining_points in sync with points_accounts.balance
  await exec(
    conn,
    `UPDATE member_activity SET remaining_points = ?, updated_at = NOW(3) WHERE member_id = ?`,
    [Math.max(0, after), memberId],
  );

  return { actualDelta, balanceAfter: after };
}

// ─── H2: Unified freeze / unfreeze / confirm-frozen helpers ───

/**
 * Freeze points: atomically move `amount` from balance → frozen_points.
 * Rejects if balance < amount or if there are already frozen points.
 */
export async function freezePointsOnConn(
  conn: PoolConnection,
  memberId: string,
  amount: number,
  ledgerDescription: string,
  referenceId?: string | null,
): Promise<{ balanceAfter: number; frozenAfter: number; ledgerId: string }> {
  const cost = Math.max(0, Math.floor(amount));
  if (cost <= 0) throw new Error('INVALID_FREEZE_AMOUNT');

  const acct = await qOne<{ id: string; balance: number; frozen_points: number; tenant_id: string | null }>(
    conn,
    'SELECT id, COALESCE(balance, 0) AS balance, COALESCE(frozen_points, 0) AS frozen_points, tenant_id FROM points_accounts WHERE member_id = ? FOR UPDATE',
    [memberId],
  );
  if (!acct) throw new Error('POINTS_ACCOUNT_NOT_FOUND');
  if (acct.frozen_points > 0) throw new Error('HAS_FROZEN_POINTS');
  if (acct.balance < cost) throw new Error('INSUFFICIENT_POINTS');

  const balanceAfter = acct.balance - cost;
  const frozenAfter = acct.frozen_points + cost;

  await exec(
    conn,
    `UPDATE points_accounts SET balance = ?, frozen_points = ?, updated_at = NOW(3) WHERE id = ?`,
    [balanceAfter, frozenAfter, acct.id],
  );

  const ledgerId = randomUUID();
  await exec(
    conn,
    `INSERT INTO points_ledger (id, account_id, member_id, type, amount, balance_after, reference_type, reference_id, description, tenant_id)
     VALUES (?, ?, ?, 'freeze', ?, ?, 'redemption', ?, ?, ?)`,
    [ledgerId, acct.id, memberId, -cost, balanceAfter, referenceId ?? null, ledgerDescription, acct.tenant_id],
  );

  return { balanceAfter, frozenAfter, ledgerId };
}

/**
 * Confirm frozen: finalize a redemption by consuming frozen_points.
 * frozen_points -= amount, total_spent += amount.
 */
export async function confirmFrozenOnConn(
  conn: PoolConnection,
  memberId: string,
  amount: number,
  ledgerDescription: string,
  referenceId?: string | null,
): Promise<{ frozenAfter: number; ledgerId: string }> {
  const cost = Math.max(0, Math.floor(amount));
  if (cost <= 0) throw new Error('INVALID_CONFIRM_AMOUNT');

  const acct = await qOne<{ id: string; frozen_points: number; balance: number; tenant_id: string | null }>(
    conn,
    'SELECT id, COALESCE(frozen_points, 0) AS frozen_points, COALESCE(balance, 0) AS balance, tenant_id FROM points_accounts WHERE member_id = ? FOR UPDATE',
    [memberId],
  );
  if (!acct) throw new Error('POINTS_ACCOUNT_NOT_FOUND');
  if (acct.frozen_points < cost) throw new Error('FROZEN_POINTS_INCONSISTENT');

  const frozenAfter = acct.frozen_points - cost;
  await exec(
    conn,
    `UPDATE points_accounts SET frozen_points = ?, total_spent = total_spent + ?, updated_at = NOW(3) WHERE id = ?`,
    [frozenAfter, cost, acct.id],
  );

  const ledgerId = randomUUID();
  await exec(
    conn,
    `INSERT INTO points_ledger (id, account_id, member_id, type, amount, balance_after, reference_type, reference_id, description, tenant_id)
     VALUES (?, ?, ?, 'redeem_confirm', ?, ?, 'redemption', ?, ?, ?)`,
    [ledgerId, acct.id, memberId, -cost, acct.balance, referenceId ?? null, ledgerDescription, acct.tenant_id],
  );

  return { frozenAfter, ledgerId };
}

/**
 * Unfreeze points: return frozen_points back to balance (rejection/cancellation).
 */
export async function unfreezePointsOnConn(
  conn: PoolConnection,
  memberId: string,
  amount: number,
  ledgerDescription: string,
  referenceId?: string | null,
): Promise<{ balanceAfter: number; frozenAfter: number; ledgerId: string }> {
  const cost = Math.max(0, Math.floor(amount));
  if (cost <= 0) throw new Error('INVALID_UNFREEZE_AMOUNT');

  const acct = await qOne<{ id: string; balance: number; frozen_points: number; tenant_id: string | null }>(
    conn,
    'SELECT id, COALESCE(balance, 0) AS balance, COALESCE(frozen_points, 0) AS frozen_points, tenant_id FROM points_accounts WHERE member_id = ? FOR UPDATE',
    [memberId],
  );
  if (!acct) throw new Error('POINTS_ACCOUNT_NOT_FOUND');

  const frozenAfter = Math.max(0, acct.frozen_points - cost);
  const refundAmount = Math.min(cost, acct.frozen_points);
  const balanceAfter = acct.balance + refundAmount;

  await exec(
    conn,
    `UPDATE points_accounts SET balance = ?, frozen_points = ?, updated_at = NOW(3) WHERE id = ?`,
    [balanceAfter, frozenAfter, acct.id],
  );

  const ledgerId = randomUUID();
  await exec(
    conn,
    `INSERT INTO points_ledger (id, account_id, member_id, type, amount, balance_after, reference_type, reference_id, description, tenant_id)
     VALUES (?, ?, ?, 'unfreeze', ?, ?, 'redemption', ?, ?, ?)`,
    [ledgerId, acct.id, memberId, refundAmount, balanceAfter, referenceId ?? null, ledgerDescription, acct.tenant_id],
  );

  return { balanceAfter, frozenAfter, ledgerId };
}
