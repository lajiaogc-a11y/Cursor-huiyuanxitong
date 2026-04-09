/**
 * Finance Ledger Repository — 纯数据访问层
 *
 * 职责：ledger_transactions 表的 CRUD、聚合查询、事务内操作
 * 禁止：业务判断、HTTP 相关、跨模块调用
 */
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import type { PoolConnection } from 'mysql2/promise';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';
import crypto from 'crypto';

function genId() {
  return crypto.randomUUID();
}

export function generateBatchId(): string {
  return `batch_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export interface LedgerRow {
  id: string;
  tenant_id: string | null;
  account_type: string;
  account_id: string;
  source_type: string | null;
  source_id: string | null;
  amount: number;
  before_balance: number;
  after_balance: number;
  is_active: number;
  reversal_of: string | null;
  note: string | null;
  operator_id: string | null;
  operator_name: string | null;
  created_at: string;
}

export function mapRowToApi(r: Record<string, unknown>) {
  const note = (r.note as string) ?? (r.description as string) ?? null;
  const after = Number(r.after_balance ?? r.balance_after ?? 0);
  const before = Number(r.before_balance ?? 0);
  return {
    id: String(r.id),
    account_id: String(r.account_id ?? ''),
    account_type: r.account_type as 'card_vendor' | 'payment_provider',
    source_type: (r.source_type as string) || 'order',
    source_id: r.source_id != null ? String(r.source_id) : null,
    amount: Number(r.amount ?? 0),
    before_balance: before,
    after_balance: after,
    is_active: r.is_active === undefined || r.is_active === null ? true : !!Number(r.is_active),
    reversal_of: r.reversal_of != null ? String(r.reversal_of) : null,
    batch_id: r.batch_id != null ? String(r.batch_id) : null,
    note,
    operator_id: r.operator_id != null ? String(r.operator_id) : null,
    operator_name: r.operator_name != null ? String(r.operator_name) : null,
    created_at: String(r.created_at ?? ''),
  };
}

// ── 查询 ──────────────────────────────────────────────────────────────

function buildTenantClause(tenantId?: string | null): { sql: string; args: unknown[] } {
  return tenantId ? { sql: 'AND (tenant_id IS NULL OR tenant_id = ?)', args: [tenantId] } : { sql: '', args: [] };
}

export async function selectLedgerTransactions(params: {
  account_type: string;
  account_id: string;
  tenant_id?: string | null;
  active_only?: boolean;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const lim = Math.min(Math.max(Number(params.limit) || 500, 1), 2000);
  const active = params.active_only === true ? 'AND (is_active = 1 OR is_active IS NULL)' : '';
  const { sql: tenant, args: tArgs } = buildTenantClause(params.tenant_id);
  const args: unknown[] = [params.account_type, params.account_id, ...tArgs];
  return query<Record<string, unknown>>(
    `SELECT * FROM ledger_transactions WHERE account_type = ? AND account_id = ? ${tenant} ${active} ORDER BY created_at DESC LIMIT ${lim}`,
    args,
  );
}

export async function selectAllLedgerTransactions(params: {
  account_type?: string;
  tenant_id?: string | null;
  start_date?: string;
  end_date?: string;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const lim = Math.min(Math.max(Number(params.limit) || 2000, 1), 5000);
  const conds: string[] = ['1=1'];
  const args: unknown[] = [];
  if (params.account_type) { conds.push('account_type = ?'); args.push(params.account_type); }
  if (params.tenant_id) { conds.push('(tenant_id IS NULL OR tenant_id = ?)'); args.push(params.tenant_id); }
  if (params.start_date) { conds.push('created_at >= ?'); args.push(toMySqlDatetime(params.start_date)); }
  if (params.end_date) { conds.push('created_at <= ?'); args.push(toMySqlDatetime(params.end_date)); }
  return query<Record<string, unknown>>(
    `SELECT * FROM ledger_transactions WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT ${lim}`,
    args,
  );
}

export async function sumActiveAmount(accountType: string, accountId: string, tenantId?: string | null): Promise<number> {
  const { sql: tenant, args: tArgs } = buildTenantClause(tenantId);
  const args: unknown[] = [accountType, accountId, ...tArgs];
  const row = await queryOne<{ v: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM ledger_transactions WHERE account_type = ? AND account_id = ? ${tenant} AND (is_active = 1 OR is_active IS NULL)`,
    args,
  );
  return Number(row?.v ?? 0);
}

