// 订单相关工具函数 - 从 useOrders 提取，不修改业务逻辑
import { CurrencyCode } from '@/config/currencies';
import { getPointsSettings, getPointsSettingsAsync } from '@/stores/pointsSettingsStore';
import { getEmployeeNameById, getVendorId, getProviderId, getCardIdByName, resolveCardName } from '@/services/members/nameResolver';
import { getNowBeijingISO } from '@/lib/beijingTime';

/** 销售员展示：优先 sales_user_id，其次 creator_id（超管改销售后 creator 可能未同步） */
export function resolveSalesPersonName(dbOrder: { sales_user_id?: string | null; creator_id?: string | null }): string {
  const sid = dbOrder.sales_user_id != null ? String(dbOrder.sales_user_id).trim() : '';
  const cid = dbOrder.creator_id != null ? String(dbOrder.creator_id).trim() : '';
  const id = sid || cid;
  return id ? getEmployeeNameById(id) : '';
}
import {
  calculateCardWorth,
  calculatePaymentValue,
  calculateProfit,
  calculateProfitRate,
} from '@/lib/orderCalculations';
import type { Order, PointsStatus, UsdtOrder } from './types';
import { formatBeijingTime } from '@/lib/beijingTime';
import { formatMemberLocalTime } from '@/lib/memberLocalTime';
import { formatMemberOrderNumberForDisplay } from '@/lib/memberOrderDisplay';

export { formatBeijingTime };

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

export function mapDbOrderToOrder(dbOrder: any): Order {
  const salesPerson = resolveSalesPersonName(dbOrder);
  const rawCardRate = Number(dbOrder.exchange_rate) || Number(dbOrder.rate) || 0;
  const rawCardValue = Number(dbOrder.card_value) || 0;
  const rawForeignRate = Number(dbOrder.foreign_rate) || 0;
  const currency = dbOrder.currency || 'NGN';
  const foreignRate = currency === 'USDT' ? Number(rawForeignRate.toFixed(4)) : rawForeignRate;
  const rawActualPaid = Number(dbOrder.actual_payment) || 0;
  const fee = Number(dbOrder.fee) || 0;
  const effectiveCardWorth = Number(dbOrder.amount) || 0;

  const isLegacy = rawCardValue === 0 && rawCardRate === 0 && effectiveCardWorth > 0;

  const cardValue = isLegacy ? effectiveCardWorth : rawCardValue;
  const cardRate = isLegacy ? 1 : rawCardRate;
  const cardWorth = isLegacy ? effectiveCardWorth : (calculateCardWorth(rawCardValue, rawCardRate) || effectiveCardWorth);

  const actualPaid = rawActualPaid > 0
    ? rawActualPaid
    : (isLegacy && effectiveCardWorth > 0 && foreignRate > 0
        ? effectiveCardWorth * foreignRate
        : 0);

  const paymentValue = calculatePaymentValue(actualPaid, foreignRate, fee, currency);
  const profit = Number(dbOrder.profit_ngn) || calculateProfit(cardWorth, paymentValue);
  const profitRate = calculateProfitRate(profit, cardWorth);

  return {
    id: String(dbOrder.order_number || dbOrder.id || ''),
    dbId: String(dbOrder.id || ''),
    createdAt: formatBeijingTime(dbOrder.created_at),
    cardType: dbOrder.order_type || '',
    cardValue,
    cardRate,
    foreignRate,
    cardWorth,
    actualPaid,
    fee,
    paymentValue,
    // vendor_id 在库中外键指向 vendors（卡商）；代付商家写入 payment_provider。旧数据曾把代付 UUID 误写入 vendor_id。
    paymentProvider: String(dbOrder.payment_provider ?? '').trim() || String(dbOrder.vendor_id ?? ''),
    vendor: String(dbOrder.card_merchant_id ?? '').trim() || String(dbOrder.vendor_id ?? ''),
    profit,
    profitRate,
    phoneNumber: String(dbOrder.phone_number ?? ''),
    memberCode: dbOrder.member_code_snapshot || '',
    demandCurrency: currency,
    salesPerson,
    remark: dbOrder.remark || '',
    status: dbOrder.status as "active" | "cancelled" | "completed",
    order_points: Number(dbOrder.order_points) || 0,
    points_status: (dbOrder.points_status || 'none') as PointsStatus,
  };
}

/** 会员端「我的订单」展示：与员工端订单管理同一套面值/实付/订单号计算逻辑 */
export interface MemberPortalOrderView {
  dbId: string;
  orderNumber: string;
  createdAt: string;
  cardTypeId: string;
  /** 后端 JOIN gift_cards.name；会员端无 nameResolver 卡缓存时用于展示 */
  cardDisplayName: string;
  faceValue: number;
  actualPaid: number;
  currency: string;
  isUsdt: boolean;
  /** 订单生命周期，会员订单列表筛选用 */
  status: "active" | "cancelled" | "completed";
}

