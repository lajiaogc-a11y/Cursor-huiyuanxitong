/**
 * Reports API Client — 纯 HTTP 请求层
 */
import { apiGet } from './client';

export const reportsApi = {
  getDashboard: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown>(`/api/reports/dashboard${q}`);
  },
  getDashboardTrend: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown>(`/api/reports/dashboard-trend${q}`);
  },
  getOrdersReport: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown>(`/api/reports/orders${q}`);
  },
  getActivityGiftsReport: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown>(`/api/reports/activity-gifts${q}`);
  },
  getBaseData: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<unknown>(`/api/reports/base-data${q}`);
  },
};
