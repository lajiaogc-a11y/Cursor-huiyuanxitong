import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import * as ledger from './ledgerService.js';

function requireEmployee(req: AuthenticatedRequest, res: Response): boolean {
  if (req.user?.type === 'member') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } });
    return false;
  }
  return true;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getLedger(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const account_type = String(req.query.account_type || '');
  const account_id = String(req.query.account_id || '');
  if (!account_type || !account_id) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'account_type and account_id required' } });
    return;
  }
  const active_only = req.query.active_only === 'true';
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const tenant_id = req.user?.tenant_id ?? null;
  const rows = await ledger.listLedgerTransactions({
    account_type,
    account_id,
    tenant_id,
    active_only,
    limit,
  });
  res.json({ success: true, data: rows });
}

export async function getLedgerAll(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const account_type = req.query.account_type ? String(req.query.account_type) : undefined;
  const tenant_id = req.user?.tenant_id ?? null;
  const rows = await ledger.listAllLedgerTransactions({
    account_type,
    tenant_id,
    start_date: req.query.start_date ? String(req.query.start_date) : undefined,
    end_date: req.query.end_date ? String(req.query.end_date) : undefined,
  });
  res.json({ success: true, data: rows });
}

export async function postLedger(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const b = req.body as Record<string, unknown>;
  const row = await ledger.createLedgerEntry({
    account_type: String(b.account_type || ''),
    account_id: String(b.account_id || ''),
    source_type: String(b.source_type || 'order'),
    source_id: b.source_id != null ? String(b.source_id) : null,
    amount: Number(b.amount),
    note: b.note != null ? String(b.note) : null,
    operator_id: b.operator_id != null ? String(b.operator_id) : null,
    operator_name: b.operator_name != null ? String(b.operator_name) : null,
    reversal_of: b.reversal_of != null ? String(b.reversal_of) : null,
    batch_id: b.batch_id != null ? String(b.batch_id) : null,
    tenant_id: req.user?.tenant_id ?? null,
  });
  res.json({ success: true, data: row });
}

export async function postLedgerReconcile(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const b = req.body as Record<string, unknown>;
  const result = await ledger.reconcileAccount(
    String(b.account_type || ''),
    String(b.account_id || ''),
    req.user?.tenant_id ?? null,
    numOrNull(b.derived_balance),
  );
  res.json({ success: true, data: result });
}

export async function postLedgerReconcileAndCorrect(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const b = req.body as Record<string, unknown>;
  const derivedBalance = numOrNull(b.derived_balance);
  if (derivedBalance == null) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'derived_balance required' } });
    return;
  }
  const result = await ledger.reconcileAndCorrect(
    String(b.account_type || ''),
    String(b.account_id || ''),
    derivedBalance,
    b.operator_id != null ? String(b.operator_id) : null,
    b.operator_name != null ? String(b.operator_name) : null,
    req.user?.tenant_id ?? null,
  );
  res.json({ success: true, data: result });
}

export async function getLedgerBalance(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const account_type = String(req.query.account_type || '');
  const account_id = String(req.query.account_id || '');
  if (!account_type || !account_id) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'account_type and account_id required' } });
    return;
  }
  const balance = await ledger.getLedgerBalance(account_type, account_id, req.user?.tenant_id ?? null);
  res.json({ success: true, data: { balance } });
}

export async function postLedgerSoftDelete(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const b = req.body as Record<string, unknown>;
  const row = await ledger.softDeleteLedgerEntry({
    source_type: String(b.source_type || ''),
    source_id: String(b.source_id || ''),
    account_type: String(b.account_type || ''),
    account_id: String(b.account_id || ''),
    note: b.note != null ? String(b.note) : null,
    operator_id: b.operator_id != null ? String(b.operator_id) : null,
    operator_name: b.operator_name != null ? String(b.operator_name) : null,
    tenant_id: req.user?.tenant_id ?? null,
  });
  res.json({ success: true, data: row });
}

export async function postLedgerInitialBalance(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const b = req.body as Record<string, unknown>;
  const row = await ledger.setInitialBalanceLedger({
    account_type: String(b.account_type || ''),
    account_id: String(b.account_id || ''),
    new_balance: Number(b.new_balance),
    batch_id: b.batch_id != null ? String(b.batch_id) : null,
    note: b.note != null ? String(b.note) : null,
    operator_id: b.operator_id != null ? String(b.operator_id) : null,
    operator_name: b.operator_name != null ? String(b.operator_name) : null,
    tenant_id: req.user?.tenant_id ?? null,
  });
  res.json({ success: true, data: row });
}

