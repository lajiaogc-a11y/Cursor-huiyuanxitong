// 订单相关工具函数 - 从 useOrders 提取，不修改业务逻辑
import { CurrencyCode } from '@/config/currencies';
import { getPointsSettings, getPointsSettingsAsync } from '@/stores/pointsSettingsStore';
import { getEmployeeNameById, getVendorId, getProviderId, getCardIdByName } from '@/services/members/nameResolver';
import {
  calculateCardWorth,
  calculatePaymentValue,
  calculateProfit,
  calculateProfitRate,
} from '@/lib/orderCalculations';
import { supabase } from '@/integrations/supabase/client';
import type { Order, PointsStatus } from './types';

export function calculateOrderPointsSync(paidAmount: number, currency: CurrencyCode): number {
  const settings = getPointsSettings();
  let fxRate = 1;
  switch (currency) {
    case 'NGN':
      fxRate = settings.ngnToUsdRate || 1;
      break;
    case 'GHS':
      fxRate = settings.ghsToUsdRate || 1;
      break;
    case 'USDT':
      fxRate = 1;
      break;
  }
  const usdAmount = paidAmount / fxRate;
  const pointsPerUsd = settings.usdToPointsRate || 1;
  return Math.floor(usdAmount * pointsPerUsd);
}

export async function calculateOrderPointsAsync(paidAmount: number, currency: CurrencyCode): Promise<number> {
  const settings = await getPointsSettingsAsync();
  let fxRate = 1;
  switch (currency) {
    case 'NGN':
      fxRate = settings.ngnToUsdRate || 1;
      break;
    case 'GHS':
      fxRate = settings.ghsToUsdRate || 1;
      break;
    case 'USDT':
      fxRate = 1;
      break;
  }
  const usdAmount = paidAmount / fxRate;
  const pointsPerUsd = settings.usdToPointsRate || 1;
  return Math.floor(usdAmount * pointsPerUsd);
}

export function formatBeijingTime(dateStr: string): string {
  const date = new Date(dateStr);
  const beijingOffset = 8 * 60;
  const localOffset = date.getTimezoneOffset();
  const beijingTime = new Date(date.getTime() + (beijingOffset + localOffset) * 60 * 1000);
  const year = beijingTime.getFullYear();
  const month = beijingTime.getMonth() + 1;
  const day = beijingTime.getDate();
  const hours = beijingTime.getHours().toString().padStart(2, '0');
  const minutes = beijingTime.getMinutes().toString().padStart(2, '0');
  const seconds = beijingTime.getSeconds().toString().padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

export function mapDbOrderToOrder(dbOrder: any): Order {
  const salesPerson = dbOrder.creator_id ? getEmployeeNameById(dbOrder.creator_id) : '';
  const cardRate = Number(dbOrder.exchange_rate) || 0;
  const cardValue = Number(dbOrder.card_value) || 0;
  const rawForeignRate = Number(dbOrder.foreign_rate) || 0;
  const currency = dbOrder.currency || 'NGN';
  const foreignRate = currency === 'USDT' ? Number(rawForeignRate.toFixed(4)) : rawForeignRate;
  const actualPaid = Number(dbOrder.actual_payment) || 0;
  const fee = Number(dbOrder.fee) || 0;
  const cardWorth = calculateCardWorth(cardValue, cardRate);
  const paymentValue = calculatePaymentValue(actualPaid, foreignRate, fee, currency);
  const profit = calculateProfit(cardWorth, paymentValue);
  const profitRate = calculateProfitRate(profit, cardWorth);
  return {
    id: dbOrder.order_number || dbOrder.id,
    dbId: dbOrder.id,
    createdAt: formatBeijingTime(dbOrder.created_at),
    cardType: dbOrder.order_type || '',
    cardValue,
    cardRate,
    foreignRate,
    cardWorth,
    actualPaid,
    fee,
    paymentValue,
    paymentProvider: dbOrder.vendor_id || '',
    vendor: dbOrder.card_merchant_id || '',
    profit,
    profitRate,
    phoneNumber: dbOrder.phone_number || '',
    memberCode: '',
    demandCurrency: currency,
    salesPerson,
    remark: dbOrder.remark || '',
    status: dbOrder.status as "active" | "cancelled" | "completed",
    order_points: Number(dbOrder.order_points) || 0,
    points_status: (dbOrder.points_status || 'none') as PointsStatus,
  };
}

export function generateOrderNumber(): string {
  const now = new Date();
  const datePart = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letterPart = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * 26)]).join('');
  const numberPart = Array.from({ length: 5 }, () => Math.floor(Math.random() * 10)).join('');
  return `${datePart}${letterPart}${numberPart}`;
}

