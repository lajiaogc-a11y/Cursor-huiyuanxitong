/**
 * Finance / Ledger API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost, apiDelete } from './client';
import type { LedgerTransaction, LedgerBalanceResult, ReconcileResult, ReconcileAndCorrectResult } from '@/types/finance';

export const financeApi = {
  getLedger: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiGet<LedgerTransaction[]>(`/api/finance/ledger?${q}`);
  },
  getLedgerAll: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiGet<LedgerTransaction[]>(`/api/finance/ledger/all?${q}`);
  },
  getBalance: (accountType: string, accountId: string) =>
    apiGet<LedgerBalanceResult>(`/api/finance/ledger/balance?account_type=${encodeURIComponent(accountType)}&account_id=${encodeURIComponent(accountId)}`),
  createEntry: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/finance/ledger', data),
  reconcile: (data: Record<string, unknown>) =>
    apiPost<ReconcileResult>('/api/finance/ledger/reconcile', data),
  reconcileAndCorrect: (data: Record<string, unknown>) =>
    apiPost<ReconcileAndCorrectResult>('/api/finance/ledger/reconcile-and-correct', data),
  softDelete: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/finance/ledger/soft-delete', data),
  setInitialBalance: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/finance/ledger/initial-balance', data),
  reverseInitialBalance: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/finance/ledger/reverse-initial-balance', data),
  reverseAll: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/finance/ledger/reverse-all', data),
  recalculateRunningBalances: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/finance/ledger/recalculate-running-balances', data),
  deleteAccount: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return apiDelete<{ success: boolean }>(`/api/finance/ledger?${q}`);
  },
  fetchUsdtRates: (body: Record<string, unknown>) =>
    apiPost<unknown>('/api/data/fetch-usdt-rates', body),
  syncCardTypes: (types: string[]) =>
    apiPost<unknown>('/api/data/rpc/sync_card_types', { types }),
};
