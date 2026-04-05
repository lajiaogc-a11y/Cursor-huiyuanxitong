// ============= 结算余额计算服务 =============
// 统一卡商和代付商家的余额计算逻辑，供商家结算和交班对账共用

import { safeNumber } from '@/lib/safeCalc';
import {
  CardMerchantSettlement,
  PaymentProviderSettlement,
  calculateWithdrawalTotal,
  calculateRechargeTotal,
} from '@/services/finance/merchantSettlementService';

export interface OrderData {
  id: string;
  card_merchant_id?: string | null;
  vendor_id?: string | null;
  /** 代付商家（payment_providers.id）；新订单写入此字段，旧数据曾误写在 vendor_id */
  payment_provider?: string | null;
  card_value?: number | null;
  amount?: number | null; // 此卡价值（card_value × exchange_rate）
  payment_value?: number | null;
  currency?: string | null;
  exchange_rate?: number | null;
  foreign_rate?: number | null; // USDT汇率（用于USDT模式计算）
  status?: string | null;
  is_deleted?: boolean | null;
  created_at: string;
}

export interface VendorData {
  id: string;
  name: string;
  status?: string;
}

export interface ProviderData {
  id: string;
  name: string;
  status?: string;
}

export interface VendorBalanceResult {
  vendorName: string;
  initialBalance: number;
  orderTotal: number;
  withdrawalTotal: number;
  postResetAdjustment: number;
  realTimeBalance: number;
  lastResetTime: string | null;
}

export interface ProviderBalanceResult {
  providerName: string;
  initialBalance: number;
  orderTotal: number;
  rechargeTotal: number;
  giftTotal: number;
  postResetAdjustment: number;
  realTimeBalance: number;
  lastResetTime: string | null;
}

/**
 * 计算卡商订单总额
 * 逻辑：匹配 card_merchant_id (可以是ID或名称)，只统计 completed 状态，只计算重置时间之后的订单
 * 金额计算：使用 amount 字段（此卡价值 = 卡片面值 × 卡片汇率）
 */
export function calculateVendorOrderTotal(
  vendor: VendorData,
  orders: OrderData[],
  lastResetTime: string | null
): number {
  const resetDate = lastResetTime ? new Date(lastResetTime) : null;
  
  return orders
    .filter(order => {
      // card_merchant_id 可以是卡商的 ID 或名称
      const matchVendor = order.card_merchant_id === vendor.id || order.card_merchant_id === vendor.name;
      const isCompleted = order.status === 'completed'; // 只统计 completed 状态的订单
      const isNotDeleted = !order.is_deleted;
      const afterReset = !resetDate || new Date(order.created_at) > resetDate;
      return matchVendor && isCompleted && isNotDeleted && afterReset;
    })
    .reduce((sum, order) => {
      // 使用 amount（此卡价值）累加，不是 card_value（卡片面值）
      const orderAmount = safeNumber(order.amount);
      return sum + orderAmount;
    }, 0);
}

/** 与订单管理/报表一致：优先 payment_provider，无则回退 vendor_id（历史误写） */
function orderMatchesPaymentProvider(order: OrderData, provider: ProviderData): boolean {
  const p = order.payment_provider != null ? String(order.payment_provider).trim() : '';
  if (p) return p === provider.id || p === provider.name;
  const v = String(order.vendor_id ?? '').trim();
  return v === provider.id || v === provider.name;
}

/**
 * 计算代付商家订单总额
 * 逻辑：匹配 payment_provider（新订单）或 vendor_id（历史），排除已取消订单，只计算重置时间之后的订单
 * 金额计算：所有模式都直接累加 payment_value（代付价值）
 * 
 * 说明：payment_value 已经是计算后的最终代付价值（人民币）：
 * - 赛地模式：payment_value = 实付赛地 × 赛地汇率 + 手续费
 * - 奈拉模式：payment_value = 实付奈拉 ÷ 奈拉汇率 + 手续费
 * - USDT模式：payment_value = 实付USDT + 手续费USDT（已经是最终值）
 */
export function calculateProviderOrderTotal(
  provider: ProviderData,
  orders: OrderData[],
  lastResetTime: string | null
): number {
  const resetDate = lastResetTime ? new Date(lastResetTime) : null;
  
  return orders
    .filter(order => {
      const matchProvider = orderMatchesPaymentProvider(order, provider);
      const isNotCancelled = order.status !== 'cancelled';
      const isNotDeleted = !order.is_deleted;
      const afterReset = !resetDate || new Date(order.created_at) > resetDate;
      return matchProvider && isNotCancelled && isNotDeleted && afterReset;
    })
    .reduce((sum, order) => {
      // 所有模式统一使用 payment_value（代付价值）直接累加
      // payment_value 已经是最终的人民币价值，无需再次转换
      const paymentValue = safeNumber(order.payment_value);
      return sum + paymentValue;
    }, 0);
}

