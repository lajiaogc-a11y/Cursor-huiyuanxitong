/**
 * Reports / Dashboard shared types
 */

export interface DashboardReport {
  total_members: number;
  total_orders: number;
  total_revenue: number;
  [key: string]: unknown;
}

export interface DashboardTrend {
  date: string;
  orders: number;
  revenue: number;
  members: number;
  [key: string]: unknown;
}

export interface OrdersReport {
  [key: string]: unknown;
}

export interface ActivityGiftsReport {
  [key: string]: unknown;
}

export interface BaseDataReport {
  [key: string]: unknown;
}
