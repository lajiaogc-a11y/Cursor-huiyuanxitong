/**
 * 商家账本 ledger_transactions — 与前端 ledgerTransactionService 对齐
 *
 * 核心原则：ledger_transactions 是唯一余额真源 (single source of truth)。
 * - 有效余额 = SUM(amount) WHERE is_active=1
 * - 所有变更采用补偿事务模型：修改=adjustment、删除=reversal、恢复=restore
 * - 初始余额重置使用 batch_id 将同批操作关联，撤回按 batch 回滚
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

function mapToApi(r: Record<string, unknown>) {
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

export async function listLedgerTransactions(params: {
  account_type: string;
  account_id: string;
  tenant_id?: string | null;
  active_only?: boolean;
  limit?: number;
}): Promise<unknown[]> {
  const lim = Math.min(Math.max(Number(params.limit) || 500, 1), 2000);
  const active = params.active_only === true ? 'AND (is_active = 1 OR is_active IS NULL)' : '';
  const tenant = params.tenant_id
    ? 'AND (tenant_id IS NULL OR tenant_id = ?)'
    : '';
  const sql = `
    SELECT * FROM ledger_transactions
    WHERE account_type = ? AND account_id = ?
    ${tenant}
    ${active}
    ORDER BY created_at DESC
    LIMIT ${lim}
  `;
  const args: unknown[] = [params.account_type, params.account_id];
  if (params.tenant_id) args.push(params.tenant_id);
  const rows = await query<Record<string, unknown>>(sql, args);
  return rows.map(mapToApi);
}

export async function listAllLedgerTransactions(params: {
  account_type?: string;
  tenant_id?: string | null;
  start_date?: string;
  end_date?: string;
  limit?: number;
}): Promise<unknown[]> {
  const lim = Math.min(Math.max(Number(params.limit) || 2000, 1), 5000);
  const conds: string[] = ['1=1'];
  const args: unknown[] = [];
  if (params.account_type) {
    conds.push('account_type = ?');
    args.push(params.account_type);
  }
  if (params.tenant_id) {
    conds.push('(tenant_id IS NULL OR tenant_id = ?)');
    args.push(params.tenant_id);
  }
  if (params.start_date) {
    conds.push('created_at >= ?');
    args.push(toMySqlDatetime(params.start_date));
  }
  if (params.end_date) {
    conds.push('created_at <= ?');
    args.push(toMySqlDatetime(params.end_date));
  }
  const sql = `SELECT * FROM ledger_transactions WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT ${lim}`;
  const rows = await query<Record<string, unknown>>(sql, args);
  return rows.map(mapToApi);
}

/** 当前有效余额 = 所有「有效」分录 amount 之和（与软删、对账一致） */
async function getLatestActiveAfterBalance(accountType: string, accountId: string, tenantId?: string | null): Promise<number> {
  const tenant = tenantId ? 'AND (tenant_id IS NULL OR tenant_id = ?)' : '';
  const args: unknown[] = [accountType, accountId];
  if (tenantId) args.push(tenantId);
  const row = await queryOne<{ v: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM ledger_transactions
     WHERE account_type = ? AND account_id = ? ${tenant}
     AND (is_active = 1 OR is_active IS NULL)`,
    args
  );
  return Number(row?.v ?? 0);
}

/** 事务内版本：从连接对象上查询 */
async function getActiveBalanceOnConn(conn: PoolConnection, accountType: string, accountId: string, tenantId?: string | null): Promise<number> {
  const tenant = tenantId ? 'AND (tenant_id IS NULL OR tenant_id = ?)' : '';
  const args: unknown[] = [accountType, accountId];
  if (tenantId) args.push(tenantId);
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM ledger_transactions
     WHERE account_type = ? AND account_id = ? ${tenant}
     AND (is_active = 1 OR is_active IS NULL)`,
    args
  );
  const arr = rows as Array<{ v: number }>;
  return Number(arr[0]?.v ?? 0);
}

