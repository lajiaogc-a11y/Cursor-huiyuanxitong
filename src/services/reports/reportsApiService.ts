/**
 * Reports API Service - 报表数据（经后端 API，替代旧版 useReportData 直连）
 */
import { reportsApi } from '@/api/reports';
import { unwrapApiData } from '@/api/client';

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

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export async function getDashboardStatsApi(tenantId?: string | null): Promise<DashboardStats> {
  const params = tenantId ? { tenant_id: tenantId } : undefined;
  const res = await reportsApi.getDashboard(params);
  const data = unwrapApiData<DashboardStats>(res);
  return data ?? { tenants: 0, activeEmployees: 0, todayOrders: 0, pendingAudits: 0 };
}

export async function getDashboardTrendApi(params: {
  startDate: string;
  endDate: string;
  salesPerson?: string | null;
  tenantId?: string | null;
}): Promise<DashboardTrendResult> {
  const q: Record<string, string> = { startDate: params.startDate, endDate: params.endDate };
  if (params.salesPerson) q.salesPerson = params.salesPerson;
  if (params.tenantId) q.tenant_id = params.tenantId;
  const res = await reportsApi.getDashboardTrend(q);
  const data = unwrapApiData<DashboardTrendResult>(res);
  return data ?? {
    rows: [],
    summary: {
      totalOrders: 0,
      tradingUsers: 0,
      ngnVolume: 0,
      ghsVolume: 0,
      usdtVolume: 0,
      ngnProfit: 0,
      ghsProfit: 0,
      usdtProfit: 0,
    },
  };
}

export async function getOrdersReportApi(params?: {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string | null;
}): Promise<any[]> {
  const q: Record<string, string> = {};
  if (params?.startDate) q.startDate = params.startDate;
  if (params?.endDate) q.endDate = params.endDate;
  if (params?.creatorId) q.creatorId = params.creatorId;
  if (params?.tenantId) q.tenant_id = params.tenantId;
  const res = await reportsApi.getOrdersReport(Object.keys(q).length ? q : undefined);
  const data = unwrapApiData<any[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getActivityGiftsReportApi(params?: {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string | null;
}): Promise<any[]> {
  const q: Record<string, string> = {};
  if (params?.startDate) q.startDate = params.startDate;
  if (params?.endDate) q.endDate = params.endDate;
  if (params?.creatorId) q.creatorId = params.creatorId;
  if (params?.tenantId) q.tenant_id = params.tenantId;
  const res = await reportsApi.getActivityGiftsReport(Object.keys(q).length ? q : undefined);
  const data = unwrapApiData<any[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getReportBaseDataApi(tenantId?: string | null): Promise<{ employees: any[] }> {
  const params = tenantId ? { tenant_id: tenantId } : undefined;
  const res = await reportsApi.getBaseData(params);
  const data = unwrapApiData<{ employees: any[] }>(res);
  return data ?? { employees: [] };
}
