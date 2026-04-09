/**
 * 订单类型定义 — 业务层唯一来源
 * 原始位置: hooks/orders/types.ts（已改为 re-export）
 */

export type PointsStatus = 'none' | 'added' | 'reversed';

export interface OrderResult {
  order: Order | null;
  earnedPoints: number;
}

export interface Order {
  id: string;
  dbId: string;
  createdAt: string;
  cardType: string;
  cardValue: number;
  cardRate: number;
  foreignRate: number;
  cardWorth: number;
  actualPaid: number;
  fee: number;
  paymentValue: number;
  paymentProvider: string;
  vendor: string;
  profit: number;
  profitRate: number;
  phoneNumber: string;
  memberCode: string;
  demandCurrency: string;
  salesPerson: string;
  remark: string;
  status: "active" | "cancelled" | "completed";
  order_points: number;
  points_status: PointsStatus;
}

export interface UsdtOrder {
  id: string;
  dbId: string;
  createdAt: string;
  cardType: string;
  cardValue: number;
  cardRate: number;
  cardWorth: number;
  usdtRate: number;
  totalValueUsdt: number;
  actualPaidUsdt: number;
  feeUsdt: number;
  paymentValue: number;
  profit: number;
  profitRate: number;
  vendor: string;
  paymentProvider: string;
  phoneNumber: string;
  memberCode: string;
  demandCurrency: string;
  salesPerson: string;
  remark: string;
  status: "active" | "cancelled" | "completed";
  order_points: number;
  points_status: PointsStatus;
}

export interface OrderFilters {
  status?: string;
  currency?: string;
  vendor?: string;
  paymentProvider?: string;
  cardType?: string;
  creatorId?: string;
  minProfit?: number;
  maxProfit?: number;
  dateRange?: { start: Date; end: Date };
  searchTerm?: string;
}

export interface UseOrdersOptions {
  page?: number;
  pageSize?: number;
  filters?: OrderFilters;
  listVariant?: 'standard' | 'meika-fiat';
  enabled?: boolean;
}

export interface UseUsdtOrdersOptions {
  page?: number;
  pageSize?: number;
  filters?: OrderFilters;
  listVariant?: 'standard' | 'meika-usdt';
  enabled?: boolean;
}

export const PAGE_SIZE = 50;