/** 事务内创建分录 */
async function createLedgerEntryOnConn(conn: PoolConnection, input: {
  account_type: string;
  account_id: string;
  source_type: string;
  source_id?: string | null;
  amount: number;
  note?: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  reversal_of?: string | null;
  batch_id?: string | null;
  tenant_id?: string | null;
}): Promise<Record<string, unknown>> {
  const before = await getActiveBalanceOnConn(conn, input.account_type, input.account_id, input.tenant_id);
  const amt = Number(input.amount);
  const after = before + amt;
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
      input.source_type, input.source_id ?? null, amt, before, after,
      input.reversal_of ?? null, input.batch_id ?? null,
      input.note ?? null, input.note ?? null,
      input.operator_id ?? null, input.operator_name ?? null, now,
    ]
  );

  return { id, account_type: input.account_type, account_id: input.account_id, source_type: input.source_type, source_id: input.source_id, amount: amt, before_balance: before, after_balance: after, balance_after: after, is_active: 1, reversal_of: input.reversal_of, batch_id: input.batch_id, note: input.note, operator_id: input.operator_id, operator_name: input.operator_name, created_at: now };
}

export async function createLedgerEntry(input: {
  account_type: string;
  account_id: string;
  source_type: string;
  source_id?: string | null;
  amount: number;
  note?: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  reversal_of?: string | null;
  batch_id?: string | null;
  tenant_id?: string | null;
}): Promise<unknown> {
  const before = await getLatestActiveAfterBalance(input.account_type, input.account_id, input.tenant_id);
  const amt = Number(input.amount);
  const after = before + amt;
  const id = genId();
  const now = toMySqlDatetime(new Date());

  await execute(
    `INSERT INTO ledger_transactions (
      id, tenant_id, account_type, account_id, source_type, source_id,
      amount, before_balance, balance_after, is_active, reversal_of, batch_id, note, description,
      operator_id, operator_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.tenant_id ?? null, input.account_type, input.account_id,
      input.source_type, input.source_id ?? null, amt, before, after,
      input.reversal_of ?? null, input.batch_id ?? null,
      input.note ?? null, input.note ?? null,
      input.operator_id ?? null, input.operator_name ?? null, now,
    ]
  );

  const row = await queryOne<Record<string, unknown>>('SELECT * FROM ledger_transactions WHERE id = ?', [id]);
  return row ? mapToApi(row) : mapToApi({ id, account_type: input.account_type, account_id: input.account_id, source_type: input.source_type, source_id: input.source_id, amount: amt, before_balance: before, after_balance: after, is_active: 1, reversal_of: input.reversal_of, batch_id: input.batch_id, note: input.note, operator_id: input.operator_id, operator_name: input.operator_name, created_at: now });
}

/**
 * 真对账：将 ledger SUM 与前端传入的 derivedBalance 比较，计算实际 discrepancy。
 * 若 derivedBalance 未传入（兼容旧调用），storedBalance 回退到 computedBalance。
 */
export async function reconcileAccount(accountType: string, accountId: string, tenantId?: string | null, derivedBalance?: number | null) {
  const tenant = tenantId ? 'AND (tenant_id IS NULL OR tenant_id = ?)' : '';
  const args: unknown[] = [accountType, accountId];
  if (tenantId) args.push(tenantId);
  const rows = await query<{ s: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM ledger_transactions
     WHERE account_type = ? AND account_id = ? ${tenant}
     AND (is_active = 1 OR is_active IS NULL)`,
    args
  );
  const activeSum = Number(rows[0]?.s ?? 0);
  const cntRows = await query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM ledger_transactions
     WHERE account_type = ? AND account_id = ? ${tenant}
     AND (is_active = 1 OR is_active IS NULL)`,
    args
  );
  const transactionCount = Number(cntRows[0]?.c ?? 0);

  const initialRows = await query<{ s: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM ledger_transactions
     WHERE account_type = ? AND account_id = ? ${tenant}
     AND (is_active = 1 OR is_active IS NULL)
     AND source_type IN ('initial_balance', 'initial_balance_adjustment')`,
    args
  );
  const initialBalance = Number(initialRows[0]?.s ?? 0);

  const computedBalance = activeSum;
  const storedBalance = (derivedBalance != null && Number.isFinite(derivedBalance)) ? derivedBalance : computedBalance;
  const discrepancy = computedBalance - storedBalance;

  return {
    computedBalance,
    storedBalance,
    discrepancy,
    needsCorrection: Math.abs(discrepancy) >= 0.01,
    transactionCount,
    initialBalance,
    activeSum,
  };
}

