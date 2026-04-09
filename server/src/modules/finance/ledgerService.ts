/**
 * 商家账本 Service — 业务编排层
 *
 * 职责：账本分录的创建 / 软删 / 对账 / 初始余额重置 / 撤回等业务流程
 * 禁止：直接 SQL、直接 import database 模块
 * 数据访问全部委托 repository.ts
 */
import * as repo from './repository.js';
import type { LedgerRow } from './repository.js';

export type { LedgerRow };
export { generateBatchId } from './repository.js';

// ── 查询 ──────────────────────────────────────────────────────────────

export async function listLedgerTransactions(params: {
  account_type: string;
  account_id: string;
  tenant_id?: string | null;
  active_only?: boolean;
  limit?: number;
}): Promise<unknown[]> {
  const rows = await repo.selectLedgerTransactions(params);
  return rows.map(repo.mapRowToApi);
}

export async function listAllLedgerTransactions(params: {
  account_type?: string;
  tenant_id?: string | null;
  start_date?: string;
  end_date?: string;
  limit?: number;
}): Promise<unknown[]> {
  const rows = await repo.selectAllLedgerTransactions(params);
  return rows.map(repo.mapRowToApi);
}

export async function getLedgerBalance(accountType: string, accountId: string, tenantId?: string | null): Promise<number> {
  return repo.sumActiveAmount(accountType, accountId, tenantId);
}

// ── 创建分录 ──────────────────────────────────────────────────────────

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
  let newId = '';
  await repo.withTransaction(async (conn) => {
    const before = await repo.sumActiveAmountOnConn(conn, input.account_type, input.account_id, input.tenant_id);
    const amt = Number(input.amount);
    const after = before + amt;
    const created = await repo.insertLedgerEntryOnConn(conn, {
      ...input,
      amount: amt,
      before_balance: before,
      after_balance: after,
    });
    newId = String(created.id ?? '');
    await repo.recalculateRunningBalancesOnConn(conn, input.account_type, input.account_id, input.tenant_id);
  });

  const row = newId ? await repo.selectById(newId) : null;
  if (!row) throw new Error(`ledger row missing after insert/recalc: ${newId || '(no id)'}`);
  return repo.mapRowToApi(row);
}

// ── 对账 ──────────────────────────────────────────────────────────────

export async function reconcileAccount(accountType: string, accountId: string, tenantId?: string | null, derivedBalance?: number | null) {
  const activeSum = await repo.sumActiveAmount(accountType, accountId, tenantId);
  const transactionCount = await repo.countActiveTransactions(accountType, accountId, tenantId);
  const initialBalance = await repo.sumActiveInitialBalance(accountType, accountId, tenantId);

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

export async function reconcileAndCorrect(
  accountType: string, accountId: string, derivedBalance: number,
  operatorId?: string | null, operatorName?: string | null, tenantId?: string | null,
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
    note: `Reconciliation adjustment: ledger=${result.computedBalance.toFixed(2)}, derived=${derivedBalance.toFixed(2)}, diff=${result.discrepancy.toFixed(2)}`,
    operator_id: operatorId,
    operator_name: operatorName,
    tenant_id: tenantId,
  });
  const newBalance = await repo.sumActiveAmount(accountType, accountId, tenantId);
  return { computedBalance: newBalance, corrected: true, correctionAmount };
}

// ── 软删 ──────────────────────────────────────────────────────────────

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
  const target = await repo.selectActiveBySourceOnConn(input.account_type, input.account_id, input.source_type, input.source_id, input.tenant_id);
  if (!target) return null;

  await repo.deactivateById(String(target.id));
  await recalculateLedgerRunningBalancesForAccount(input.account_type, input.account_id, input.tenant_id);
  return repo.mapRowToApi({ ...target, is_active: 0 });
}

export async function softDeleteLedgerRowsBySourcePattern(params: {
  account_type: string;
  account_id: string;
  tenant_id: string | null;
  source_prefix: string;
  order_id: string;
  adj_prefix: string;
}): Promise<number> {
  return repo.softDeleteBySourcePattern(params);
}

// ── 重算余额链 ──────────────────────────────────────────────────────

export async function recalculateLedgerRunningBalancesForAccount(
  accountType: string, accountId: string, tenantId?: string | null, conn?: import('mysql2/promise').PoolConnection,
): Promise<void> {
  if (conn) {
    await repo.recalculateRunningBalancesOnConn(conn, accountType, accountId, tenantId);
    return;
  }
  await repo.withTransaction(async (c) => {
    await repo.recalculateRunningBalancesOnConn(c, accountType, accountId, tenantId);
  });
}

// ── 初始余额 ─────────────────────────────────────────────────────────

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
  const batchId = input.batch_id || repo.generateBatchId();

  return repo.withTransaction(async (conn) => {
    await repo.deactivateAllActiveOnConn(conn, input.account_type, input.account_id, input.tenant_id);

    const newBalance = Number(input.new_balance);
    const entry = await repo.insertLedgerEntryOnConn(conn, {
      account_type: input.account_type,
      account_id: input.account_id,
      source_type: 'initial_balance',
      source_id: `ib_${batchId}`,
      amount: newBalance,
      before_balance: 0,
      after_balance: newBalance,
      note: input.note ?? `Set initial balance: ¥${newBalance.toFixed(2)}`,
      operator_id: input.operator_id,
      operator_name: input.operator_name,
      batch_id: batchId,
      tenant_id: input.tenant_id,
    });

    await repo.recalculateRunningBalancesOnConn(conn, input.account_type, input.account_id, input.tenant_id);

    const [freshIb] = await conn.query('SELECT * FROM ledger_transactions WHERE id = ? LIMIT 1', [entry.id]);
    const freshRow = (freshIb as Record<string, unknown>[])[0];
    return repo.mapRowToApi(freshRow ? { ...freshRow, batch_id: batchId } : { ...entry, batch_id: batchId });
  });
}

// ── 撤回初始余额 ────────────────────────────────────────────────────

export async function reverseInitialBalanceEntry(input: {
  account_type: string;
  account_id: string;
  note?: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  tenant_id?: string | null;
}): Promise<unknown | null> {
  return repo.withTransaction(async (conn) => {
    const latestIb = await repo.selectLatestActiveInitialBalanceOnConn(conn, input.account_type, input.account_id, input.tenant_id);
    if (!latestIb) return null;
    const batchId = latestIb.batch_id ? String(latestIb.batch_id) : null;

    if (batchId) {
      await repo.deactivateByBatchOnConn(conn, input.account_type, input.account_id, input.tenant_id ?? null, batchId);
      await repo.reactivatePreBatchOnConn(conn, input.account_type, input.account_id, input.tenant_id ?? null, batchId, String(latestIb.created_at));
    } else {
      await conn.query(`UPDATE ledger_transactions SET is_active = 0 WHERE id = ?`, [latestIb.id]);
    }

    await repo.recalculateRunningBalancesOnConn(conn, input.account_type, input.account_id, input.tenant_id);
    return repo.mapRowToApi({ ...latestIb, is_active: 0 });
  });
}

// ── 删除 ─────────────────────────────────────────────────────────────

export async function deleteLedgerForAccount(accountType: string, accountId: string, tenantId?: string | null): Promise<void> {
  await repo.deleteByAccount(accountType, accountId, tenantId);
}

// ── 迁移 ─────────────────────────────────────────────────────────────

export async function ensureLedgerBatchIdColumn(): Promise<void> {
  await repo.ensureBatchIdColumn();
}
