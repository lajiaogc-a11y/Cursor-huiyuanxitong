/**
 * Tenants API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost, apiPatch } from './client';
import type { Tenant, CreateTenantBody, UpdateTenantBody } from '@/types/tenants';

export const tenantsApi = {
  list: () => apiGet<Tenant[]>('/api/tenants'),
  create: (data: CreateTenantBody) => apiPost<Tenant>('/api/tenants', data),
  setSuperAdmin: (data: { tenant_id: string; user_id: string }) =>
    apiPost<{ success: boolean }>('/api/tenants/super-admin', data),
  update: (id: string, data: UpdateTenantBody) =>
    apiPatch<Tenant>(`/api/tenants/${encodeURIComponent(id)}`, data),
  resetAdminPassword: (id: string, data: { new_password: string }) =>
    apiPost<{ success: boolean }>(`/api/tenants/${encodeURIComponent(id)}/reset-admin-password`, data),
  delete: (id: string, data: { password: string }) =>
    apiPost<{ success: boolean }>(`/api/tenants/${encodeURIComponent(id)}/delete`, data),
  checkConflicts: (data: Record<string, unknown>) =>
    apiPost<unknown>('/api/tenants/check-conflicts', data),
  getMyDashboardTrend: (data: Record<string, unknown>) =>
    apiPost<unknown[]>('/api/tenants/my-dashboard-trend', data),
  getDashboardTrend: (data: Record<string, unknown>) =>
    apiPost<unknown[]>('/api/tenants/dashboard-trend', data),
  getPlatformDashboardTrend: (data: Record<string, unknown>) =>
    apiPost<unknown[]>('/api/tenants/platform-dashboard-trend', data),
  getOverview: (data: Record<string, unknown>) =>
    apiPost<unknown>('/api/tenants/overview', data),
  getOrders: (data: Record<string, unknown>) =>
    apiPost<unknown[]>('/api/tenants/orders', data),
  getMembers: (data: Record<string, unknown>) =>
    apiPost<unknown[]>('/api/tenants/members', data),
};
