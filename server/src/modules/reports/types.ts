export interface DashboardStats {
  tenants: number;
  activeEmployees: number;
  todayOrders: number;
  pendingAudits: number;
}

export interface DashboardTrendRow {
  date: string;
  orders: number;
  profit: number;
  users: number;
  ngnVolume: number;
  ghsVolume: number;
  usdtVolume: number;
  ngnProfit: number;
  ghsProfit: number;
  usdtProfit: number;
}

export interface DashboardTrendSummary {
  totalOrders: number;
  tradingUsers: number;
  ngnVolume: number;
  ghsVolume: number;
  usdtVolume: number;
  ngnProfit: number;
  ghsProfit: number;
  usdtProfit: number;
}

export interface DashboardTrendResult {
  rows: DashboardTrendRow[];
  summary: DashboardTrendSummary;
}

export interface OrdersReportQuery {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string;
}

export interface ActivityGiftsReportQuery {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string;
}