export async function sumActiveAmountOnConn(conn: PoolConnection, accountType: string, accountId: string, tenantId?: string | null): Promise<number> {
  const { sql: tenant, args: tArgs } = buildTenantClause(tenantId);
  const args: unknown[] = [accountType, accountId, ...tArgs];
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM ledger_transactions WHERE account_type = ? AND account_id = ? ${tenant} AND (is_active = 1 OR is_active IS NULL)`,
    args,
  );
  return Number((rows as Array<{ v: number }>)[0]?.v ?? 0);
}

export async function countActiveTransactions(accountType: string, accountId: string, tenantId?: string | null): Promise<number> {
  const { sql: tenant, args: tArgs } = buildTenantClause(tenantId);
  const args: unknown[] = [accountType, accountId, ...tArgs];
  const rows = await query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM ledger_transactions WHERE account_type = ? AND account_id = ? ${tenant} AND (is_active = 1 OR is_active IS NULL)`,
    args,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function sumActiveInitialBalance(accountType: string, accountId: string, tenantId?: string | null): Promise<number> {
  const { sql: tenant, args: tArgs } = buildTenantClause(tenantId);
  const args: unknown[] = [accountType, accountId, ...tArgs];
  const rows = await query<{ s: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM ledger_transactions WHERE account_type = ? AND account_id = ? ${tenant} AND (is_active = 1 OR is_active IS NULL) AND source_type IN ('initial_balance', 'initial_balance_adjustment')`,
    args,
  );
  return Number(rows[0]?.s ?? 0);
}

export async function selectById(id: string): Promise<Record<string, unknown> | null> {
  return queryOne<Record<string, unknown>>('SELECT * FROM ledger_transactions WHERE id = ?', [id]) ?? null;
}

// ── 写入 ──────────────────────────────────────────────────────────────

export async function insertLedgerEntryOnConn(conn: PoolConnection, input: {
  account_type: string;
  account_id: string;
  source_type: string;
  source_id?: string | null;
  amount: number;
  before_balance: number;
  after_balance: number;
  note?: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  reversal_of?: string | null;
  batch_id?: string | null;
  tenant_id?: string | null;
}): Promise<Record<string, unknown>> {
  const id = genId();
  const now = toMySqlDatetime(new Date());
  await conn.query(
    `INSERT INTO ledger_transactions (
      id, tenant_id, account_type, account_id, source_type, source_id,
      amount, before_balance, balance_after, is_active, reversal_of, batch_id, note, description,
      operator_id, operator_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.tenant_id ?? null, input.account_type, input.account_id,
      input.source_type, input.source_id ?? null, input.amount, input.before_balance, input.after_balance,
      input.reversal_of ?? null, input.batch_id ?? null,
      input.note ?? null, input.note ?? null,
      input.operator_id ?? null, input.operator_name ?? null, now,
    ],
  );
  return {
    id, account_type: input.account_type, account_id: input.account_id,
    source_type: input.source_type, source_id: input.source_id,
    amount: input.amount, before_balance: input.before_balance, after_balance: input.after_balance, balance_after: input.after_balance,
    is_active: 1, reversal_of: input.reversal_of, batch_id: input.batch_id,
    note: input.note, operator_id: input.operator_id, operator_name: input.operator_name, created_at: now,
  };
}

// ── 更新 / 软删 ──────────────────────────────────────────────────────

export async function deactivateById(id: string): Promise<void> {
  await execute(`UPDATE ledger_transactions SET is_active = 0 WHERE id = ?`, [id]);
}

export async function deactivateByBatchOnConn(conn: PoolConnection, accountType: string, accountId: string, tenantId: string | null, batchId: string): Promise<void> {
  const { sql: tenant, args: tArgs } = buildTenantClause(tenantId);
  await conn.query(
    `UPDATE ledger_transactions SET is_active = 0 WHERE account_type = ? AND account_id = ? ${tenant} AND batch_id = ? AND (is_active = 1 OR is_active IS NULL)`,
    [accountType, accountId, ...tArgs, batchId],
  );
}

export async function deactivateAllActiveOnConn(conn: PoolConnection, accountType: string, accountId: string, tenantId?: string | null): Promise<void> {
  const { sql: tenant, args: tArgs } = buildTenantClause(tenantId);
  await conn.query(
    `UPDATE ledger_transactions SET is_active = 0 WHERE account_type = ? AND account_id = ? ${tenant} AND (is_active = 1 OR is_active IS NULL)`,
    [accountType, accountId, ...tArgs],
  );
}

export async function reactivatePreBatchOnConn(conn: PoolConnection, accountType: string, accountId: string, tenantId: string | null, batchId: string, beforeDate: string): Promise<void> {
  const { sql: tenant, args: tArgs } = buildTenantClause(tenantId);
  await conn.query(
    `UPDATE ledger_transactions SET is_active = 1 WHERE account_type = ? AND account_id = ? ${tenant} AND is_active = 0 AND (batch_id IS NULL OR batch_id <> ?) AND created_at <= ?`,
    [accountType, accountId, ...tArgs, batchId, beforeDate],
  );
}

export async function selectLatestActiveInitialBalanceOnConn(conn: PoolConnection, accountType: string, accountId: string, tenantId?: string | null): Promise<Record<string, unknown> | null> {
  const { sql: tenant, args: tArgs } = buildTenantClause(tenantId);
  const [rows] = await conn.query(
    `SELECT * FROM ledger_transactions WHERE account_type = ? AND account_id = ? ${tenant} AND source_type IN ('initial_balance', 'initial_balance_adjustment') AND (is_active = 1 OR is_active IS NULL) ORDER BY created_at DESC LIMIT 1`,
    [accountType, accountId, ...tArgs],
  );
  const arr = rows as Array<Record<string, unknown>>;
  return arr[0] ?? null;
}

export async function selectActiveBySourceOnConn(accountType: string, accountId: string, sourceType: string, sourceId: string, tenantId?: string | null): Promise<Record<string, unknown> | null> {
  const { sql: tenant, args: tArgs } = buildTenantClause(tenantId);
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ledger_transactions WHERE source_type = ? AND source_id = ? AND account_type = ? AND account_id = ? AND (is_active = 1 OR is_active IS NULL) ${tenant} ORDER BY created_at DESC`,
    [sourceType, sourceId, accountType, accountId, ...tArgs],
  );
  return rows[0] ?? null;
}

export async function softDeleteBySourcePattern(params: {
  account_type: string;
  account_id: string;
  tenant_id: string | null;
  source_prefix: string;
  order_id: string;
  adj_prefix: string;
}): Promise<number> {
  const { account_type, account_id, tenant_id, source_prefix, order_id, adj_prefix } = params;
  const { sql: tenantSql, args: tArgs } = buildTenantClause(tenant_id);
  const baseArgs: unknown[] = [account_type, account_id, ...tArgs];

  const exactSourceId = `${source_prefix}${order_id}`;
  const adjPattern = `${adj_prefix}${order_id}%`;
  const restorePrefixMap: Record<string, string> = { 'wd_': 'wdrestore_', 'rc_': 'rcrestore_', 'order_v_': 'restore_v_', 'order_p_': 'restore_p_', 'gift_': 'grestore_' };
  const restorePrefix = restorePrefixMap[source_prefix] ?? '';
  const restorePattern = restorePrefix ? `${restorePrefix}${order_id}%` : '';

  let matchClause = '(source_id = ? OR source_id LIKE ?)';
  const matchArgs = [exactSourceId, adjPattern];
  if (restorePattern) {
    matchClause = '(source_id = ? OR source_id LIKE ? OR source_id LIKE ?)';
    matchArgs.push(restorePattern);
  }

  const countRows = await query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM ledger_transactions WHERE account_type = ? AND account_id = ? ${tenantSql} AND (is_active = 1 OR is_active IS NULL) AND ${matchClause}`,
    [...baseArgs, ...matchArgs],
  );
  const matchCount = Number(countRows[0]?.c ?? 0);
  if (matchCount === 0) return 0;

  await execute(
    `UPDATE ledger_transactions SET is_active = 0 WHERE account_type = ? AND account_id = ? ${tenantSql} AND (is_active = 1 OR is_active IS NULL) AND ${matchClause}`,
    [...baseArgs, ...matchArgs],
  );
  return matchCount;
}

