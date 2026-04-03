// 订单相关类型定义 - 从 useOrders 提取，不修改业务逻辑

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
  /** 美卡专区（赛地/奈拉）列表，数据源为 meika_zone_order_links */
  listVariant?: 'standard' | 'meika-fiat';
  /** 为 false 时不请求（用于订单管理多 Tab 懒加载） */
  enabled?: boolean;
}

export interface UseUsdtOrdersOptions {
  page?: number;
  pageSize?: number;
  filters?: OrderFilters;
  /** 美卡专区 USDT 列表 */
  listVariant?: 'standard' | 'meika-usdt';
  enabled?: boolean;
}

export const PAGE_SIZE = 50;