export async function postReverseInitialBalance(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const b = req.body as Record<string, unknown>;
  const row = await ledger.reverseInitialBalanceEntry({
    account_type: String(b.account_type || ''),
    account_id: String(b.account_id || ''),
    note: b.note != null ? String(b.note) : null,
    operator_id: b.operator_id != null ? String(b.operator_id) : null,
    operator_name: b.operator_name != null ? String(b.operator_name) : null,
    tenant_id: req.user?.tenant_id ?? null,
  });
  res.json({ success: true, data: row });
}

/**
 * 反转一条业务记录的所有关联 ledger 分录（原始 + 全部调整/恢复）。
 * 匹配规则：source_id 精确匹配 或 以 adj_prefix+order_id 开头 或以 restore prefix 开头。
 * 全部匹配行软删 (is_active=0)，有效余额 = SUM(active amount)。
 *
 * 注意：不得用 SUM(amount)=0 作为「跳过软删」条件。同一提款/充值若存在多条相消分录（净额为 0），
 * 仍必须全部软删，否则修改明细后无法再写入同 source_id 的新分录，账本会出现旧数据消失或重复。
 */
export async function postReverseAll(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const b = req.body as Record<string, unknown>;
  const account_type = String(b.account_type || '');
  const account_id = String(b.account_id || '');
  const order_id = String(b.order_id || '');
  const source_prefix = String(b.source_prefix || '');
  const adj_prefix = String(b.adj_prefix || '');
  const tenant_id = req.user?.tenant_id ?? null;
  const tenantSql = tenant_id ? 'AND (tenant_id IS NULL OR tenant_id = ?)' : '';
  const args: unknown[] = [account_type, account_id];
  if (tenant_id) args.push(tenant_id);
  const { query: dbQuery, execute: dbExecute } = await import('../../database/index.js');

  const exactSourceId = `${source_prefix}${order_id}`;
  const adjPattern = `${adj_prefix}${order_id}%`;
  // 也匹配 restore 前缀：wdrestore_ / rcrestore_
  const restorePrefix = source_prefix === 'wd_' ? 'wdrestore_' : source_prefix === 'rc_' ? 'rcrestore_' : '';
  const restorePattern = restorePrefix ? `${restorePrefix}${order_id}%` : '';

  let matchClause = '(source_id = ? OR source_id LIKE ?)';
  const matchArgs = [exactSourceId, adjPattern];
  if (restorePattern) {
    matchClause = '(source_id = ? OR source_id LIKE ? OR source_id LIKE ?)';
    matchArgs.push(restorePattern);
  }

  const countRows = await dbQuery<{ c: number }>(
    `SELECT COUNT(*) AS c FROM ledger_transactions
     WHERE account_type = ? AND account_id = ? ${tenantSql}
     AND (is_active = 1 OR is_active IS NULL)
     AND ${matchClause}`,
    [...args, ...matchArgs]
  );
  const matchCount = Number(countRows[0]?.c ?? 0);
  if (matchCount === 0) {
    res.json({ success: true, data: null });
    return;
  }
  await dbExecute(
    `UPDATE ledger_transactions SET is_active = 0
     WHERE account_type = ? AND account_id = ? ${tenantSql}
     AND (is_active = 1 OR is_active IS NULL)
     AND ${matchClause}`,
    [...args, ...matchArgs]
  );
  await ledger.recalculateLedgerRunningBalancesForAccount(account_type, account_id, tenant_id);
  res.json({ success: true, data: null });
}

/** 按时间链重算 before_balance / balance_after（修复历史脏数据或供运维一次性校正） */
export async function postLedgerRecalculateRunningBalances(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const b = req.body as Record<string, unknown>;
  const account_type = String(b.account_type || '');
  const account_id = String(b.account_id || '');
  if (!account_type || !account_id) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'account_type and account_id required' } });
    return;
  }
  await ledger.recalculateLedgerRunningBalancesForAccount(account_type, account_id, req.user?.tenant_id ?? null);
  res.json({ success: true, data: true });
}

export async function deleteLedgerAccount(req: AuthenticatedRequest, res: Response) {
  if (!requireEmployee(req, res)) return;
  const account_type = String(req.query.account_type || '');
  const account_id = String(req.query.account_id || '');
  if (!account_type || !account_id) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'account_type and account_id required' } });
    return;
  }
  await ledger.deleteLedgerForAccount(account_type, account_id);
  res.json({ success: true, data: true });
}
