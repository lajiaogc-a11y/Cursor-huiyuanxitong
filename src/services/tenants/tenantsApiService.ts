/**
 * Tenants API Service - 通过 Backend API 获取租户列表
 */
import { tenantsApi } from '@/api/tenants';
import { unwrapApiData } from '@/api/client';

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
  const res = await tenantsApi.list();
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
  const res = await tenantsApi.create(params as any);
  return unwrapApiData<any>(res) ?? {};
}

export async function updateTenantApi(tenantId: string, params: {
  tenantCode: string;
  tenantName: string;
  status: string;
}): Promise<void> {
  await tenantsApi.update(tenantId, params as any);
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
  const res = await tenantsApi.resetAdminPassword(tenantId, params as any);
  return unwrapApiData<any>(res) ?? {};
}

export async function deleteTenantApi(tenantId: string, params: {
  force?: boolean;
  password: string;
}): Promise<{ detail?: string }> {
  const res = await tenantsApi.delete(tenantId, params);
  return unwrapApiData<{ detail?: string }>(res) ?? {};
}

export async function setTenantSuperAdminApi(employeeId: string): Promise<void> {
  await tenantsApi.setSuperAdmin({ tenant_id: '', user_id: employeeId });
}