/**
 * 自动对账修正：对比后若有差异，自动插入 reconciliation 分录修正
 */
export async function reconcileAndCorrect(
  accountType: string, accountId: string, derivedBalance: number,
  operatorId?: string | null, operatorName?: string | null, tenantId?: string | null
): Promise<{ computedBalance: number; corrected: boolean; correctionAmount: number }> {
  const result = await reconcileAccount(accountType, accountId, tenantId, derivedBalance);
  if (!result.needsCorrection) {
    return { computedBalance: result.computedBalance, corrected: false, correctionAmount: 0 };
  }
  const correctionAmount = -result.discrepancy;
  await createLedgerEntry({
    account_type: accountType,
    account_id: accountId,
    source_type: 'reconciliation',
    source_id: `recon_${accountId}_${Date.now()}`,
    amount: correctionAmount,
    note: `对账修正: ledger=${result.computedBalance.toFixed(2)}, derived=${derivedBalance.toFixed(2)}, diff=${result.discrepancy.toFixed(2)}`,
    operator_id: operatorId,
    operator_name: operatorName,
    tenant_id: tenantId,
  });
  const newBalance = await getLatestActiveAfterBalance(accountType, accountId, tenantId);
  return { computedBalance: newBalance, corrected: true, correctionAmount };
}

