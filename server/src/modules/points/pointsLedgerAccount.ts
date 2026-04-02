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
): Promise<void> {
  const { ledgerId, memberId, type, delta, description, referenceType, referenceId, createdBy, extras, clampToZero } = input;
  const x = extras ?? {};

  const memberRow = await qOne<{ tenant_id: string | null }>(
    conn,
    'SELECT tenant_id FROM members WHERE id = ? LIMIT 1',
    [memberId],
  );
  const memberTenantId = memberRow?.tenant_id ?? null;

  let acct = await qOne<{ id: string; balance: number; tenant_id: string | null }>(
    conn,
    'SELECT id, balance, tenant_id FROM points_accounts WHERE member_id = ? FOR UPDATE',
    [memberId]
  );
  if (!acct) {
    if (delta < 0 && !clampToZero) {
      throw new Error('INSUFFICIENT_POINTS_NO_ACCOUNT');
    }
    const newId = randomUUID();
    await exec(
      conn,
      'INSERT INTO points_accounts (id, member_id, tenant_id, balance, total_earned, total_spent) VALUES (?, ?, ?, 0, 0, 0)',
      [newId, memberId, memberTenantId]
    );
    acct = { id: newId, balance: 0, tenant_id: memberTenantId };
  } else if (!acct.tenant_id && memberTenantId) {
    await exec(conn, 'UPDATE points_accounts SET tenant_id = ? WHERE id = ? AND tenant_id IS NULL', [
      memberTenantId,
      acct.id,
    ]);
    acct = { ...acct, tenant_id: memberTenantId };
  }

  const before = Number(acct.balance);
  let after = before + delta;
  if (after < 0) {
    if (!clampToZero) {
      throw new Error('INSUFFICIENT_POINTS');
    }
    after = 0;
  }

  await exec(
    conn,
    `UPDATE points_accounts SET
       balance = ?,
       total_earned = total_earned + ?,
       total_spent = total_spent + ?,
       updated_at = NOW(3)
     WHERE id = ?`,
    [after, Math.max(0, delta), Math.max(0, -delta), acct.id]
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
      delta,
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

  if (delta > 0) {
    await exec(
      conn,
      `UPDATE members SET
         lifetime_reward_points_earned = lifetime_reward_points_earned + ?,
         total_points = total_points + ?
       WHERE id = ?`,
      [delta, delta, memberId],
    );
    const ptsRow = await qOne<{ total_points: number | string; tenant_id: string | null }>(
      conn,
      'SELECT total_points, tenant_id FROM members WHERE id = ? LIMIT 1',
      [memberId],
    );
    const tp = Number(ptsRow?.total_points) || 0;
    await syncMemberLevelFromTotalOnConn(conn, memberId, ptsRow?.tenant_id ?? null, tp);
  }
}
