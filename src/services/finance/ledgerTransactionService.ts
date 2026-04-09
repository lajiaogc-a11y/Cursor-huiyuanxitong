/**
 * Ledger Transaction Service
 * Event-sourcing ledger for merchant balances
 * Uses the ledger_transactions table as the single source of truth
 *
 * 核心原则：
 * - ledger_transactions 是唯一余额真源
 * - 所有变更采用补偿事务模型
 * - 每次写操作后自动对账
 */

import { financeApi } from '@/api/finance';
import { notifyDataMutation } from '@/services/system/dataRefreshManager';
import { logger } from '@/lib/logger';

export type AccountType = 'card_vendor' | 'payment_provider';

export type SourceType =
  | 'order'
  | 'order_adjustment'
  | 'withdrawal'
  | 'withdrawal_adjustment'
  | 'recharge'
  | 'recharge_adjustment'
  | 'gift'
  | 'gift_adjustment'
  | 'initial_balance'
  | 'initial_balance_adjustment'
  | 'reversal'
  | 'op_log_restore'
  | 'reconciliation'
  | 'withdrawal_restore'
  | 'recharge_restore'
  | 'post_reset_adjustment';

export interface LedgerTransaction {
  id: string;
  account_id: string;
  account_type: AccountType;
  source_type: SourceType;
  source_id: string | null;
  amount: number;
  before_balance: number;
  after_balance: number;
  is_active: boolean;
  reversal_of: string | null;
  batch_id: string | null;
  note: string | null;
  operator_id: string | null;
  operator_name: string | null;
  created_at: string;
}

export interface CreateLedgerEntryParams {
  accountType: AccountType;
  accountId: string;
  sourceType: SourceType;
  sourceId?: string;
  amount: number;
  note?: string;
  operatorId?: string;
  operatorName?: string;
  reversalOf?: string;
  batchId?: string;
}

/**
 * Create a ledger entry using the atomic DB function
 */
export async function createLedgerEntry(params: CreateLedgerEntryParams): Promise<LedgerTransaction | null> {
  try {
    const result = (await financeApi.createEntry({
      account_type: params.accountType,
      account_id: params.accountId,
      source_type: params.sourceType,
      source_id: params.sourceId || null,
      amount: params.amount,
      note: params.note || null,
      operator_id: params.operatorId || null,
      operator_name: params.operatorName || null,
      reversal_of: params.reversalOf || null,
      batch_id: params.batchId || null,
    })) as unknown as LedgerTransaction;

    notifyDataMutation({ table: 'ledger_transactions', operation: 'INSERT', source: 'mutation' }).catch(logger.error);
    return result;
  } catch (error: any) {
    if (error?.status === 409 || error?.message?.includes('duplicate')) {
      logger.warn('[LedgerService] Duplicate entry skipped (idempotent):', params.sourceType, params.sourceId);
      return null;
    }
    logger.error('[LedgerService] Failed to create ledger entry:', error);
    return null;
  }
}

/**
 * Soft-delete a ledger entry
 */
export async function softDeleteLedgerEntry(params: {
  sourceType: SourceType;
  sourceId: string;
  accountType: AccountType;
  accountId: string;
  note?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<LedgerTransaction | null> {
  try {
    const result = (await financeApi.softDelete({
      source_type: params.sourceType,
      source_id: params.sourceId,
      account_type: params.accountType,
      account_id: params.accountId,
      note: params.note || null,
      operator_id: params.operatorId || null,
      operator_name: params.operatorName || null,
    })) as unknown as LedgerTransaction;

    notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'mutation' }).catch(logger.error);
    return result;
  } catch (error) {
    logger.error('[LedgerService] Failed to soft-delete ledger entry:', error);
    return null;
  }
}

/**
 * Create an adjustment entry for edits (补偿事务)
 */
