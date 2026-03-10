// Merchant Settlement Store - 商家结算数据管理
// 使用 shared_data_store 作为唯一数据源

import { logOperation } from './auditLogStore';
import { loadSharedData, saveSharedData } from '@/services/sharedDataService';
import { createLedgerEntry, createAdjustmentEntry, softDeleteLedgerEntry, setInitialBalanceLedger, reverseAllEntriesForSource, reverseInitialBalanceEntry } from '@/services/ledgerTransactionService';

// 获取当前用户信息的辅助函数
let currentOperatorId: string | null = null;
let currentOperatorName: string | null = null;

export function setCurrentOperator(operatorId: string | null, operatorName: string | null) {
  currentOperatorId = operatorId;
  currentOperatorName = operatorName;
}

// ==================== Types ====================

export interface WithdrawalRecord {
  id: string;
  withdrawalAmountUsdt: number;
  usdtRate: number;
  settlementTotal: number;
  remark?: string;
  createdAt: string;
  vendorName?: string;
  recorderId?: string;
}

export interface RechargeRecord {
  id: string;
  rechargeAmountUsdt: number;
  usdtRate: number;
  settlementTotal: number;
  remark?: string;
  createdAt: string;
  providerName?: string;
  recorderId?: string;
}

interface HistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  previousState: any;
  description: string;
  operatorId?: string | null;
}

export interface ArchivedWithdrawals {
  resetTime: string;
  records: WithdrawalRecord[];
}

export interface ArchivedRecharges {
  resetTime: string;
  records: RechargeRecord[];
}

export interface CardMerchantSettlement {
  id: string;
  vendorName: string;
  initialBalance: number;
  lastResetTime: string | null;
  postResetAdjustment?: number;
  withdrawals: WithdrawalRecord[];
  archivedWithdrawals?: ArchivedWithdrawals[];
  history: HistoryEntry[];
}

export interface PaymentProviderSettlement {
  id: string;
  providerName: string;
  initialBalance: number;
  lastResetTime: string | null;
  postResetAdjustment?: number;
  recharges: RechargeRecord[];
  archivedRecharges?: ArchivedRecharges[];
  history: HistoryEntry[];
}

export type MerchantType = 'card_vendor' | 'payment_provider';

// ==================== Cache ====================

let cardSettlementsCache: CardMerchantSettlement[] = [];
let providerSettlementsCache: PaymentProviderSettlement[] = [];
let cacheInitialized = false;

async function initializeSettlementCacheInternal(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const [cardData, providerData] = await Promise.all([
      loadSharedData('cardMerchantSettlements'),
      loadSharedData('paymentProviderSettlements'),
    ]);
    
    cardSettlementsCache = (cardData as CardMerchantSettlement[]) || [];
    providerSettlementsCache = (providerData as PaymentProviderSettlement[]) || [];
    cacheInitialized = true;
  } catch (error) {
    console.error('[MerchantSettlement] Cache initialization failed:', error);
  }
}

export async function initializeSettlementCache(): Promise<void> {
  await initializeSettlementCacheInternal();
}

export async function forceRefreshSettlementCache(): Promise<void> {
  cacheInitialized = false;
  // Clear shared data cache to force DB read (prevent stale cache from Realtime)
  const { clearSharedCacheKey } = await import('@/services/sharedDataService');
  clearSharedCacheKey('cardMerchantSettlements');
  clearSharedCacheKey('paymentProviderSettlements');
  await initializeSettlementCacheInternal();
}

// ==================== Card Merchant Settlement ====================

export function getCardMerchantSettlements(): CardMerchantSettlement[] {
  return cardSettlementsCache;
}

export async function getCardMerchantSettlementsAsync(): Promise<CardMerchantSettlement[]> {
  await initializeSettlementCache();
  return cardSettlementsCache;
}

async function saveCardMerchantSettlements(settlements: CardMerchantSettlement[]): Promise<void> {
  // Deep clone to prevent shared reference corruption between cache and in-memory modifications
  const cloned = JSON.parse(JSON.stringify(settlements));
  cardSettlementsCache = cloned;
  await saveSharedData('cardMerchantSettlements', cloned);
}

