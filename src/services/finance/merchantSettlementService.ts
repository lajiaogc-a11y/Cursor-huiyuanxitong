// Merchant Settlement Store - 商家结算数据管理
// 使用 shared_data_store 作为唯一数据源

import { logOperation } from '@/services/audit/auditLogService';
import { loadSharedData, saveSharedData, clearSharedCacheKey } from '@/services/finance/sharedDataService';
import { pickBilingual } from '@/lib/appLocale';
import { createLedgerEntry, createAdjustmentEntry, softDeleteLedgerEntry, setInitialBalanceLedger, reverseAllEntriesForSource, reverseInitialBalanceEntry, getLedgerBalance as _getLedgerBalance, reconcileAndCorrect as _reconcileAndCorrect } from '@/services/finance/ledgerTransactionService';
import { notifyDataMutation } from '@/services/system/dataRefreshManager';
import { formatBeijingTime } from '@/lib/beijingTime';

/**
 * 统一写后管道：每次结算变更完成后调用，确保 ledger 与缓存一致。
 * 1. 通知数据变更
 * 2. 刷新结算缓存
 */
async function postMutationPipeline(): Promise<void> {
  notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
  window.dispatchEvent(new CustomEvent('settlement-data-changed'));
}

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
let _settlementWriteLock = 0;

