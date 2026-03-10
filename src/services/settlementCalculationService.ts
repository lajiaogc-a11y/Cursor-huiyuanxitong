// ============= 结算余额计算服务 =============
// 统一卡商和代付商家的余额计算逻辑，供商家结算和交班对账共用

import { safeNumber } from '@/lib/safeCalc';
import {
  CardMerchantSettlement,
  PaymentProviderSettlement,
  calculateWithdrawalTotal,
  calculateRechargeTotal,
} from '@/stores/merchantSettlementStore';

export interface OrderData {
  id: string;
  card_merchant_id?: string | null;
  vendor_id?: string | null;
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

/**
 * 计算代付商家订单总额
 * 逻辑：匹配 vendor_id (可以是ID或名称)，排除已取消订单，只计算重置时间之后的订单
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
      // vendor_id 存储的是代付商家名称或ID
      const matchProvider = order.vendor_id === provider.id || order.vendor_id === provider.name;
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
 * 卡商结算逻辑：实时余额 = 订单总金额 - 提款总金额
 */
export function calculateVendorBalance(
  vendor: VendorData,
  orders: OrderData[],
  settlement: CardMerchantSettlement | null
): VendorBalanceResult {
  const initialBalance = settlement?.initialBalance || 0;
  const lastResetTime = settlement?.lastResetTime || null;
  const postResetAdjustment = settlement?.postResetAdjustment ?? 0;
  const orderTotal = calculateVendorOrderTotal(vendor, orders, lastResetTime);
  const withdrawalTotal = settlement ? calculateWithdrawalTotal(vendor.name) : 0;
  // 修复: 实时余额 = 初始余额 + 订单总额 + 重置后调整 - 提款总额
  const realTimeBalance = initialBalance + orderTotal + postResetAdjustment - withdrawalTotal;
  
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
 * 代付结算逻辑：实时余额 = 初始余额 - 订单总金额 - 赠送总金额 + 充值总额
 * 注意：赠送数据也需要按重置时间过滤，设置初始余额后赠送总金额重置为0
 */
export function calculateProviderBalance(
  provider: ProviderData,
  orders: OrderData[],
  settlement: PaymentProviderSettlement | null,
  gifts?: { payment_agent: string; gift_value: number | null; created_at?: string }[]  // 增加 created_at 字段
): ProviderBalanceResult {
  const initialBalance = settlement?.initialBalance || 0;
  const lastResetTime = settlement?.lastResetTime || null;
  const postResetAdjustment = settlement?.postResetAdjustment ?? 0;
  const orderTotal = calculateProviderOrderTotal(provider, orders, lastResetTime);
  const rechargeTotal = settlement ? calculateRechargeTotal(provider.name) : 0;
  
  // 解析重置时间
  const resetDate = lastResetTime ? new Date(lastResetTime) : null;
  
  // 计算赠送总金额：匹配 payment_agent 字段（可能是名称或ID），并按重置时间过滤
  const giftTotal = (gifts || [])
    .filter(g => {
      const matchProvider = g.payment_agent === provider.id || g.payment_agent === provider.name;
      // 只统计重置时间之后的赠送记录
      const afterReset = !resetDate || !g.created_at || new Date(g.created_at) > resetDate;
      return matchProvider && afterReset;
    })
    .reduce((sum, g) => sum + safeNumber(g.gift_value), 0);
  
  // 公式: 实时余额 = 初始余额 - 订单总金额 - 赠送总金额 + 重置后调整 + 充值总额
  const realTimeBalance = initialBalance - orderTotal - giftTotal + postResetAdjustment + rechargeTotal;
  
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
 */
export function calculateAllVendorBalances(
  vendors: VendorData[],
  orders: OrderData[],
  settlements: CardMerchantSettlement[]
): VendorBalanceResult[] {
  return vendors.map(vendor => {
    const settlement = settlements.find(s => s.vendorName === vendor.name) || null;
    return calculateVendorBalance(vendor, orders, settlement);
  });
}

/**
 * 批量计算所有代付商家的余额
 */
export function calculateAllProviderBalances(
  providers: ProviderData[],
  orders: OrderData[],
  settlements: PaymentProviderSettlement[],
  gifts?: { payment_agent: string; gift_value: number | null; created_at?: string }[]  // 增加 created_at 字段
): ProviderBalanceResult[] {
  return providers.map(provider => {
    const settlement = settlements.find(s => s.providerName === provider.name) || null;
    return calculateProviderBalance(provider, orders, settlement, gifts);
  });
}