export function getOrCreateVendorSettlement(vendorName: string): CardMerchantSettlement {
  const settlements = getCardMerchantSettlements();
  let settlement = settlements.find(s => s.vendorName === vendorName);
  
  if (!settlement) {
    settlement = {
      id: `SETTLE_${Date.now()}`,
      vendorName,
      initialBalance: 0,
      lastResetTime: null,
      withdrawals: [],
      history: [],
    };
    settlements.push(settlement);
    saveCardMerchantSettlements(settlements);
  }
  
  return settlement;
}

export async function setInitialBalance(vendorName: string, amount: number, currentRealTimeBalance?: number): Promise<CardMerchantSettlement> {
  const settlements = getCardMerchantSettlements();
  let settlement = settlements.find(s => s.vendorName === vendorName);
  const beforeData = settlement ? { ...settlement } : null;
  const previousBalance = currentRealTimeBalance ?? settlement?.initialBalance ?? 0;
  
  if (!settlement) {
    settlement = {
      id: `SETTLE_${Date.now()}`,
      vendorName,
      initialBalance: 0,
      lastResetTime: null,
      withdrawals: [],
      history: [],
    };
    settlements.push(settlement);
  }
  
  settlement.history.push({
    id: `HIST_${Date.now()}`,
    timestamp: new Date().toLocaleString(),
    action: 'initial_balance',
    previousState: {
      initialBalance: settlement.initialBalance,
      lastResetTime: settlement.lastResetTime,
      postResetAdjustment: settlement.postResetAdjustment ?? 0,
      withdrawals: [...settlement.withdrawals],
    },
    description: `设置初始余额: ${amount}`,
    operatorId: currentOperatorId,
  });
  
  settlement.initialBalance = amount;
  settlement.lastResetTime = new Date().toLocaleString();
  settlement.postResetAdjustment = 0;
  
  // Archive current withdrawals before clearing
  if (settlement.withdrawals.length > 0) {
    if (!settlement.archivedWithdrawals) settlement.archivedWithdrawals = [];
    settlement.archivedWithdrawals.push({
      resetTime: new Date().toLocaleString(),
      records: JSON.parse(JSON.stringify(settlement.withdrawals)),
    });
  }
  settlement.withdrawals = [];
  
  await saveCardMerchantSettlements(settlements);
  logOperation('merchant_settlement', 'update', vendorName, beforeData, settlement, `设置卡商初始余额: ${vendorName} = ${amount}`);
  
  await setInitialBalanceLedger({
    accountType: 'card_vendor',
    accountId: vendorName,
    newBalance: amount,
    previousBalance,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  return settlement;
}

export async function addWithdrawal(
  vendorName: string,
  withdrawalAmountUsdt: number,
  usdtRate: number,
  remark?: string,
  currentBalance?: number
): Promise<WithdrawalRecord> {
  const settlements = getCardMerchantSettlements();
  let settlementIndex = settlements.findIndex(s => s.vendorName === vendorName);
  
  if (settlementIndex === -1) {
    settlements.push({
      id: `SETTLE_${Date.now()}`,
      vendorName,
      initialBalance: 0,
      lastResetTime: null,
      withdrawals: [],
      history: [],
    });
    settlementIndex = settlements.length - 1;
  }
  
  const record: WithdrawalRecord = {
    id: `WD_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    withdrawalAmountUsdt,
    usdtRate,
    settlementTotal: withdrawalAmountUsdt * usdtRate,
    remark: remark || '',
    createdAt: new Date().toLocaleString(),
    recorderId: currentOperatorId || undefined,
  };
  
  settlements[settlementIndex].history.push({
    id: `HIST_${Date.now()}`,
    timestamp: new Date().toLocaleString(),
    action: 'withdrawal',
    previousState: {
      withdrawals: [...settlements[settlementIndex].withdrawals],
    },
    description: `录入提款: ${withdrawalAmountUsdt} USDT × ${usdtRate} = ${record.settlementTotal}`,
    operatorId: currentOperatorId,
  });
  settlements[settlementIndex].withdrawals.push(record);
  
  await saveCardMerchantSettlements(settlements);
  logOperation('merchant_settlement', 'create', record.id, null, record, `录入卡商提款: ${vendorName} - ${record.settlementTotal}`);
  
  const changeAmount = -record.settlementTotal;
  await createLedgerEntry({
    accountType: 'card_vendor',
    accountId: vendorName,
    sourceType: 'withdrawal',
    sourceId: `wd_${record.id}`,
    amount: changeAmount,
    note: `提款: ${withdrawalAmountUsdt} USDT × ${usdtRate} = ¥${record.settlementTotal}`,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  return record;
}

export async function undoLastAction(vendorName: string, currentBalance?: number, operatorId?: string): Promise<{ success: boolean; error?: string; description?: string }> {
  const settlements = getCardMerchantSettlements();
  const settlementIndex = settlements.findIndex(s => s.vendorName === vendorName);
  
  if (settlementIndex === -1) return { success: false, error: '未找到结算数据' };
  
  const settlement = settlements[settlementIndex];
  if (settlement.history.length === 0) return { success: false, error: '没有可撤回的操作' };
  
  const lastAction = settlement.history[settlement.history.length - 1];
  
  // Issue 3: Undo button only for initial balance
  if (lastAction.action !== 'initial_balance') {
    return { success: false, error: '撤回功能仅支持初始余额操作' };
  }
  
  // Issue 2: Ownership check - only allow undoing own data
  if (operatorId && lastAction.operatorId && lastAction.operatorId !== operatorId) {
    return { success: false, error: '最新数据不是你录入的，无法撤回' };
  }
  
  // Pop after checks pass
  settlement.history.pop();

  const beforeState = JSON.parse(JSON.stringify(settlement));
  
  if (lastAction.previousState.initialBalance !== undefined) {
    settlement.initialBalance = lastAction.previousState.initialBalance;
  }
  if (lastAction.previousState.lastResetTime !== undefined) {
    settlement.lastResetTime = lastAction.previousState.lastResetTime;
  }
  if (lastAction.previousState.withdrawals !== undefined) {
    settlement.withdrawals = lastAction.previousState.withdrawals;
  }
  if (lastAction.previousState.postResetAdjustment !== undefined) {
    settlement.postResetAdjustment = lastAction.previousState.postResetAdjustment;
  }
  
  await saveCardMerchantSettlements(settlements);
  
  logOperation('merchant_settlement', 'update', vendorName, 
    beforeState, settlement, 
    `撤回卡商操作: ${vendorName} - ${lastAction.description}`);
  
  // Ledger reversal: reverse the specific initial_balance entry (undo exact delta)
  await reverseInitialBalanceEntry({
    accountType: 'card_vendor',
    accountId: vendorName,
    note: `撤销卡商初始余额: ${lastAction.description}`,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  window.dispatchEvent(new CustomEvent('ledger-updated'));
  
  return { success: true, description: lastAction.description };
}

export function getWithdrawalsForVendor(vendorName: string): WithdrawalRecord[] {
  const settlements = getCardMerchantSettlements();
  const settlement = settlements.find(s => s.vendorName === vendorName);
  return settlement?.withdrawals || [];
}

export function calculateWithdrawalTotal(vendorName: string): number {
  const withdrawals = getWithdrawalsForVendor(vendorName);
  return withdrawals.reduce((sum, w) => sum + w.settlementTotal, 0);
}

// ==================== Payment Provider Settlement ====================

export function getPaymentProviderSettlements(): PaymentProviderSettlement[] {
  return providerSettlementsCache;
}

export async function getPaymentProviderSettlementsAsync(): Promise<PaymentProviderSettlement[]> {
  await initializeSettlementCache();
  return providerSettlementsCache;
}

export async function savePaymentProviderSettlements(settlements: PaymentProviderSettlement[]): Promise<void> {
  // Deep clone to prevent shared reference corruption between cache and in-memory modifications
  const cloned = JSON.parse(JSON.stringify(settlements));
  providerSettlementsCache = cloned;
  await saveSharedData('paymentProviderSettlements', cloned);
}

export function getOrCreateProviderSettlement(providerName: string): PaymentProviderSettlement {
  const settlements = getPaymentProviderSettlements();
  let settlement = settlements.find(s => s.providerName === providerName);
  
  if (!settlement) {
    settlement = {
      id: `PSETTLE_${Date.now()}`,
      providerName,
      initialBalance: 0,
      lastResetTime: null,
      recharges: [],
      history: [],
    };
    settlements.push(settlement);
    savePaymentProviderSettlements(settlements);
  }
  
  return settlement;
}

export async function setProviderInitialBalance(providerName: string, amount: number, currentRealTimeBalance?: number): Promise<PaymentProviderSettlement> {
  const settlements = getPaymentProviderSettlements();
  let settlement = settlements.find(s => s.providerName === providerName);
  const beforeData = settlement ? { ...settlement } : null;
  const previousBalance = currentRealTimeBalance ?? settlement?.initialBalance ?? 0;
  
  if (!settlement) {
    settlement = {
      id: `PSETTLE_${Date.now()}`,
      providerName,
      initialBalance: 0,
      lastResetTime: null,
      recharges: [],
      history: [],
    };
    settlements.push(settlement);
  }
  
  settlement.history.push({
    id: `HIST_${Date.now()}`,
    timestamp: new Date().toLocaleString(),
    action: 'initial_balance',
    previousState: {
      initialBalance: settlement.initialBalance,
      lastResetTime: settlement.lastResetTime,
      postResetAdjustment: settlement.postResetAdjustment ?? 0,
      recharges: [...settlement.recharges],
    },
    description: `设置初始余额: ${amount}`,
    operatorId: currentOperatorId,
  });
  
  settlement.initialBalance = amount;
  settlement.lastResetTime = new Date().toLocaleString();
  settlement.postResetAdjustment = 0;
  
  // Archive current recharges before clearing
  if (settlement.recharges.length > 0) {
    if (!settlement.archivedRecharges) settlement.archivedRecharges = [];
    settlement.archivedRecharges.push({
      resetTime: new Date().toLocaleString(),
      records: JSON.parse(JSON.stringify(settlement.recharges)),
    });
  }
  settlement.recharges = [];
  
  await savePaymentProviderSettlements(settlements);
  logOperation('merchant_settlement', 'update', providerName, beforeData, settlement, `设置代付商家初始余额: ${providerName} = ${amount}`);
  
  await setInitialBalanceLedger({
    accountType: 'payment_provider',
    accountId: providerName,
    newBalance: amount,
    previousBalance,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  return settlement;
}

export async function addRecharge(
  providerName: string,
  rechargeAmountUsdt: number,
  usdtRate: number,
  remark?: string,
  currentBalance?: number
): Promise<RechargeRecord> {
  const settlements = getPaymentProviderSettlements();
  let settlementIndex = settlements.findIndex(s => s.providerName === providerName);
  
  if (settlementIndex === -1) {
    settlements.push({
      id: `PSETTLE_${Date.now()}`,
      providerName,
      initialBalance: 0,
      lastResetTime: null,
      recharges: [],
      history: [],
    });
    settlementIndex = settlements.length - 1;
  }
  
  const record: RechargeRecord = {
    id: `RC_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    rechargeAmountUsdt,
    usdtRate,
    settlementTotal: rechargeAmountUsdt * usdtRate,
    remark: remark || '',
    createdAt: new Date().toLocaleString(),
    recorderId: currentOperatorId || undefined,
  };
  
  settlements[settlementIndex].history.push({
    id: `HIST_${Date.now()}`,
    timestamp: new Date().toLocaleString(),
    action: 'recharge',
    previousState: {
      recharges: [...settlements[settlementIndex].recharges],
    },
    description: `录入充值: ${rechargeAmountUsdt} USDT × ${usdtRate} = ${record.settlementTotal}`,
    operatorId: currentOperatorId,
  });
  settlements[settlementIndex].recharges.push(record);
  
  await savePaymentProviderSettlements(settlements);
  logOperation('merchant_settlement', 'create', record.id, null, record, `录入代付商家充值: ${providerName} - ${record.settlementTotal}`);
  
  const changeAmount = record.settlementTotal;
  const rechargeNote = remark || `充值: ${rechargeAmountUsdt} USDT × ${usdtRate} = ¥${record.settlementTotal}`;
  await createLedgerEntry({
    accountType: 'payment_provider',
    accountId: providerName,
    sourceType: 'recharge',
    sourceId: `rc_${record.id}`,
    amount: changeAmount,
    note: rechargeNote,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  return record;
}

export async function undoProviderLastAction(providerName: string, currentBalance?: number, operatorId?: string): Promise<{ success: boolean; error?: string; description?: string }> {
  const settlements = getPaymentProviderSettlements();
  const settlementIndex = settlements.findIndex(s => s.providerName === providerName);
  
  if (settlementIndex === -1) return { success: false, error: '未找到结算数据' };
  
  const settlement = settlements[settlementIndex];
  if (settlement.history.length === 0) return { success: false, error: '没有可撤回的操作' };
  
  const lastAction = settlement.history[settlement.history.length - 1];
  
  // Issue 3: Undo button only for initial balance
  if (lastAction.action !== 'initial_balance') {
    return { success: false, error: '撤回功能仅支持初始余额操作' };
  }
  
  // Issue 2: Ownership check - only allow undoing own data
  if (operatorId && lastAction.operatorId && lastAction.operatorId !== operatorId) {
    return { success: false, error: '最新数据不是你录入的，无法撤回' };
  }
  
  // Pop after checks pass
  settlement.history.pop();

  const beforeState = JSON.parse(JSON.stringify(settlement));
  
  if (lastAction.previousState.initialBalance !== undefined) {
    settlement.initialBalance = lastAction.previousState.initialBalance;
  }
  if (lastAction.previousState.lastResetTime !== undefined) {
    settlement.lastResetTime = lastAction.previousState.lastResetTime;
  }
  if (lastAction.previousState.recharges !== undefined) {
    settlement.recharges = lastAction.previousState.recharges;
  }
  if (lastAction.previousState.postResetAdjustment !== undefined) {
    settlement.postResetAdjustment = lastAction.previousState.postResetAdjustment;
  }
  
  await savePaymentProviderSettlements(settlements);
  
  logOperation('merchant_settlement', 'update', providerName, 
    beforeState, settlement, 
    `撤回代付商家操作: ${providerName} - ${lastAction.description}`);
  
  // Ledger reversal: reverse the specific initial_balance entry (undo exact delta)
  await reverseInitialBalanceEntry({
    accountType: 'payment_provider',
    accountId: providerName,
    note: `撤销代付商家初始余额: ${lastAction.description}`,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  window.dispatchEvent(new CustomEvent('ledger-updated'));
  
  return { success: true, description: lastAction.description };
}

export function getRechargesForProvider(providerName: string): RechargeRecord[] {
  const settlements = getPaymentProviderSettlements();
  const settlement = settlements.find(s => s.providerName === providerName);
  return settlement?.recharges || [];
}

export function calculateRechargeTotal(providerName: string): number {
  const recharges = getRechargesForProvider(providerName);
  return recharges.reduce((sum, r) => sum + r.settlementTotal, 0);
}

// ==================== Archive Getters ====================

export function getArchivedWithdrawalsForVendor(vendorName: string): ArchivedWithdrawals[] {
  const settlements = getCardMerchantSettlements();
  const settlement = settlements.find(s => s.vendorName === vendorName);
  return settlement?.archivedWithdrawals || [];
}

export function getArchivedRechargesForProvider(providerName: string): ArchivedRecharges[] {
  const settlements = getPaymentProviderSettlements();
  const settlement = settlements.find(s => s.providerName === providerName);
  return settlement?.archivedRecharges || [];
}

// ==================== Edit & Delete Operations ====================

// 修改提款记录
export async function updateWithdrawal(
  vendorName: string,
  withdrawalId: string,
  patch: { withdrawalAmountUsdt?: number; usdtRate?: number; remark?: string },
  currentBalance?: number
): Promise<boolean> {
  const settlements = getCardMerchantSettlements();
  const settlementIndex = settlements.findIndex(s => s.vendorName === vendorName);
  
  if (settlementIndex === -1) return false;
  
  const settlement = settlements[settlementIndex];
  const withdrawalIndex = settlement.withdrawals.findIndex(w => w.id === withdrawalId);
  
  if (withdrawalIndex === -1) return false;
  
  // Deep-clone beforeData to avoid shared reference corruption
  const beforeData = JSON.parse(JSON.stringify(settlement.withdrawals[withdrawalIndex]));
  const oldAmount = beforeData.settlementTotal;
  
  settlement.history.push({
    id: `HIST_${Date.now()}`,
    timestamp: new Date().toLocaleString(),
    action: 'withdrawal',
    previousState: {
      withdrawals: JSON.parse(JSON.stringify(settlement.withdrawals)),
    },
    description: `修改提款记录: ${withdrawalId}`,
  });
  
  const withdrawal = settlement.withdrawals[withdrawalIndex];
  if (patch.withdrawalAmountUsdt !== undefined) {
    withdrawal.withdrawalAmountUsdt = patch.withdrawalAmountUsdt;
  }
  if (patch.usdtRate !== undefined) {
    withdrawal.usdtRate = patch.usdtRate;
  }
  if (patch.remark !== undefined) {
    withdrawal.remark = patch.remark;
  }
  withdrawal.settlementTotal = withdrawal.withdrawalAmountUsdt * withdrawal.usdtRate;
  const newAmount = withdrawal.settlementTotal;
  
  const saveResult = await saveCardMerchantSettlements(settlements);
  logOperation('merchant_settlement', 'update', withdrawalId, beforeData, JSON.parse(JSON.stringify(withdrawal)), `修改卡商提款: ${vendorName}`);
  
  const delta = oldAmount - newAmount; // positive = balance increases (less withdrawal)
  if (Math.abs(delta) > 0.01) {
    await createAdjustmentEntry({
      accountType: 'card_vendor',
      accountId: vendorName,
      sourceType: 'withdrawal_adjustment',
      sourceId: `wadj_${withdrawalId}_${Date.now()}`,
      delta,
      note: `修改提款: ¥${oldAmount.toFixed(2)} → ¥${newAmount.toFixed(2)}`,
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
  }
  
  window.dispatchEvent(new CustomEvent('ledger-updated'));
  
  return true;
}

// 删除提款记录
export async function deleteWithdrawal(
  vendorName: string,
  withdrawalId: string,
  currentBalance?: number
): Promise<boolean> {
  const settlements = getCardMerchantSettlements();
  const settlementIndex = settlements.findIndex(s => s.vendorName === vendorName);
  
  if (settlementIndex === -1) return false;
  
  const settlement = settlements[settlementIndex];
  const withdrawalIndex = settlement.withdrawals.findIndex(w => w.id === withdrawalId);
  
  if (withdrawalIndex === -1) return false;
  
  const beforeData = { ...settlement.withdrawals[withdrawalIndex] };
  const deletedAmount = beforeData.settlementTotal;
  
  settlement.history.push({
    id: `HIST_${Date.now()}`,
    timestamp: new Date().toLocaleString(),
    action: 'withdrawal',
    previousState: {
      withdrawals: JSON.parse(JSON.stringify(settlement.withdrawals)),
    },
    description: `删除提款记录: ${withdrawalId}`,
  });
  
  settlement.withdrawals.splice(withdrawalIndex, 1);
  
  await saveCardMerchantSettlements(settlements);
  logOperation('merchant_settlement', 'delete', withdrawalId, beforeData, null, `删除卡商提款: ${vendorName}`);
  
  // Reverse ALL ledger entries: original withdrawal + any adjustments
  const reversalResult = await reverseAllEntriesForSource({
    accountType: 'card_vendor',
    accountId: vendorName,
    orderId: withdrawalId,
    sourcePrefix: 'wd_',
    adjPrefix: 'wadj_',
    note: `删除提款记录: ¥${deletedAmount}`,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  // Fallback: if reverseAll returned null, try softDelete on the original entry
  if (!reversalResult) {
    console.warn('[MerchantSettlement] reverseAllEntriesForSource returned null for withdrawal', withdrawalId, '- attempting softDelete fallback');
    await softDeleteLedgerEntry({
      sourceType: 'withdrawal',
      sourceId: `wd_${withdrawalId}`,
      accountType: 'card_vendor',
      accountId: vendorName,
      note: `删除提款记录(fallback): ¥${deletedAmount}`,
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
  }
  
  window.dispatchEvent(new CustomEvent('ledger-updated'));
  window.dispatchEvent(new CustomEvent('balance-log-updated'));
  return true;
}

// 修改充值记录
export async function updateRecharge(
  providerName: string,
  rechargeId: string,
  patch: { rechargeAmountUsdt?: number; usdtRate?: number; remark?: string },
  currentBalance?: number
): Promise<boolean> {
  const settlements = getPaymentProviderSettlements();
  const settlementIndex = settlements.findIndex(s => s.providerName === providerName);
  
  if (settlementIndex === -1) return false;
  
  const settlement = settlements[settlementIndex];
  const rechargeIndex = settlement.recharges.findIndex(r => r.id === rechargeId);
  
  if (rechargeIndex === -1) return false;
  
  // Deep-clone beforeData to avoid shared reference corruption
  const beforeData = JSON.parse(JSON.stringify(settlement.recharges[rechargeIndex]));
  const oldAmount = beforeData.settlementTotal;
  
  settlement.history.push({
    id: `HIST_${Date.now()}`,
    timestamp: new Date().toLocaleString(),
    action: 'recharge',
    previousState: {
      recharges: JSON.parse(JSON.stringify(settlement.recharges)),
    },
    description: `修改充值记录: ${rechargeId}`,
  });
  
  const recharge = settlement.recharges[rechargeIndex];
  if (patch.rechargeAmountUsdt !== undefined) {
    recharge.rechargeAmountUsdt = patch.rechargeAmountUsdt;
  }
  if (patch.usdtRate !== undefined) {
    recharge.usdtRate = patch.usdtRate;
  }
  if (patch.remark !== undefined) {
    recharge.remark = patch.remark;
  }
  recharge.settlementTotal = recharge.rechargeAmountUsdt * recharge.usdtRate;
  const newAmount = recharge.settlementTotal;
  
  const saveResult = await savePaymentProviderSettlements(settlements);
  logOperation('merchant_settlement', 'update', rechargeId, beforeData, JSON.parse(JSON.stringify(recharge)), `修改代付商家充值: ${providerName}`);
  
  const delta = newAmount - oldAmount; // positive = balance increases (more recharge)
  if (Math.abs(delta) > 0.01) {
    await createAdjustmentEntry({
      accountType: 'payment_provider',
      accountId: providerName,
      sourceType: 'recharge_adjustment',
      sourceId: `radj_${rechargeId}_${Date.now()}`,
      delta,
      note: `修改充值: ¥${oldAmount.toFixed(2)} → ¥${newAmount.toFixed(2)}`,
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
  }
  
  window.dispatchEvent(new CustomEvent('ledger-updated'));
  
  return true;
}

// 删除充值记录
export async function deleteRecharge(
  providerName: string,
  rechargeId: string,
  currentBalance?: number
): Promise<boolean> {
  const settlements = getPaymentProviderSettlements();
  const settlementIndex = settlements.findIndex(s => s.providerName === providerName);
  
  if (settlementIndex === -1) return false;
  
  const settlement = settlements[settlementIndex];
  const rechargeIndex = settlement.recharges.findIndex(r => r.id === rechargeId);
  
  if (rechargeIndex === -1) return false;
  
  const beforeData = { ...settlement.recharges[rechargeIndex] };
  const deletedAmount = beforeData.settlementTotal;
  
  settlement.history.push({
    id: `HIST_${Date.now()}`,
    timestamp: new Date().toLocaleString(),
    action: 'recharge',
    previousState: {
      recharges: JSON.parse(JSON.stringify(settlement.recharges)),
    },
    description: `删除充值记录: ${rechargeId}`,
  });
  
  settlement.recharges.splice(rechargeIndex, 1);
  
  await savePaymentProviderSettlements(settlements);
  logOperation('merchant_settlement', 'delete', rechargeId, beforeData, null, `删除代付商家充值: ${providerName}`);
  
  // Reverse ALL ledger entries: original recharge + any adjustments
  const reversalResult = await reverseAllEntriesForSource({
    accountType: 'payment_provider',
    accountId: providerName,
    orderId: rechargeId,
    sourcePrefix: 'rc_',
    adjPrefix: 'radj_',
    note: `删除充值记录: ¥${deletedAmount}`,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  // Fallback: if reverseAll returned null, try softDelete on the original entry
  if (!reversalResult) {
    console.warn('[MerchantSettlement] reverseAllEntriesForSource returned null for recharge', rechargeId, '- attempting softDelete fallback');
    await softDeleteLedgerEntry({
      sourceType: 'recharge',
      sourceId: `rc_${rechargeId}`,
      accountType: 'payment_provider',
      accountId: providerName,
      note: `删除充值记录(fallback): ¥${deletedAmount}`,
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
  }
  
  window.dispatchEvent(new CustomEvent('ledger-updated'));
  window.dispatchEvent(new CustomEvent('balance-log-updated'));
  return true;
}

// ==================== Post-Reset Adjustment ====================

/**
 * 累加重置后调整值
 * 当修改/取消/删除/恢复 created_at <= lastResetTime 的订单或赠送时调用
 */
// ==================== Rename Sync ====================

/**
 * 卡商改名时，同步更新结算缓存中的 vendorName
 */
export async function renameVendorSettlement(oldName: string, newName: string): Promise<void> {
  try {
    const settlements = getCardMerchantSettlements();
    let changed = false;
    
    for (const s of settlements) {
      if (s.vendorName === oldName) {
        s.vendorName = newName;
        // 同步 withdrawals 中的 vendorName
        for (const w of s.withdrawals) {
          if (w.vendorName === oldName) w.vendorName = newName;
        }
        changed = true;
      }
    }
    
    if (changed) {
      await saveCardMerchantSettlements(settlements);
      console.log(`[MerchantSettlement] Renamed vendor settlement: ${oldName} → ${newName}`);
    }
  } catch (error) {
    console.error('[MerchantSettlement] Failed to rename vendor settlement:', error);
  }
}

/**
 * 代付商家改名时，同步更新结算缓存中的 providerName
 */
export async function renameProviderSettlement(oldName: string, newName: string): Promise<void> {
  try {
    const settlements = getPaymentProviderSettlements();
    let changed = false;
    
    for (const s of settlements) {
      if (s.providerName === oldName) {
        s.providerName = newName;
        // 同步 recharges 中的 providerName
        for (const r of s.recharges) {
          if (r.providerName === oldName) r.providerName = newName;
        }
        changed = true;
      }
    }
    
    if (changed) {
      await savePaymentProviderSettlements(settlements);
      console.log(`[MerchantSettlement] Renamed provider settlement: ${oldName} → ${newName}`);
    }
  } catch (error) {
    console.error('[MerchantSettlement] Failed to rename provider settlement:', error);
  }
}

export async function addPostResetAdjustment(
  merchantType: MerchantType,
  merchantName: string,
  delta: number
): Promise<void> {
  if (Math.abs(delta) < 0.01) return;
  
  try {
    if (merchantType === 'card_vendor') {
      const settlements = getCardMerchantSettlements();
      const settlement = settlements.find(s => s.vendorName === merchantName);
      if (!settlement) return;
      
      settlement.postResetAdjustment = (settlement.postResetAdjustment ?? 0) + delta;
      await saveCardMerchantSettlements(settlements);
    } else {
      const settlements = getPaymentProviderSettlements();
      const settlement = settlements.find(s => s.providerName === merchantName);
      if (!settlement) return;
      
      settlement.postResetAdjustment = (settlement.postResetAdjustment ?? 0) + delta;
      await savePaymentProviderSettlements(settlements);
    }
    
    console.log(`[MerchantSettlement] postResetAdjustment updated: ${merchantType}/${merchantName} += ${delta}`);
    window.dispatchEvent(new CustomEvent('settlement-adjustment-updated'));
  } catch (error) {
    console.error('[MerchantSettlement] Failed to update postResetAdjustment:', error);
  }
}
