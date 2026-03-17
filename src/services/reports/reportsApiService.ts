/**
 * Reports API Service - 报表数据
 * 替代 useReportData、AdminOverview 中的 Supabase 直连
 */
import { apiGet, unwrapApiData } from '@/api/client';

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

/** Dashboard 统计（5 秒缓存） */
export async function getDashboardStatsApi(tenantId?: string | null): Promise<DashboardStats> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiGet<DashboardStats | ApiResponse<DashboardStats>>(`/api/reports/dashboard${q}`);
  const data = unwrapApiData<DashboardStats>(res);
  return data ?? { tenants: 0, activeEmployees: 0, todayOrders: 0, pendingAudits: 0 };
}

export async function getDashboardTrendApi(params: {
  startDate: string;
  endDate: string;
  salesPerson?: string | null;
  tenantId?: string | null;
}): Promise<DashboardTrendResult> {
  const q = new URLSearchParams();
  q.set('startDate', params.startDate);
  q.set('endDate', params.endDate);
  if (params.salesPerson) q.set('salesPerson', params.salesPerson);
  if (params.tenantId) q.set('tenant_id', params.tenantId);
  const res = await apiGet<DashboardTrendResult | ApiResponse<DashboardTrendResult>>(
    `/api/reports/dashboard-trend?${q.toString()}`
  );
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

/** 订单报表 */
export async function getOrdersReportApi(params?: {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string | null;
}): Promise<any[]> {
  const q = new URLSearchParams();
  if (params?.startDate) q.set('startDate', params.startDate);
  if (params?.endDate) q.set('endDate', params.endDate);
  if (params?.creatorId) q.set('creatorId', params.creatorId);
  if (params?.tenantId) q.set('tenant_id', params.tenantId);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const res = await apiGet<any[] | ApiResponse<any[]>>(`/api/reports/orders${suffix}`);
  const data = unwrapApiData<any[]>(res);
  return Array.isArray(data) ? data : [];
}

/** 活动赠送报表 */
export async function getActivityGiftsReportApi(params?: {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string | null;
}): Promise<any[]> {
  const q = new URLSearchParams();
  if (params?.startDate) q.set('startDate', params.startDate);
  if (params?.endDate) q.set('endDate', params.endDate);
  if (params?.creatorId) q.set('creatorId', params.creatorId);
  if (params?.tenantId) q.set('tenant_id', params.tenantId);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const res = await apiGet<any[] | ApiResponse<any[]>>(`/api/reports/activity-gifts${suffix}`);
  const data = unwrapApiData<any[]>(res);
  return Array.isArray(data) ? data : [];
}

/** 报表基础数据（员工列表） */
export async function getReportBaseDataApi(tenantId?: string | null): Promise<{ employees: any[] }> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiGet<{ employees: any[] } | ApiResponse<{ employees: any[] }>>(`/api/reports/base-data${q}`);
  const data = unwrapApiData<{ employees: any[] }>(res);
  return data ?? { employees: [] };
}