export async function generateUniqueOrderNumber(maxRetries: number = 3): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const orderNumber = generateOrderNumber();
    const { data, error } = await supabase
      .from('orders')
      .select('id')
      .eq('order_number', orderNumber)
      .maybeSingle();
    if (error) {
      console.error('[generateUniqueOrderNumber] Check failed:', error);
      continue;
    }
    if (!data) return orderNumber;
    console.warn(`[generateUniqueOrderNumber] Collision detected for ${orderNumber}, retry ${i + 1}/${maxRetries}`);
  }
  return `${generateOrderNumber()}${Date.now().toString().slice(-4)}`;
}

export async function mapOrderToDbAsync(
  order: Omit<Order, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'>,
  orderPoints: number,
  memberId?: string,
  employeeId?: string,
  memberCode?: string
): Promise<any> {
  const vendorUuid = getVendorId(order.vendor) || order.vendor || null;
  const providerUuid = getProviderId(order.paymentProvider) || order.paymentProvider || null;
  const cardTypeUuid = getCardIdByName(order.cardType) || order.cardType || null;
  const isUsdt = order.demandCurrency === 'USDT';
  const currency = order.demandCurrency;
  const foreignRateValue = isUsdt ? Number((order.foreignRate || 0).toFixed(4)) : (order.foreignRate || 0);
  const actualPaid = order.actualPaid;
  const foreignRate = foreignRateValue;
  const fee = order.fee;
  const expectedPaymentValue = calculatePaymentValue(actualPaid, foreignRate, fee, currency);
  if (Math.abs(order.paymentValue - expectedPaymentValue) > 0.1) {
    console.error('[mapOrderToDbAsync] ⚠️ 计算不一致! paymentValue 与预期值不符', {
      inputPaymentValue: order.paymentValue,
      expectedPaymentValue,
      actualPaid,
      foreignRate,
      fee,
      currency,
      diff: Math.abs(order.paymentValue - expectedPaymentValue)
    });
  }
  if (currency === 'NGN' && actualPaid < order.cardWorth * 50 && order.cardWorth > 0) {
    console.warn('[mapOrderToDbAsync] ⚠️ actualPaid 可能不是奈拉金额（值过小）', {
      actualPaid,
      cardWorth: order.cardWorth,
      ratio: actualPaid / order.cardWorth,
      expectedRatio: `约 ${foreignRate}`
    });
  }
  if (order.profitRate > 50) {
    console.warn('[mapOrderToDbAsync] ⚠️ 利润率异常过高', {
      profitRate: order.profitRate,
      profit: order.profit,
      cardWorth: order.cardWorth,
      paymentValue: order.paymentValue
    });
  }
  const orderNumber = await generateUniqueOrderNumber();
  return {
    order_number: orderNumber,
    order_type: cardTypeUuid,
    card_value: order.cardValue,
    exchange_rate: order.cardRate,
    foreign_rate: foreignRateValue,
    amount: order.cardWorth,
    actual_payment: order.actualPaid,
    fee: order.fee,
    payment_value: order.paymentValue,
    vendor_id: providerUuid,
    card_merchant_id: vendorUuid,
    profit_ngn: isUsdt ? null : order.profit,
    profit_usdt: isUsdt ? order.profit : null,
    profit_rate: order.profitRate,
    phone_number: order.phoneNumber,
    currency: order.demandCurrency,
    creator_id: employeeId || null,
    sales_user_id: employeeId || null,
    member_id: memberId || null,
    member_code_snapshot: memberCode || null,
    remark: order.remark,
    status: 'completed',
    order_points: orderPoints,
    points_status: 'none',
    data_version: 2,
  };
}
