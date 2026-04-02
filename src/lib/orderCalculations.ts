/**
 * 订单利润计算统一工具
 * 确保所有场景（订单编辑、数据导入）使用相同的计算公式
 */

import { safeNumber, safeDivide, safeMultiply, safeSubtract } from './safeCalc';

export type OrderCurrency = 'NGN' | 'GHS' | 'USDT';

/**
 * 计算此卡价值
 * 公式：卡片面值 × 卡片汇率
 */
export function calculateCardWorth(cardValue: number, cardRate: number): number {
  return safeMultiply(safeNumber(cardValue), safeNumber(cardRate));
}

/**
 * 计算代付价值（普通订单：NGN/GHS模式）
 * NGN模式：实付奈拉 ÷ 奈拉汇率 + 手续费
 * GHS模式：实付赛地 × 赛地汇率 + 手续费
 */
export function calculatePaymentValue(
  actualPaid: number,
  foreignRate: number,
  fee: number,
  currency: string
): number {
  const safePaid = safeNumber(actualPaid);
  const safeRate = safeNumber(foreignRate);
  const safeFee = safeNumber(fee);

  // 安全检查：如果汇率为0或无效，直接返回实付金额+手续费
  if (safeRate === 0) {
    console.warn('[calculatePaymentValue] Foreign rate is 0, using actualPaid + fee as fallback');
    return safePaid + safeFee;
  }

  if (currency === 'GHS') {
    // 赛地模式：实付赛地 × 赛地汇率 + 手续费
    return safeMultiply(safePaid, safeRate) + safeFee;
  } else {
    // 奈拉模式（默认）：实付奈拉 ÷ 奈拉汇率 + 手续费
    return safeDivide(safePaid, safeRate, 0) + safeFee;
  }
}

/**
 * 计算利润（普通订单）
 * 公式：利润 = 卡价值 - 代付价值
 */
export function calculateProfit(cardWorth: number, paymentValue: number): number {
  return safeSubtract(safeNumber(cardWorth), safeNumber(paymentValue));
}

/**
 * 计算利润率
 * 公式：利润率 = 利润 ÷ 卡价值 × 100%
 * 统一口径：利润率基于卡价值计算
 */
export function calculateProfitRate(profit: number, cardWorth: number): number {
  const safeProfit = safeNumber(profit);
  const safeWorth = safeNumber(cardWorth);
  return safeWorth > 0 ? (safeProfit / safeWorth) * 100 : 0;
}

/**
 * 反推实付外币（从代付价值）
 * 用于编辑弹窗中用户直接修改代付价值时反推实付外币
 */
export function reverseCalculateActualPaid(
  paymentValue: number,
  foreignRate: number,
  fee: number,
  currency: string
): number {
  const safePaymentValue = safeNumber(paymentValue);
  const safeFee = safeNumber(fee);
  const safeRate = safeNumber(foreignRate);
  const baseValue = safePaymentValue - safeFee;

  if (currency === 'GHS') {
    // 赛地：实付赛地 = (代付价值 - 手续费) ÷ 赛地汇率
    return safeRate > 0 ? baseValue / safeRate : 0;
  } else {
    // 奈拉：实付奈拉 = (代付价值 - 手续费) × 奈拉汇率
    return baseValue * safeRate;
  }
}

/**
 * 一次性计算普通订单的所有派生值
 * 返回：卡价值、代付价值、利润、利润率
 */
export function calculateNormalOrderDerivedValues(params: {
  cardValue: number;
  cardRate: number;
  actualPaid: number;
  foreignRate: number;
  fee: number;
  currency: string;
}): {
  cardWorth: number;
  paymentValue: number;
  profit: number;
  profitRate: number;
} {
  const { cardValue, cardRate, actualPaid, foreignRate, fee, currency } = params;

  const cardWorth = calculateCardWorth(cardValue, cardRate);
  const paymentValue = calculatePaymentValue(actualPaid, foreignRate, fee, currency);
  const profit = calculateProfit(cardWorth, paymentValue);
  const profitRate = calculateProfitRate(profit, cardWorth);

  return { cardWorth, paymentValue, profit, profitRate };
}

/**
 * USDT订单计算
 * 公式：
 * - 总价值USDT = 此卡价值 ÷ USDT汇率
 * - 代付价值 = 实付USDT + 手续费USDT
 * - 利润 = 总价值USDT - 代付价值
 * - 利润率 = 利润 ÷ 总价值USDT × 100%
 */
export function calculateUsdtOrderDerivedValues(params: {
  cardValue: number;
  cardRate: number;
  usdtRate: number;
  actualPaidUsdt: number;
  feeUsdt: number;
}): {
  cardWorth: number;
  totalValueUsdt: number;
  paymentValue: number;
  profit: number;
  profitRate: number;
} {
  const { cardValue, cardRate, usdtRate, actualPaidUsdt, feeUsdt } = params;

  const cardWorth = calculateCardWorth(cardValue, cardRate);
  const totalValueUsdt = safeDivide(cardWorth, safeNumber(usdtRate), 0);
  const paymentValue = safeNumber(actualPaidUsdt) + safeNumber(feeUsdt);
  const profit = safeSubtract(totalValueUsdt, paymentValue);
  const profitRate = totalValueUsdt > 0 ? (profit / totalValueUsdt) * 100 : 0;

  return { cardWorth, totalValueUsdt, paymentValue, profit, profitRate };
}