export async function softDeleteLedgerEntry(input: {
  source_type: string;
  source_id: string;
  account_type: string;
  account_id: string;
  note?: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  tenant_id?: string | null;
}): Promise<unknown | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ledger_transactions WHERE source_type = ? AND source_id = ? AND account_type = ? AND account_id = ?
     AND (is_active = 1 OR is_active IS NULL) ORDER BY created_at DESC`,
    [input.source_type, input.source_id, input.account_type, input.account_id]
  );
  const target = rows[0];
  if (!target) return null;

  await execute(`UPDATE ledger_transactions SET is_active = 0 WHERE id = ?`, [target.id]);
  return mapToApi({ ...target, is_active: 0 });
}

/**
 * 初始余额重置（批次化）：
 * 1. 在事务内，将该账户所有 active 的 withdrawal/recharge/adjustment 等分录批量软删
 * 2. 写入一条新 initial_balance 分录，金额 = new_balance
 * 3. 整批操作共享同一 batch_id，便于完整回滚
 */
export async function setInitialBalanceLedger(input: {
  account_type: string;
  account_id: string;
  new_balance: number;
  batch_id?: string | null;
  note?: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  tenant_id?: string | null;
}): Promise<unknown> {
  const batchId = input.batch_id || generateBatchId();

  return withTransaction(async (conn) => {
    const tenant = input.tenant_id ? 'AND (tenant_id IS NULL OR tenant_id = ?)' : '';
    const baseArgs: unknown[] = [input.account_type, input.account_id];
    if (input.tenant_id) baseArgs.push(input.tenant_id);

    // Step 1: 批量软删所有当前 active 分录（全部归零重来）
    await conn.query(
      `UPDATE ledger_transactions SET is_active = 0
       WHERE account_type = ? AND account_id = ? ${tenant}
       AND (is_active = 1 OR is_active IS NULL)`,
      baseArgs
    );

    // Step 2: 此时有效余额 = 0，写入新的 initial_balance 分录
    const newBalance = Number(input.new_balance);
    const entry = await createLedgerEntryOnConn(conn, {
      account_type: input.account_type,
      account_id: input.account_id,
      source_type: 'initial_balance',
      source_id: `ib_${batchId}`,
      amount: newBalance,
      note: input.note ?? `设置初始余额: ¥${newBalance.toFixed(2)}`,
      operator_id: input.operator_id,
      operator_name: input.operator_name,
      batch_id: batchId,
      tenant_id: input.tenant_id,
    });

    return mapToApi({ ...entry, batch_id: batchId });
  });
}

/**
 * 撤回初始余额：按 batch_id 完整回滚。
 * 1. 找到最新的 initial_balance 分录及其 batch_id
 * 2. 软删该 batch_id 下的所有分录
 * 3. 恢复该 batch 重置时批量软删的旧分录（它们在同一事务中被标记 is_active=0）
 *
 * 回滚策略：soft-delete 当前 batch 的分录 → 重新激活上一批次的分录。
 * 由于旧版本可能没有 batch_id，兼容模式下 fallback 只软删最新一条。
 */
export async function reverseInitialBalanceEntry(input: {
  account_type: string;
  account_id: string;
  note?: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  tenant_id?: string | null;
}): Promise<unknown | null> {
  return withTransaction(async (conn) => {
    const tenant = input.tenant_id ? 'AND (tenant_id IS NULL OR tenant_id = ?)' : '';
    const baseArgs: unknown[] = [input.account_type, input.account_id];
    if (input.tenant_id) baseArgs.push(input.tenant_id);

    // 找最新的 active initial_balance 分录
    const [ibRows] = await conn.query(
      `SELECT * FROM ledger_transactions
       WHERE account_type = ? AND account_id = ? ${tenant}
       AND source_type IN ('initial_balance', 'initial_balance_adjustment')
       AND (is_active = 1 OR is_active IS NULL)
       ORDER BY created_at DESC LIMIT 1`,
      baseArgs
    );
    const ibArr = ibRows as Array<Record<string, unknown>>;
    if (!ibArr.length) return null;
    const latestIb = ibArr[0];
    const batchId = latestIb.batch_id ? String(latestIb.batch_id) : null;

    if (batchId) {
      // 新模式：batch_id 存在
      // Step 1: 软删该 batch 下的所有分录
      await conn.query(
        `UPDATE ledger_transactions SET is_active = 0
         WHERE account_type = ? AND account_id = ? ${tenant}
         AND batch_id = ? AND (is_active = 1 OR is_active IS NULL)`,
        [...baseArgs, batchId]
      );

      // Step 2: 恢复该次重置前被批量软删的分录
      // 重置时在同一事务中批量 is_active=0 了之前的分录，这些分录没有 batch_id 但在重置时间点之前被软删。
      // 找到该 batch 的 initial_balance 创建时间，将之前 1 秒内被软删且没有 batch_id 的分录恢复
      const ibCreatedAt = String(latestIb.created_at);
      await conn.query(
        `UPDATE ledger_transactions SET is_active = 1
         WHERE account_type = ? AND account_id = ? ${tenant}
         AND is_active = 0
         AND (batch_id IS NULL OR batch_id <> ?)
         AND created_at <= ?`,
        [...baseArgs, batchId, ibCreatedAt]
      );
    } else {
      // 兼容旧数据：只软删最新一条 initial_balance
      await conn.query(
        `UPDATE ledger_transactions SET is_active = 0 WHERE id = ?`,
        [latestIb.id]
      );
    }

    return mapToApi({ ...latestIb, is_active: 0 });
  });
}

export async function deleteLedgerForAccount(accountType: string, accountId: string): Promise<void> {
  await execute(`DELETE FROM ledger_transactions WHERE account_type = ? AND account_id = ?`, [accountType, accountId]);
}

/** 获取 ledger 权威余额（对外 API） */
export async function getLedgerBalance(accountType: string, accountId: string, tenantId?: string | null): Promise<number> {
  return getLatestActiveAfterBalance(accountType, accountId, tenantId);
}

/** 确保 batch_id 列存在（迁移用） */
export async function ensureLedgerBatchIdColumn(): Promise<void> {
  try {
    const [cols] = await (await import('../../database/index.js')).getPool().query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_transactions' AND COLUMN_NAME = 'batch_id'`
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