/** 等待本机结算写入锁释放（save* 会持锁约 10s），避免在锁内把 cacheInitialized 误标为已加载。 */
async function waitForSettlementWriteLock(maxMs = 12000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (_settlementWriteLock > Date.now() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function initializeSettlementCacheInternal(): Promise<void> {
  if (cacheInitialized) return;
  if (_settlementWriteLock > Date.now()) {
    // 不得在持锁时标记「已初始化」却不拉库，否则缓存可能长期为空，loadData 会覆盖界面为空白明细。
    return;
  }

  try {
    const [cardData, providerData] = await Promise.all([
      loadSharedData('cardMerchantSettlements'),
      loadSharedData('paymentProviderSettlements'),
    ]);

    if (_settlementWriteLock > Date.now()) {
      // 拉库完成时恰有写入：不应用可能未提交的读结果，也不标 initialized，下次再拉。
      return;
    }

    if (cardData !== null) {
      cardSettlementsCache = (cardData as CardMerchantSettlement[]) || [];
    }
    if (providerData !== null) {
      providerSettlementsCache = (providerData as PaymentProviderSettlement[]) || [];
    }
    cacheInitialized = true;
  } catch (error) {
    console.error('[MerchantSettlement] Cache initialization failed:', error);
  }
}

export async function initializeSettlementCache(): Promise<void> {
  await initializeSettlementCacheInternal();
}

export async function forceRefreshSettlementCache(): Promise<void> {
  if (_settlementWriteLock > Date.now()) return;
  cacheInitialized = false;
  clearSharedCacheKey('cardMerchantSettlements');
  clearSharedCacheKey('paymentProviderSettlements');
  await initializeSettlementCacheInternal();
}

/** 账本等变更后仅标记需从共享数据重载；勿清空数组，否则与异步 reload 竞态时充值/提款明细会短暂或错误地变为空。 */
export function resetSettlementCache(): void {
  if (_settlementWriteLock > Date.now()) return;
  cacheInitialized = false;
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
  const cloned = JSON.parse(JSON.stringify(settlements));
  _settlementWriteLock = Date.now() + 10000;
  cardSettlementsCache = cloned;
  cacheInitialized = true;
  await saveSharedData('cardMerchantSettlements', cloned);
  window.dispatchEvent(new CustomEvent('settlement-data-changed'));
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
    timestamp: formatBeijingTime(new Date()),
    action: 'initial_balance',
    previousState: {
      initialBalance: settlement.initialBalance,
      lastResetTime: settlement.lastResetTime,
      postResetAdjustment: settlement.postResetAdjustment ?? 0,
      withdrawals: [...settlement.withdrawals],
    },
    description: pickBilingual(`设置初始余额: ${amount}`, `Set initial balance: ${amount}`),
    operatorId: currentOperatorId,
  });
  
  settlement.initialBalance = amount;
  settlement.lastResetTime = formatBeijingTime(new Date());
  settlement.postResetAdjustment = 0;
  
  if (settlement.withdrawals.length > 0) {
    if (!settlement.archivedWithdrawals) settlement.archivedWithdrawals = [];
    settlement.archivedWithdrawals.push({
      resetTime: formatBeijingTime(new Date()),
      records: JSON.parse(JSON.stringify(settlement.withdrawals)),
    });
  }
  settlement.withdrawals = [];
  
  await saveCardMerchantSettlements(settlements);
  logOperation('merchant_settlement', 'update', vendorName, beforeData, settlement, pickBilingual(`设置卡商初始余额: ${vendorName} = ${amount}`, `Set card vendor initial balance: ${vendorName} = ${amount}`));
  
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await setInitialBalanceLedger({
    accountType: 'card_vendor',
    accountId: vendorName,
    newBalance: amount,
    previousBalance,
    batchId,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  await postMutationPipeline();
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
    createdAt: formatBeijingTime(new Date()),
    recorderId: currentOperatorId || undefined,
  };
  
  settlements[settlementIndex].history.push({
    id: `HIST_${Date.now()}`,
    timestamp: formatBeijingTime(new Date()),
    action: 'withdrawal',
    previousState: {
      withdrawals: [...settlements[settlementIndex].withdrawals],
    },
    description: pickBilingual(`录入提款: ${withdrawalAmountUsdt} USDT × ${usdtRate} = ${record.settlementTotal}`, `Withdrawal: ${withdrawalAmountUsdt} USDT × ${usdtRate} = ${record.settlementTotal}`),
    operatorId: currentOperatorId,
  });
  settlements[settlementIndex].withdrawals.push(record);
  
  await saveCardMerchantSettlements(settlements);
  logOperation('merchant_settlement', 'create', record.id, null, record, pickBilingual(`录入卡商提款: ${vendorName} - ${record.settlementTotal}`, `Card vendor withdrawal: ${vendorName} - ${record.settlementTotal}`));
  
  const changeAmount = -record.settlementTotal;
  await createLedgerEntry({
    accountType: 'card_vendor',
    accountId: vendorName,
    sourceType: 'withdrawal',
    sourceId: `wd_${record.id}`,
    amount: changeAmount,
    note: pickBilingual(`提款: ${withdrawalAmountUsdt} USDT × ${usdtRate} = ¥${record.settlementTotal}`, `Withdrawal: ${withdrawalAmountUsdt} USDT × ${usdtRate} = ¥${record.settlementTotal}`),
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  await postMutationPipeline();
  return record;
}

export async function undoLastAction(vendorName: string, currentBalance?: number, operatorId?: string): Promise<{ success: boolean; error?: string; description?: string }> {
  const settlements = getCardMerchantSettlements();
  const settlementIndex = settlements.findIndex(s => s.vendorName === vendorName);
  
  if (settlementIndex === -1) return { success: false, error: pickBilingual('未找到结算数据', 'Settlement data not found') };
  
  const settlement = settlements[settlementIndex];
  if (settlement.history.length === 0) return { success: false, error: pickBilingual('没有可撤回的操作', 'No actions to undo') };
  
  const lastAction = settlement.history[settlement.history.length - 1];
  
  // Issue 3: Undo button only for initial balance
  if (lastAction.action !== 'initial_balance') {
    return { success: false, error: pickBilingual('撤回功能仅支持初始余额操作', 'Undo only supports initial balance operations') };
  }
  
  // Issue 2: Ownership check - only allow undoing own data
  if (operatorId && lastAction.operatorId && lastAction.operatorId !== operatorId) {
    return { success: false, error: pickBilingual('最新数据不是你录入的，无法撤回', 'The latest data was not entered by you and cannot be undone') };
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
    pickBilingual(`撤回卡商操作: ${vendorName} - ${lastAction.description}`, `Undo card vendor action: ${vendorName} - ${lastAction.description}`));
  
  await reverseInitialBalanceEntry({
    accountType: 'card_vendor',
    accountId: vendorName,
    note: pickBilingual(`撤销卡商初始余额: ${lastAction.description}`, `Reverse card vendor initial balance: ${lastAction.description}`),
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  await postMutationPipeline();
  
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
  const cloned = JSON.parse(JSON.stringify(settlements));
  _settlementWriteLock = Date.now() + 10000;
  providerSettlementsCache = cloned;
  cacheInitialized = true;
  await saveSharedData('paymentProviderSettlements', cloned);
  window.dispatchEvent(new CustomEvent('settlement-data-changed'));
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
    timestamp: formatBeijingTime(new Date()),
    action: 'initial_balance',
    previousState: {
      initialBalance: settlement.initialBalance,
      lastResetTime: settlement.lastResetTime,
      postResetAdjustment: settlement.postResetAdjustment ?? 0,
      recharges: [...settlement.recharges],
    },
    description: pickBilingual(`设置初始余额: ${amount}`, `Set initial balance: ${amount}`),
    operatorId: currentOperatorId,
  });
  
  settlement.initialBalance = amount;
  settlement.lastResetTime = formatBeijingTime(new Date());
  settlement.postResetAdjustment = 0;
  
  // Archive current recharges before clearing
  if (settlement.recharges.length > 0) {
    if (!settlement.archivedRecharges) settlement.archivedRecharges = [];
    settlement.archivedRecharges.push({
      resetTime: formatBeijingTime(new Date()),
      records: JSON.parse(JSON.stringify(settlement.recharges)),
    });
  }
  settlement.recharges = [];
  
  await savePaymentProviderSettlements(settlements);
  logOperation('merchant_settlement', 'update', providerName, beforeData, settlement, pickBilingual(`设置代付商家初始余额: ${providerName} = ${amount}`, `Set payment provider initial balance: ${providerName} = ${amount}`));
  
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await setInitialBalanceLedger({
    accountType: 'payment_provider',
    accountId: providerName,
    newBalance: amount,
    previousBalance,
    batchId,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  await postMutationPipeline();
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
    createdAt: formatBeijingTime(new Date()),
    recorderId: currentOperatorId || undefined,
  };
  
  settlements[settlementIndex].history.push({
    id: `HIST_${Date.now()}`,
    timestamp: formatBeijingTime(new Date()),
    action: 'recharge',
    previousState: {
      recharges: [...settlements[settlementIndex].recharges],
    },
    description: pickBilingual(`录入充值: ${rechargeAmountUsdt} USDT × ${usdtRate} = ${record.settlementTotal}`, `Recharge: ${rechargeAmountUsdt} USDT × ${usdtRate} = ${record.settlementTotal}`),
    operatorId: currentOperatorId,
  });
  settlements[settlementIndex].recharges.push(record);
  
  await savePaymentProviderSettlements(settlements);
  logOperation('merchant_settlement', 'create', record.id, null, record, pickBilingual(`录入代付商家充值: ${providerName} - ${record.settlementTotal}`, `Payment provider recharge: ${providerName} - ${record.settlementTotal}`));
  
  const changeAmount = record.settlementTotal;
  const rechargeNote = remark || pickBilingual(`充值: ${rechargeAmountUsdt} USDT × ${usdtRate} = ¥${record.settlementTotal}`, `Recharge: ${rechargeAmountUsdt} USDT × ${usdtRate} = ¥${record.settlementTotal}`);
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
  
  await postMutationPipeline();
  return record;
}

export async function undoProviderLastAction(providerName: string, currentBalance?: number, operatorId?: string): Promise<{ success: boolean; error?: string; description?: string }> {
  const settlements = getPaymentProviderSettlements();
  const settlementIndex = settlements.findIndex(s => s.providerName === providerName);
  
  if (settlementIndex === -1) return { success: false, error: pickBilingual('未找到结算数据', 'Settlement data not found') };
  
  const settlement = settlements[settlementIndex];
  if (settlement.history.length === 0) return { success: false, error: pickBilingual('没有可撤回的操作', 'No actions to undo') };
  
  const lastAction = settlement.history[settlement.history.length - 1];
  
  // Issue 3: Undo button only for initial balance
  if (lastAction.action !== 'initial_balance') {
    return { success: false, error: pickBilingual('撤回功能仅支持初始余额操作', 'Undo only supports initial balance operations') };
  }
  
  // Issue 2: Ownership check - only allow undoing own data
  if (operatorId && lastAction.operatorId && lastAction.operatorId !== operatorId) {
    return { success: false, error: pickBilingual('最新数据不是你录入的，无法撤回', 'The latest data was not entered by you and cannot be undone') };
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
    pickBilingual(`撤回代付商家操作: ${providerName} - ${lastAction.description}`, `Undo payment provider action: ${providerName} - ${lastAction.description}`));
  
  await reverseInitialBalanceEntry({
    accountType: 'payment_provider',
    accountId: providerName,
    note: pickBilingual(`撤销代付商家初始余额: ${lastAction.description}`, `Reverse payment provider initial balance: ${lastAction.description}`),
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  await postMutationPipeline();
  
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
  await waitForSettlementWriteLock();
  await initializeSettlementCache();

  let settlements = getCardMerchantSettlements();
  let settlementIndex = settlements.findIndex(s => s.vendorName === vendorName);
  let withdrawalIndex =
    settlementIndex >= 0 ? settlements[settlementIndex].withdrawals.findIndex(w => w.id === withdrawalId) : -1;

  if (withdrawalIndex === -1) {
    await waitForSettlementWriteLock();
    await forceRefreshSettlementCache();
    await waitForSettlementWriteLock();
    settlements = getCardMerchantSettlements();
    settlementIndex = settlements.findIndex(s => s.vendorName === vendorName);
    withdrawalIndex =
      settlementIndex >= 0 ? settlements[settlementIndex].withdrawals.findIndex(w => w.id === withdrawalId) : -1;
  }

  if (settlementIndex === -1 || withdrawalIndex === -1) return false;

  const settlement = settlements[settlementIndex];

  const beforeData = JSON.parse(JSON.stringify(settlement.withdrawals[withdrawalIndex]));
  const oldAmount = beforeData.settlementTotal;
  
  settlement.history.push({
    id: `HIST_${Date.now()}`,
    timestamp: formatBeijingTime(new Date()),
    action: 'withdrawal',
    previousState: {
      withdrawals: JSON.parse(JSON.stringify(settlement.withdrawals)),
    },
    description: pickBilingual(`修改提款记录: ${withdrawalId}`, `Edit withdrawal: ${withdrawalId}`),
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
  
  await saveCardMerchantSettlements(settlements);
  logOperation('merchant_settlement', 'update', withdrawalId, beforeData, JSON.parse(JSON.stringify(withdrawal)), pickBilingual(`修改卡商提款: ${vendorName}`, `Edit card vendor withdrawal: ${vendorName}`));
  
  const delta = oldAmount - newAmount;
  if (Math.abs(delta) > 0.01) {
    await reverseAllEntriesForSource({
      accountType: 'card_vendor',
      accountId: vendorName,
      orderId: withdrawalId,
      sourcePrefix: 'wd_',
      adjPrefix: 'wadj_',
      note: pickBilingual(`修改提款(撤旧): ¥${oldAmount.toFixed(2)} → ¥${newAmount.toFixed(2)}`, `Edit withdrawal (reverse old): ¥${oldAmount.toFixed(2)} → ¥${newAmount.toFixed(2)}`),
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
    await createLedgerEntry({
      accountType: 'card_vendor',
      accountId: vendorName,
      sourceType: 'withdrawal',
      sourceId: `wd_${withdrawalId}`,
      amount: -newAmount,
      note: pickBilingual(
        `提款(修改后): ${withdrawal.withdrawalAmountUsdt} USDT × ${withdrawal.usdtRate} = ¥${newAmount.toFixed(2)}`,
        `Withdrawal (edited): ${withdrawal.withdrawalAmountUsdt} USDT × ${withdrawal.usdtRate} = ¥${newAmount.toFixed(2)}`
      ),
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
  }
  
  // Deliberately NOT calling postMutationPipeline() here — the caller
  // (page handler) will notify after it has finished reloading data,
  // preventing event-driven cache resets from racing with the save.
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
    timestamp: formatBeijingTime(new Date()),
    action: 'withdrawal',
    previousState: {
      withdrawals: JSON.parse(JSON.stringify(settlement.withdrawals)),
    },
    description: pickBilingual(`删除提款记录: ${withdrawalId}`, `Delete withdrawal: ${withdrawalId}`),
  });
  
  settlement.withdrawals.splice(withdrawalIndex, 1);
  
  await saveCardMerchantSettlements(settlements);
  logOperation('merchant_settlement', 'delete', withdrawalId, beforeData, null, pickBilingual(`删除卡商提款: ${vendorName}`, `Delete card vendor withdrawal: ${vendorName}`));
  
  // Reverse ALL ledger entries: original withdrawal + any adjustments
  const reversalResult = await reverseAllEntriesForSource({
    accountType: 'card_vendor',
    accountId: vendorName,
    orderId: withdrawalId,
    sourcePrefix: 'wd_',
    adjPrefix: 'wadj_',
    note: pickBilingual(`删除提款记录: ¥${deletedAmount}`, `Delete withdrawal: ¥${deletedAmount}`),
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  if (reversalResult == null) {
    console.warn('[MerchantSettlement] reverseAllEntriesForSource failed for withdrawal', withdrawalId, '- attempting softDelete fallback');
    await softDeleteLedgerEntry({
      sourceType: 'withdrawal',
      sourceId: `wd_${withdrawalId}`,
      accountType: 'card_vendor',
      accountId: vendorName,
      note: pickBilingual(`删除提款记录(fallback): ¥${deletedAmount}`, `Delete withdrawal (fallback): ¥${deletedAmount}`),
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
  }
  
  return true;
}

// 修改充值记录
export async function updateRecharge(
  providerName: string,
  rechargeId: string,
  patch: { rechargeAmountUsdt?: number; usdtRate?: number; remark?: string },
  currentBalance?: number
): Promise<boolean> {
  await waitForSettlementWriteLock();
  await initializeSettlementCache();

  let settlements = getPaymentProviderSettlements();
  let settlementIndex = settlements.findIndex(s => s.providerName === providerName);
  let rechargeIndex =
    settlementIndex >= 0 ? settlements[settlementIndex].recharges.findIndex(r => r.id === rechargeId) : -1;

  if (rechargeIndex === -1) {
    await waitForSettlementWriteLock();
    await forceRefreshSettlementCache();
    await waitForSettlementWriteLock();
    settlements = getPaymentProviderSettlements();
    settlementIndex = settlements.findIndex(s => s.providerName === providerName);
    rechargeIndex =
      settlementIndex >= 0 ? settlements[settlementIndex].recharges.findIndex(r => r.id === rechargeId) : -1;
  }

  if (settlementIndex === -1 || rechargeIndex === -1) return false;

  const settlement = settlements[settlementIndex];

  const beforeData = JSON.parse(JSON.stringify(settlement.recharges[rechargeIndex]));
  const oldAmount = beforeData.settlementTotal;
  
  settlement.history.push({
    id: `HIST_${Date.now()}`,
    timestamp: formatBeijingTime(new Date()),
    action: 'recharge',
    previousState: {
      recharges: JSON.parse(JSON.stringify(settlement.recharges)),
    },
    description: pickBilingual(`修改充值记录: ${rechargeId}`, `Edit recharge: ${rechargeId}`),
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
  
  await savePaymentProviderSettlements(settlements);
  logOperation('merchant_settlement', 'update', rechargeId, beforeData, JSON.parse(JSON.stringify(recharge)), pickBilingual(`修改代付商家充值: ${providerName}`, `Edit payment provider recharge: ${providerName}`));
  
  const delta = newAmount - oldAmount;
  if (Math.abs(delta) > 0.01) {
    await reverseAllEntriesForSource({
      accountType: 'payment_provider',
      accountId: providerName,
      orderId: rechargeId,
      sourcePrefix: 'rc_',
      adjPrefix: 'radj_',
      note: pickBilingual(`修改充值(撤旧): ¥${oldAmount.toFixed(2)} → ¥${newAmount.toFixed(2)}`, `Edit recharge (reverse old): ¥${oldAmount.toFixed(2)} → ¥${newAmount.toFixed(2)}`),
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
    await createLedgerEntry({
      accountType: 'payment_provider',
      accountId: providerName,
      sourceType: 'recharge',
      sourceId: `rc_${rechargeId}`,
      amount: newAmount,
      note: pickBilingual(
        `充值(修改后): ${recharge.rechargeAmountUsdt} USDT × ${recharge.usdtRate} = ¥${newAmount.toFixed(2)}`,
        `Recharge (edited): ${recharge.rechargeAmountUsdt} USDT × ${recharge.usdtRate} = ¥${newAmount.toFixed(2)}`
      ),
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
  }
  
  // Deliberately NOT calling postMutationPipeline() here — the caller
  // (page handler) will notify after it has finished reloading data,
  // preventing event-driven cache resets from racing with the save.
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
    timestamp: formatBeijingTime(new Date()),
    action: 'recharge',
    previousState: {
      recharges: JSON.parse(JSON.stringify(settlement.recharges)),
    },
    description: pickBilingual(`删除充值记录: ${rechargeId}`, `Delete recharge: ${rechargeId}`),
  });
  
  settlement.recharges.splice(rechargeIndex, 1);
  
  await savePaymentProviderSettlements(settlements);
  logOperation('merchant_settlement', 'delete', rechargeId, beforeData, null, pickBilingual(`删除代付商家充值: ${providerName}`, `Delete payment provider recharge: ${providerName}`));
  
  // Reverse ALL ledger entries: original recharge + any adjustments
  const reversalResult = await reverseAllEntriesForSource({
    accountType: 'payment_provider',
    accountId: providerName,
    orderId: rechargeId,
    sourcePrefix: 'rc_',
    adjPrefix: 'radj_',
    note: pickBilingual(`删除充值记录: ¥${deletedAmount}`, `Delete recharge: ¥${deletedAmount}`),
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
  
  if (reversalResult == null) {
    console.warn('[MerchantSettlement] reverseAllEntriesForSource failed for recharge', rechargeId, '- attempting softDelete fallback');
    await softDeleteLedgerEntry({
      sourceType: 'recharge',
      sourceId: `rc_${rechargeId}`,
      accountType: 'payment_provider',
      accountId: providerName,
      note: pickBilingual(`删除充值记录(fallback): ¥${deletedAmount}`, `Delete recharge (fallback): ¥${deletedAmount}`),
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
  }
  
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
    
    await createLedgerEntry({
      accountType: merchantType === 'card_vendor' ? 'card_vendor' : 'payment_provider',
      accountId: merchantName,
      sourceType: 'post_reset_adjustment' as any,
      sourceId: `pra_${merchantName}_${Date.now()}`,
      amount: delta,
      note: pickBilingual(`重置后调整: ${delta > 0 ? '+' : ''}¥${delta.toFixed(2)}`, `Post-reset adjustment: ${delta > 0 ? '+' : ''}¥${delta.toFixed(2)}`),
      operatorId: currentOperatorId || undefined,
      operatorName: currentOperatorName || undefined,
    });
    
    console.log(`[MerchantSettlement] postResetAdjustment updated: ${merchantType}/${merchantName} += ${delta}`);
    await postMutationPipeline();
  } catch (error) {
    console.error('[MerchantSettlement] Failed to update postResetAdjustment:', error);
  }
}

// ==================== Ledger Balance API ====================

/**
 * 获取 ledger 权威余额（从 DB SUM(active amount) 计算）
 */
export async function fetchLedgerBalance(
  accountType: 'card_vendor' | 'payment_provider',
  accountId: string,
): Promise<number> {
  return _getLedgerBalance(accountType, accountId);
}

/**
 * 自动对账并修正：比较 ledger 与 derived，若差异则自动插入修正分录
 */
export async function autoReconcile(
  accountType: 'card_vendor' | 'payment_provider',
  accountId: string,
  derivedBalance: number,
): Promise<{ computedBalance: number; corrected: boolean; correctionAmount: number }> {
  return _reconcileAndCorrect({
    accountType,
    accountId,
    derivedBalance,
    operatorId: currentOperatorId || undefined,
    operatorName: currentOperatorName || undefined,
  });
}