/**
 * 计算单个卡商的完整余额信息
 * 卡商结算逻辑：实时余额 = 初始余额 + 订单总额 + 重置后调整 - 提款总额
 *
 * 若提供 ledgerBalance，则用 ledger 权威余额覆盖公式计算值，
 * 保留公式各项用于 UI 明细展示。
 */
export function calculateVendorBalance(
  vendor: VendorData,
  orders: OrderData[],
  settlement: CardMerchantSettlement | null,
  ledgerBalance?: number | null
): VendorBalanceResult {
  const initialBalance = settlement?.initialBalance || 0;
  const lastResetTime = settlement?.lastResetTime || null;
  const postResetAdjustment = settlement?.postResetAdjustment ?? 0;
  const orderTotal = calculateVendorOrderTotal(vendor, orders, lastResetTime);
  const withdrawalTotal = settlement ? calculateWithdrawalTotal(vendor.name) : 0;
  const derivedBalance = initialBalance + orderTotal + postResetAdjustment - withdrawalTotal;
  const realTimeBalance = (ledgerBalance != null && Number.isFinite(ledgerBalance)) ? ledgerBalance : derivedBalance;
  
  return {
    vendorName: vendor.name,
    initialBalance,
    orderTotal,
    withdrawalTotal,
    postResetAdjustment,
    realTimeBalance,
    lastResetTime,
  };
}

/**
 * 计算单个代付商家的完整余额信息
 * 代付结算逻辑：实时余额 = 初始余额 - 订单总金额 - 赠送总金额 + 重置后调整 + 充值总额
 *
 * 若提供 ledgerBalance，则用 ledger 权威余额覆盖公式计算值。
 */
export function calculateProviderBalance(
  provider: ProviderData,
  orders: OrderData[],
  settlement: PaymentProviderSettlement | null,
  gifts?: { payment_agent: string; gift_value: number | null; created_at?: string }[],
  ledgerBalance?: number | null
): ProviderBalanceResult {
  const initialBalance = settlement?.initialBalance || 0;
  const lastResetTime = settlement?.lastResetTime || null;
  const postResetAdjustment = settlement?.postResetAdjustment ?? 0;
  const orderTotal = calculateProviderOrderTotal(provider, orders, lastResetTime);
  const rechargeTotal = settlement ? calculateRechargeTotal(provider.name) : 0;
  
  const resetDate = lastResetTime ? new Date(lastResetTime) : null;
  
  const giftTotal = (gifts || [])
    .filter(g => {
      const matchProvider = g.payment_agent === provider.id || g.payment_agent === provider.name;
      const afterReset = !resetDate || !g.created_at || new Date(g.created_at) > resetDate;
      return matchProvider && afterReset;
    })
    .reduce((sum, g) => sum + safeNumber(g.gift_value), 0);
  
  const derivedBalance = initialBalance - orderTotal - giftTotal + postResetAdjustment + rechargeTotal;
  const realTimeBalance = (ledgerBalance != null && Number.isFinite(ledgerBalance)) ? ledgerBalance : derivedBalance;
  
  return {
    providerName: provider.name,
    initialBalance,
    orderTotal,
    rechargeTotal,
    giftTotal,
    postResetAdjustment,
    realTimeBalance,
    lastResetTime,
  };
}

/**
 * 批量计算所有卡商的余额
 * ledgerBalances 为可选的 { [vendorName]: number } 映射，传入时使用 ledger 权威余额
 */
export function calculateAllVendorBalances(
  vendors: VendorData[],
  orders: OrderData[],
  settlements: CardMerchantSettlement[],
  ledgerBalances?: Record<string, number>
): VendorBalanceResult[] {
  return vendors.map(vendor => {
    const settlement = settlements.find(s => s.vendorName === vendor.name) || null;
    const lb = ledgerBalances?.[vendor.name];
    return calculateVendorBalance(vendor, orders, settlement, lb);
  });
}

/**
 * 批量计算所有代付商家的余额
 * ledgerBalances 为可选的 { [providerName]: number } 映射
 */
export function calculateAllProviderBalances(
  providers: ProviderData[],
  orders: OrderData[],
  settlements: PaymentProviderSettlement[],
  gifts?: { payment_agent: string; gift_value: number | null; created_at?: string }[],
  ledgerBalances?: Record<string, number>
): ProviderBalanceResult[] {
  return providers.map(provider => {
    const settlement = settlements.find(s => s.providerName === provider.name) || null;
    const lb = ledgerBalances?.[provider.name];
    return calculateProviderBalance(provider, orders, settlement, gifts, lb);
  });
}
