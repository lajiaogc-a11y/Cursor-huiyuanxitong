/**
 * Ledger Transaction Service
 * Event-sourcing ledger for merchant balances
 * Uses the ledger_transactions table as the single source of truth
 */

import { supabase } from '@/integrations/supabase/client';

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
  | 'recharge_restore';

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
}

/**
 * Create a ledger entry using the atomic DB function
 * This ensures balance chain consistency via DB-level locking
 */
export async function createLedgerEntry(params: CreateLedgerEntryParams): Promise<LedgerTransaction | null> {
  const { data, error } = await supabase.rpc('create_ledger_entry', {
    p_account_type: params.accountType,
    p_account_id: params.accountId,
    p_source_type: params.sourceType,
    p_source_id: params.sourceId || null,
    p_amount: params.amount,
    p_note: params.note || null,
    p_operator_id: params.operatorId || null,
    p_operator_name: params.operatorName || null,
    p_reversal_of: params.reversalOf || null,
  });

  if (error) {
    // If unique constraint violation (duplicate), log warning and skip
    if (error.code === '23505') {
      console.warn('[LedgerService] Duplicate entry skipped (idempotent):', params.sourceType, params.sourceId);
      return null;
    }
    console.error('[LedgerService] Failed to create ledger entry:', error);
    return null;
  }

  // Emit event for UI refresh
  window.dispatchEvent(new CustomEvent('ledger-updated'));
  return data as LedgerTransaction;
}

/**
 * Soft-delete a ledger entry and create a reversal
 * Used when source entities are deleted/cancelled
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
  const { data, error } = await supabase.rpc('soft_delete_ledger_entry', {
    p_source_type: params.sourceType,
    p_source_id: params.sourceId,
    p_account_type: params.accountType,
    p_account_id: params.accountId,
    p_note: params.note || null,
    p_operator_id: params.operatorId || null,
    p_operator_name: params.operatorName || null,
  });

  if (error) {
    console.error('[LedgerService] Failed to soft-delete ledger entry:', error);
    return null;
  }

  window.dispatchEvent(new CustomEvent('ledger-updated'));
  return data as LedgerTransaction;
}

/**
 * Create an adjustment entry for order/withdrawal/recharge edits
 * This creates a NEW adjustment row referencing the same source_id, not mutating history
 */