export function mapDbRowToMemberPortalOrderView(dbOrder: any): MemberPortalOrderView {
  const currency = String(dbOrder?.currency || 'NGN');
  const isUsdt = currency === 'USDT';
  const dbId = String(dbOrder?.id || '');
  const orderNumber = formatMemberOrderNumberForDisplay(dbOrder?.order_number, dbOrder?.id);
  const createdAt = formatMemberLocalTime(dbOrder?.created_at);
  const cardTypeId = dbOrder?.order_type || '';
  const giftName = String(dbOrder?.gift_card_name ?? '').trim();
  const cardNameSnapshot = String(dbOrder?.card_name ?? '').trim();
  const bestName = giftName || cardNameSnapshot;

  if (isUsdt) {
    const rawCardRate = Number(dbOrder.exchange_rate) || Number(dbOrder.rate) || 0;
    const rawCardValue = Number(dbOrder.card_value) || 0;
    const actualPaidUsdt = Number(dbOrder.actual_payment) || 0;
    const effectiveCardWorth = Number(dbOrder.amount) || 0;
    const isLegacy = rawCardValue === 0 && rawCardRate === 0 && effectiveCardWorth > 0;
    const cardValue = isLegacy ? effectiveCardWorth : rawCardValue;
    return {
      dbId,
      orderNumber,
      createdAt,
      cardTypeId,
      cardDisplayName: bestName || String(cardTypeId || '').trim(),
      faceValue: cardValue,
      actualPaid: actualPaidUsdt,
      currency: 'USDT',
      isUsdt: true,
      status,
    };
  }

  const o = mapDbOrderToOrder(dbOrder);
  return {
    dbId,
    orderNumber,
    createdAt,
    cardTypeId: o.cardType,
    cardDisplayName: bestName || String(o.cardType || '').trim(),
    faceValue: o.cardValue,
    actualPaid: o.actualPaid,
    currency: o.demandCurrency,
    isUsdt: false,
    status,
  };
}

export function generateOrderNumber(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${mm}${dd}${rand}`;
}

/** 生成唯一订单号（短格式 12 位：MMDD + 8位随机字母数字） */
export async function generateUniqueOrderNumber(_maxRetries: number = 3): Promise<string> {
  return generateOrderNumber();
}

export async function mapOrderToDbAsync(
  order: Omit<Order, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'>,
  orderPoints: number,
  memberId?: string,
  employeeId?: string,
  memberCode?: string,
  tenantId?: string | null,
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
  const cardNameSnapshot = resolveCardName(order.cardType) || order.cardType || null;
  return {
    order_number: orderNumber,
    created_at: getNowBeijingISO(),
    order_type: cardTypeUuid,
    card_name: cardNameSnapshot,
    card_value: order.cardValue,
    exchange_rate: order.cardRate,
    foreign_rate: foreignRateValue,
    amount: order.cardWorth,
    actual_payment: order.actualPaid,
    fee: order.fee,
    payment_value: order.paymentValue,
    vendor_id: vendorUuid,
    card_merchant_id: vendorUuid,
    payment_provider: providerUuid ? String(providerUuid) : null,
    profit_ngn: isUsdt ? null : order.profit,
    profit_usdt: isUsdt ? order.profit : null,
    profit_rate: order.profitRate,
    phone_number: order.phoneNumber != null && String(order.phoneNumber).trim() !== '' ? String(order.phoneNumber).trim() : null,
    currency: order.demandCurrency,
    account_id: employeeId || null,
    creator_id: employeeId || null,
    sales_user_id: employeeId || null,
    member_id: memberId || null,
    member_code_snapshot: memberCode || null,
    remark: order.remark,
    status: 'completed',
    order_points: orderPoints,
    points_status: 'none',
    ...(tenantId ? { tenant_id: tenantId } : {}),
  };
}

/** USDT 订单写入 DB — 复用 mapOrderToDbAsync，避免与奈拉/赛地订单字段不同步 */
export async function mapUsdtOrderToDbAsync(
  orderData: Omit<UsdtOrder, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'>,
  orderPoints: number,
  memberId?: string,
  employeeId?: string,
  tenantId?: string | null,
): Promise<Record<string, unknown>> {
  const asOrder: Omit<Order, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'> = {
    createdAt: '',
    cardType: orderData.cardType,
    cardValue: orderData.cardValue,
    cardRate: orderData.cardRate,
    foreignRate: orderData.usdtRate,
    cardWorth: orderData.cardWorth,
    actualPaid: orderData.actualPaidUsdt,
    fee: orderData.feeUsdt,
    paymentValue: orderData.paymentValue,
    paymentProvider: orderData.paymentProvider,
    vendor: orderData.vendor,
    profit: orderData.profit,
    profitRate: orderData.profitRate,
    phoneNumber: orderData.phoneNumber,
    memberCode: orderData.memberCode,
    demandCurrency: 'USDT',
    salesPerson: orderData.salesPerson,
    remark: orderData.remark,
  };
  return mapOrderToDbAsync(asOrder, orderPoints, memberId, employeeId, orderData.memberCode, tenantId);
}