export async function createAdjustmentEntry(params: {
  accountType: AccountType;
  accountId: string;
  sourceType: SourceType;
  sourceId: string;
  delta: number;
  note?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<LedgerTransaction | null> {
  if (Math.abs(params.delta) < 0.01) return null;

  return createLedgerEntry({
    accountType: params.accountType,
    accountId: params.accountId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    amount: params.delta,
    note: params.note,
    operatorId: params.operatorId,
    operatorName: params.operatorName,
  });
}

/**
 * 初始余额重置（批次化）：
 * - 服务端会在事务内将所有 active 分录软删，再写入新 initial_balance
 * - 返回含 batch_id 的分录
 */
export async function setInitialBalanceLedger(params: {
  accountType: AccountType;
  accountId: string;
  newBalance: number;
  previousBalance: number;
  batchId?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<LedgerTransaction | null> {
  const note = params.previousBalance !== 0
    ? `设置初始余额: ¥${params.previousBalance.toFixed(2)} → ¥${params.newBalance.toFixed(2)}`
    : `设置初始余额: ¥${params.newBalance.toFixed(2)}`;

  try {
    const result = (await financeApi.setInitialBalance({
      account_type: params.accountType,
      account_id: params.accountId,
      new_balance: params.newBalance,
      batch_id: params.batchId || null,
      note,
      operator_id: params.operatorId || null,
      operator_name: params.operatorName || null,
    })) as unknown as LedgerTransaction;

    notifyDataMutation({ table: 'ledger_transactions', operation: 'INSERT', source: 'mutation' }).catch(logger.error);
    return result;
  } catch (error) {
    logger.error('[LedgerService] Failed to set initial balance:', error);
    return null;
  }
}

/**
 * Get ledger transactions for an account (for UI display)
 */
export async function getLedgerTransactions(
  accountType: AccountType,
  accountId: string,
  options?: {
    sourceType?: SourceType;
    activeOnly?: boolean;
    limit?: number;
  }
): Promise<LedgerTransaction[]> {
  try {
    const q: Record<string, string> = {
      account_type: accountType,
      account_id: accountId,
    };
    if (options?.sourceType) q.source_type = options.sourceType;
    if (options?.activeOnly !== undefined) q.active_only = String(options.activeOnly);
    if (options?.limit) q.limit = String(options.limit);

    const data = await financeApi.getLedger(q);
    return (data || []) as unknown as LedgerTransaction[];
  } catch (error) {
    logger.error('[LedgerService] Failed to get transactions:', error);
    return [];
  }
}

/**
 * Get all ledger transactions (for export)
 */
export async function getAllLedgerTransactions(
  accountType?: AccountType,
  options?: {
    startDate?: string;
    endDate?: string;
  }
): Promise<LedgerTransaction[]> {
  try {
    const q: Record<string, string> = {};
    if (accountType) q.account_type = accountType;
    if (options?.startDate) q.start_date = options.startDate;
    if (options?.endDate) q.end_date = options.endDate;

    const data = await financeApi.getLedgerAll(q);
    return (data || []) as unknown as LedgerTransaction[];
  } catch (error) {
    logger.error('[LedgerService] Failed to get all transactions:', error);
    return [];
  }
}

/**
 * 获取 ledger 权威余额
 */
export async function getLedgerBalance(
  accountType: AccountType,
  accountId: string,
): Promise<number> {
  try {
    const result = await financeApi.getBalance(accountType, accountId);
    return result?.balance ?? 0;
  } catch (error) {
    logger.error('[LedgerService] Failed to get ledger balance:', error);
    return 0;
  }
}

/** 服务端按时间链重算 before_balance / balance_after（与 SUM(amount) 对齐） */
export async function recalculateLedgerRunningBalances(params: {
  accountType: AccountType;
  accountId: string;
}): Promise<boolean> {
  try {
    await financeApi.recalculateRunningBalances({
      account_type: params.accountType,
      account_id: params.accountId,
    });
    notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'mutation' }).catch(logger.error);
    return true;
  } catch (error) {
    logger.error('[LedgerService] recalculateLedgerRunningBalances failed:', error);
    return false;
  }
}

/**
 * 真对账：将 ledger SUM 与 derived 公式余额比较
 */
export async function reconcileAccount(
  accountType: AccountType,
  accountId: string,
  derivedBalance?: number,
): Promise<{
  computedBalance: number;
  storedBalance: number;
  discrepancy: number;
  needsCorrection: boolean;
  transactionCount: number;
  initialBalance: number;
  activeSum: number;
} | null> {
  try {
    const result = (await financeApi.reconcile({
      account_type: accountType,
      account_id: accountId,
      derived_balance: derivedBalance ?? null,
    })) as unknown as {
      computedBalance: number;
      storedBalance: number;
      discrepancy: number;
      needsCorrection: boolean;
      transactionCount: number;
      initialBalance: number;
      activeSum: number;
    };

    return result;
  } catch (error) {
    logger.error('[LedgerService] Reconciliation failed:', error);
    return null;
  }
}

/**
 * 自动对账并修正：若 ledger 与 derived 不一致，自动插入 reconciliation 分录
 */
export async function reconcileAndCorrect(params: {
  accountType: AccountType;
  accountId: string;
  derivedBalance: number;
  operatorId?: string;
  operatorName?: string;
}): Promise<{ computedBalance: number; corrected: boolean; correctionAmount: number }> {
  try {
    const result = (await financeApi.reconcileAndCorrect({
      account_type: params.accountType,
      account_id: params.accountId,
      derived_balance: params.derivedBalance,
      operator_id: params.operatorId || null,
      operator_name: params.operatorName || null,
    })) as unknown as { computedBalance: number; corrected: boolean; correctionAmount: number };
    if (result?.corrected) {
      notifyDataMutation({ table: 'ledger_transactions', operation: 'INSERT', source: 'mutation' }).catch(logger.error);
    }
    return result ?? { computedBalance: 0, corrected: false, correctionAmount: 0 };
  } catch (error) {
    logger.error('[LedgerService] reconcileAndCorrect failed:', error);
    return { computedBalance: 0, corrected: false, correctionAmount: 0 };
  }
}

/**
 * Create a correction transaction to fix discrepancies
 */
export async function createCorrectionEntry(params: {
  accountType: AccountType;
  accountId: string;
  correctionAmount: number;
  operatorId?: string;
  operatorName?: string;
}): Promise<LedgerTransaction | null> {
  return createLedgerEntry({
    accountType: params.accountType,
    accountId: params.accountId,
    sourceType: 'reconciliation',
    sourceId: `recon_${Date.now()}`,
    amount: params.correctionAmount,
    note: `对账修正: ¥${params.correctionAmount.toFixed(2)}`,
    operatorId: params.operatorId,
    operatorName: params.operatorName,
  });
}

/**
 * Delete all ledger transactions for a merchant (admin only)
 */
export async function deleteLedgerTransactions(
  accountType: AccountType,
  accountId: string
): Promise<boolean> {
  try {
    await financeApi.deleteAccount({
      account_type: accountType,
      account_id: accountId,
    });
    notifyDataMutation({ table: 'ledger_transactions', operation: 'DELETE', source: 'mutation' }).catch(logger.error);
    return true;
  } catch (error) {
    logger.error('[LedgerService] Failed to delete transactions:', error);
    return false;
  }
}

/**
 * Source type labels (bilingual)
 */
export const sourceTypeLabels: Record<SourceType, { zh: string; en: string }> = {
  order: { zh: '订单', en: 'Order' },
  order_adjustment: { zh: '订单调整', en: 'Order Adjustment' },
  withdrawal: { zh: '提款', en: 'Withdrawal' },
  withdrawal_adjustment: { zh: '提款调整', en: 'Withdrawal Adjustment' },
  withdrawal_restore: { zh: '提款恢复', en: 'Withdrawal Restore' },
  recharge: { zh: '充值', en: 'Recharge' },
  recharge_adjustment: { zh: '充值调整', en: 'Recharge Adjustment' },
  recharge_restore: { zh: '充值恢复', en: 'Recharge Restore' },
  gift: { zh: '赠送', en: 'Gift' },
  gift_adjustment: { zh: '赠送调整', en: 'Gift Adjustment' },
  initial_balance: { zh: '初始余额', en: 'Initial Balance' },
  initial_balance_adjustment: { zh: '余额调整', en: 'Balance Adjustment' },
  reversal: { zh: '撤销', en: 'Reversal' },
  op_log_restore: { zh: '恢复', en: 'Restore' },
  reconciliation: { zh: '对账修正', en: 'Reconciliation' },
  post_reset_adjustment: { zh: '重置后调整', en: 'Post-reset Adjustment' },
};

export function getSourceTypeLabel(sourceType: SourceType, lang: 'zh' | 'en' = 'zh'): string {
  const labels = sourceTypeLabels[sourceType];
  return labels ? labels[lang] : sourceType;
}

/**
 * Format raw source_id into human-readable text
 */
export function formatSourceId(sourceId: string | null, lang: 'zh' | 'en' = 'zh'): string {
  if (!sourceId) return '-';

  const patterns: Array<{ regex: RegExp; zh: string; en: string }> = [
    { regex: /^order_v_/, zh: '卡商订单', en: 'Vendor Order' },
    { regex: /^order_p_/, zh: '代付订单', en: 'Provider Order' },
    { regex: /^adj_v_/, zh: '卡商订单调整', en: 'Vendor Adj.' },
    { regex: /^adj_p_/, zh: '代付订单调整', en: 'Provider Adj.' },
    { regex: /^gift_/, zh: '赠送扣款', en: 'Gift Deduction' },
    { regex: /^gadj_/, zh: '赠送调整', en: 'Gift Adj.' },
    { regex: /^rev_order_v_/, zh: '撤销(卡商)', en: 'Rev. Vendor' },
    { regex: /^rev_order_p_/, zh: '撤销(代付)', en: 'Rev. Provider' },
    { regex: /^rev_gift_/, zh: '撤销(赠送)', en: 'Rev. Gift' },
    { regex: /^rev_/, zh: '撤销', en: 'Reversal' },
    { regex: /^grestore_/, zh: '赠送恢复', en: 'Gift Restore' },
    { regex: /^restore_v_/, zh: '订单恢复(卡商)', en: 'Restore Vendor' },
    { regex: /^restore_p_/, zh: '订单恢复(代付)', en: 'Restore Provider' },
    { regex: /^ib_/, zh: '初始余额', en: 'Init. Balance' },
    { regex: /^recon_/, zh: '对账修正', en: 'Reconciliation' },
    { regex: /^pra_/, zh: '重置后调整', en: 'Post-reset Adj.' },
    { regex: /^wdrestore_/, zh: '提款恢复', en: 'Withdrawal Restore' },
    { regex: /^rcrestore_/, zh: '充值恢复', en: 'Recharge Restore' },
    { regex: /^wd_/, zh: '提款', en: 'Withdrawal' },
    { regex: /^wdadj_/, zh: '提款调整', en: 'Withdrawal Adj.' },
    { regex: /^wadj_/, zh: '提款调整', en: 'Withdrawal Adj.' },
    { regex: /^rc_/, zh: '充值', en: 'Recharge' },
    { regex: /^rcadj_/, zh: '充值调整', en: 'Recharge Adj.' },
    { regex: /^radj_/, zh: '充值调整', en: 'Recharge Adj.' },
  ];

  for (const p of patterns) {
    if (p.regex.test(sourceId)) {
      return lang === 'zh' ? p.zh : p.en;
    }
  }

  return sourceId.length > 15 ? sourceId.substring(0, 12) + '...' : sourceId;
}

/**
 * Reverse ALL ledger entries for a source (original + all adjustments + restores)
 */
export async function reverseAllEntriesForSource(params: {
  accountType: AccountType;
  accountId: string;
  orderId: string;
  sourcePrefix: string;
  adjPrefix: string;
  note?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<{ matchCount: number; recalculated: boolean } | null> {
  try {
    const raw = await financeApi.reverseAll({
      account_type: params.accountType,
      account_id: params.accountId,
      order_id: params.orderId,
      source_prefix: params.sourcePrefix,
      adj_prefix: params.adjPrefix,
      note: params.note || null,
      operator_id: params.operatorId || null,
      operator_name: params.operatorName || null,
    });
    const result = (raw != null && typeof raw === 'object')
      ? raw as { matchCount: number; recalculated: boolean }
      : { matchCount: 0, recalculated: false };

    notifyDataMutation({ table: 'ledger_transactions', operation: 'INSERT', source: 'mutation' }).catch(logger.error);
    return result;
  } catch (error) {
    logger.error('[LedgerService] Failed to reverse all entries:', error);
    return null;
  }
}

/**
 * Reverse the latest initial_balance entry (batch-aware on server)
 */
export async function reverseInitialBalanceEntry(params: {
  accountType: AccountType;
  accountId: string;
  note?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<LedgerTransaction | null> {
  try {
    const result = (await financeApi.reverseInitialBalance({
      account_type: params.accountType,
      account_id: params.accountId,
      note: params.note || null,
      operator_id: params.operatorId || null,
      operator_name: params.operatorName || null,
    })) as unknown as LedgerTransaction;

    return result;
  } catch (error) {
    logger.error('[LedgerService] Failed to reverse initial balance entry:', error);
    return null;
  }
}
