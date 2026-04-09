/**
 * Finance / Ledger shared types
 */

export type LedgerAccountType = 'card_vendor' | 'payment_provider';

export interface LedgerTransaction {
  id: string;
  account_type: LedgerAccountType;
  account_name: string;
  source_prefix: string;
  order_id: string;
  amount: number;
  running_balance: number;
  note: string | null;
  created_at: string;
  is_deleted?: number;
}

export interface LedgerBalanceResult {
  balance: number;
}

export interface ReconcileResult {
  success: boolean;
  computedBalance: number;
  derivedBalance: number;
  discrepancy: number;
  corrected?: boolean;
}

export interface ReconcileAndCorrectResult extends ReconcileResult {
  corrected: boolean;
  correctionEntryId?: string;
}