export async function deleteByAccount(accountType: string, accountId: string, tenantId?: string | null): Promise<void> {
  if (tenantId) {
    await execute(`DELETE FROM ledger_transactions WHERE account_type = ? AND account_id = ? AND (tenant_id IS NULL OR tenant_id = ?)`, [accountType, accountId, tenantId]);
  } else {
    await execute(`DELETE FROM ledger_transactions WHERE account_type = ? AND account_id = ?`, [accountType, accountId]);
  }
}

// ── 重算 running balance ─────────────────────────────────────────────

export async function recalculateRunningBalancesOnConn(conn: PoolConnection, accountType: string, accountId: string, tenantId?: string | null): Promise<void> {
  const { sql: tenant, args: tArgs } = buildTenantClause(tenantId);
  const [rows] = await conn.query(
    `SELECT id, amount FROM ledger_transactions WHERE account_type = ? AND account_id = ? ${tenant} AND (is_active = 1 OR is_active IS NULL) ORDER BY created_at ASC, id ASC`,
    [accountType, accountId, ...tArgs],
  );
  let running = 0;
  for (const r of rows as Array<{ id: string; amount: number | string | null }>) {
    const amt = Number(r.amount ?? 0);
    const before = running;
    const after = running + amt;
    await conn.query(`UPDATE ledger_transactions SET before_balance = ?, balance_after = ? WHERE id = ?`, [before, after, r.id]);
    running = after;
  }
}

// ── 迁移 ─────────────────────────────────────────────────────────────

export async function ensureBatchIdColumn(): Promise<void> {
  try {
    const [cols] = await (await import('../../database/index.js')).getPool().query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_transactions' AND COLUMN_NAME = 'batch_id'`,
    );
    if ((cols as unknown[]).length === 0) {
      await execute(`ALTER TABLE ledger_transactions ADD COLUMN batch_id VARCHAR(64) DEFAULT NULL`);
      await execute(`CREATE INDEX idx_ledger_batch_id ON ledger_transactions(batch_id)`);
      console.log('[Ledger] Added batch_id column');
    }
  } catch (e) {
    console.warn('[Ledger] batch_id column migration skipped:', e);
  }
}

export { withTransaction };