export async function createAdjustmentEntry(params: {
  accountType: AccountType;
  accountId: string;
  sourceType: SourceType; // e.g. 'order_adjustment', 'withdrawal_adjustment'
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
 * Handle initial balance setting
 * Creates an initial_balance entry or initial_balance_adjustment if one already exists
 */
export async function setInitialBalanceLedger(params: {
  accountType: AccountType;
  accountId: string;
  newBalance: number;
  previousBalance: number;
  operatorId?: string;
  operatorName?: string;
}): Promise<LedgerTransaction | null> {
  const note = params.previousBalance !== 0
    ? `设置初始余额: ¥${params.previousBalance.toFixed(2)} → ¥${params.newBalance.toFixed(2)}`
    : `设置初始余额: ¥${params.newBalance.toFixed(2)}`;

  // Use atomic DB function that sets after_balance = newBalance directly
  const { data, error } = await supabase.rpc('set_initial_balance_entry', {
    p_account_type: params.accountType,
    p_account_id: params.accountId,
    p_new_balance: params.newBalance,
    p_note: note,
    p_operator_id: params.operatorId || null,
    p_operator_name: params.operatorName || null,
  });

  if (error) {
    console.error('[LedgerService] Failed to set initial balance:', error);
    return null;
  }

  window.dispatchEvent(new CustomEvent('ledger-updated'));
  return data as LedgerTransaction;
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
  let query = supabase
    .from('ledger_transactions')
    .select('*')
    .eq('account_type', accountType)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (options?.sourceType) {
    query = query.eq('source_type', options.sourceType);
  }
  if (options?.activeOnly !== false) {
    // Default to showing all (including inactive for audit trail)
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[LedgerService] Failed to get transactions:', error);
    return [];
  }

  return (data || []) as LedgerTransaction[];
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
  let query = supabase
    .from('ledger_transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (accountType) {
    query = query.eq('account_type', accountType);
  }
  if (options?.startDate) {
    query = query.gte('created_at', options.startDate);
  }
  if (options?.endDate) {
    query = query.lte('created_at', options.endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[LedgerService] Failed to get all transactions:', error);
    return [];
  }

  return (data || []) as LedgerTransaction[];
}

/**
 * Reconcile: recompute balance from ledger and compare with stored balance
 */
export async function reconcileAccount(
  accountType: AccountType,
  accountId: string
): Promise<{
  computedBalance: number;
  storedBalance: number;
  discrepancy: number;
  transactionCount: number;
  initialBalance: number;
  activeSum: number;
} | null> {
  const { data, error } = await supabase.rpc('recompute_account_balance', {
    p_account_type: accountType,
    p_account_id: accountId,
  });

  if (error) {
    console.error('[LedgerService] Reconciliation failed:', error);
    return null;
  }

  const result = data as any;
  if (!result || result.length === 0) return null;

  const row = Array.isArray(result) ? result[0] : result;

  // Get stored balance (last after_balance from active entries)
  const { data: lastEntry } = await supabase
    .from('ledger_transactions')
    .select('after_balance')
    .eq('account_type', accountType)
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const storedBalance = lastEntry?.after_balance ?? 0;
  const computedBalance = row.computed_balance ?? 0;

  return {
    computedBalance,
    storedBalance,
    discrepancy: Math.abs(computedBalance - storedBalance),
    transactionCount: row.transaction_count ?? 0,
    initialBalance: row.initial_balance ?? 0,
    activeSum: row.active_sum ?? 0,
  };
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
  const { error } = await supabase
    .from('ledger_transactions')
    .delete()
    .eq('account_type', accountType)
    .eq('account_id', accountId);

  if (error) {
    console.error('[LedgerService] Failed to delete transactions:', error);
    return false;
  }

  return true;
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
};

export function getSourceTypeLabel(sourceType: SourceType, lang: 'zh' | 'en' = 'zh'): string {
  const labels = sourceTypeLabels[sourceType];
  return labels ? labels[lang] : sourceType;
}

/**
 * Format raw source_id into human-readable text
 * e.g. "order_v_abc123" → "卡商订单" / "Vendor Order"
 *      "gift_abc123" → "赠送" / "Gift"
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
    { regex: /^wdrestore_/, zh: '提款恢复', en: 'Withdrawal Restore' },
    { regex: /^rcrestore_/, zh: '充值恢复', en: 'Recharge Restore' },
    { regex: /^wd_/, zh: '提款', en: 'Withdrawal' },
    { regex: /^wdadj_/, zh: '提款调整', en: 'Withdrawal Adj.' },
    { regex: /^rc_/, zh: '充值', en: 'Recharge' },
    { regex: /^rcadj_/, zh: '充值调整', en: 'Recharge Adj.' },
  ];

  for (const p of patterns) {
    if (p.regex.test(sourceId)) {
      return lang === 'zh' ? p.zh : p.en;
    }
  }

  return sourceId.length > 15 ? sourceId.substring(0, 12) + '...' : sourceId;
}

/**
 * Reverse ALL ledger entries for an order/gift (original + all adjustments)
 * Uses the atomic DB function to ensure complete financial rollback
 */
export async function reverseAllEntriesForSource(params: {
  accountType: AccountType;
  accountId: string;
  orderId: string;
  sourcePrefix: string;  // e.g. 'order_v_' or 'order_p_'
  adjPrefix: string;     // e.g. 'adj_v_' or 'adj_p_'
  note?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<LedgerTransaction | null> {
  const { data, error } = await supabase.rpc('reverse_all_entries_for_order', {
    p_account_type: params.accountType,
    p_account_id: params.accountId,
    p_order_id: params.orderId,
    p_source_prefix: params.sourcePrefix,
    p_adj_prefix: params.adjPrefix,
    p_note: params.note || null,
    p_operator_id: params.operatorId || null,
    p_operator_name: params.operatorName || null,
  });

  if (error) {
    console.error('[LedgerService] Failed to reverse all entries:', error);
    return null;
  }

  window.dispatchEvent(new CustomEvent('ledger-updated'));
  return data as LedgerTransaction;
}

/**
 * Reverse the latest active initial_balance ledger entry for an account.
 * Instead of creating a new initial_balance entry (which sets after_balance directly),
 * this finds the latest initial_balance entry, deactivates it, and creates a reversal
 * entry that undoes exactly the amount that entry changed.
 */
export async function reverseInitialBalanceEntry(params: {
  accountType: AccountType;
  accountId: string;
  note?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<LedgerTransaction | null> {
  // Find the latest active initial_balance entry for this account
  const { data: entries, error: fetchError } = await supabase
    .from('ledger_transactions')
    .select('*')
    .eq('account_type', params.accountType)
    .eq('account_id', params.accountId)
    .eq('source_type', 'initial_balance')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (fetchError || !entries || entries.length === 0) {
    console.error('[LedgerService] No active initial_balance entry found to reverse:', fetchError);
    return null;
  }

  const targetEntry = entries[0];
  const reversalAmount = -targetEntry.amount; // Reverse the exact amount

  // Create reversal entry FIRST, only deactivate original if reversal succeeds
  const result = await createLedgerEntry({
    accountType: params.accountType,
    accountId: params.accountId,
    sourceType: 'initial_balance_adjustment',
    sourceId: `ib_rev_${targetEntry.id}`,
    amount: reversalAmount,
    note: params.note || `撤销初始余额: ¥${targetEntry.amount.toFixed(2)}`,
    operatorId: params.operatorId,
    operatorName: params.operatorName,
    reversalOf: targetEntry.id,
  });

  // Only deactivate original entry if reversal succeeded
  if (result) {
    await supabase
      .from('ledger_transactions')
      .update({ is_active: false })
      .eq('id', targetEntry.id);
  }

  return result;
}
