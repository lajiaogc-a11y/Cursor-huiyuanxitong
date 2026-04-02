/**
 * Reports Service - 报表业务逻辑
 */
import {
  getDashboardStatsRepository,
  getDashboardTrendRepository,
  getOrdersReportRepository,
  getActivityGiftsReportRepository,
  getReportBaseEmployeesRepository,
} from './repository.js';

const DASHBOARD_CACHE_MS = 5000;
const dashboardCache = new Map<string, { data: any; ts: number }>();

export async function getDashboardStatsService(
  tenantId?: string | null,
  isPlatformAdmin?: boolean
) {
  const now = Date.now();
  const cacheKey = `${isPlatformAdmin ? 'platform' : 'tenant'}:${tenantId ?? 'all'}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached && now - cached.ts < DASHBOARD_CACHE_MS) {
    return cached.data;
  }
  const data = await getDashboardStatsRepository(tenantId, isPlatformAdmin);
  dashboardCache.set(cacheKey, { data, ts: now });
  return data;
}

export async function getOrdersReportService(params: {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string;
}) {
  return getOrdersReportRepository(params);
}

export async function getDashboardTrendService(params: {
  startDate: string;
  endDate: string;
  salesPerson?: string | null;
  tenantId?: string | null;
}) {
  return getDashboardTrendRepository(params);
}

export async function getActivityGiftsReportService(params: {
  startDate?: string;
  endDate?: string;
  creatorId?: string;
  tenantId?: string;
}) {
  return getActivityGiftsReportRepository(params);
}

export async function getReportBaseEmployeesService(tenantId?: string | null) {
  return getReportBaseEmployeesRepository(tenantId);
}
