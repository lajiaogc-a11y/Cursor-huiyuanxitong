/**
 * Tenants API Service - 通过 Backend API 获取租户列表
 */
import { apiGet, apiPatch, apiPost, unwrapApiData } from '@/api/client';

export interface ApiTenant {
  id: string;
  tenant_code: string;
  tenant_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  admin_employee_id?: string | null;
  admin_username?: string | null;
  admin_real_name?: string | null;
  admin_count?: number | null;
}

/** 获取租户列表（仅平台总管理员） */
export async function listTenantsApi(): Promise<ApiTenant[]> {
  const res = await apiGet<ApiTenant[] | { success?: boolean; data?: ApiTenant[] }>('/api/tenants');
  const data = unwrapApiData<ApiTenant[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function createTenantApi(params: {
  tenantCode: string;
  tenantName: string;
  adminUsername: string;
  adminRealName: string;
  adminPassword: string;
}): Promise<{
  tenantId?: string;
  adminEmployeeId?: string;
  authSyncSuccess?: boolean;
  authSyncMessage?: string;
}> {
  const res = await apiPost<{
    tenantId?: string;
    adminEmployeeId?: string;
    authSyncSuccess?: boolean;
    authSyncMessage?: string;
  } | { success?: boolean; data?: any }>('/api/tenants', params);
  return unwrapApiData<any>(res) ?? {};
}

export async function updateTenantApi(tenantId: string, params: {
  tenantCode: string;
  tenantName: string;
  status: string;
}): Promise<void> {
  await apiPatch(`/api/tenants/${encodeURIComponent(tenantId)}`, params);
}

export async function resetTenantAdminPasswordApi(tenantId: string, params: {
  adminEmployeeId?: string | null;
  newPassword: string;
}): Promise<{
  adminEmployeeId?: string;
  adminUsername?: string;
  adminRealName?: string;
  authSyncSuccess?: boolean;
  authSyncMessage?: string;
}> {
  const res = await apiPost<{
    adminEmployeeId?: string;
    adminUsername?: string;
    adminRealName?: string;
    authSyncSuccess?: boolean;
    authSyncMessage?: string;
  } | { success?: boolean; data?: any }>(
    `/api/tenants/${encodeURIComponent(tenantId)}/reset-admin-password`,
    params
  );
  return unwrapApiData<any>(res) ?? {};
}

export async function deleteTenantApi(tenantId: string, params: {
  force?: boolean;
  password: string;
}): Promise<{ detail?: string }> {
  const res = await apiPost<{ detail?: string } | { success?: boolean; data?: { detail?: string } }>(
    `/api/tenants/${encodeURIComponent(tenantId)}/delete`,
    params
  );
  return unwrapApiData<{ detail?: string }>(res) ?? {};
}

export async function setTenantSuperAdminApi(employeeId: string): Promise<void> {
  await apiPost('/api/tenants/super-admin', { employeeId });
}
