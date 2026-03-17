/**
 * 员工 API - 通过后端 JWT 认证
 */
import { apiClient } from '@/lib/apiClient';

export interface ApiEmployee {
  id: string;
  username: string;
  real_name: string;
  role: string;
  status: string;
  visible?: boolean;
  is_super_admin?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ListEmployeesParams {
  tenant_id?: string;
}

export interface EmployeeUniqueResult {
  usernameExists: boolean;
  realNameExists: boolean;
}

export interface EmployeeMutationPayload {
  tenant_id?: string | null;
  username?: string;
  real_name?: string;
  role?: 'admin' | 'manager' | 'staff';
  password?: string;
  status?: 'active' | 'disabled' | 'pending';
  visible?: boolean;
  change_reason?: string;
}

export async function listEmployeesApi(params?: ListEmployeesParams): Promise<ApiEmployee[]> {
  const q = new URLSearchParams();
  if (params?.tenant_id) q.set('tenant_id', params.tenant_id);
  const query = q.toString();
  const res = await apiClient.get<ApiEmployee[] | { success?: boolean; data?: ApiEmployee[] }>(
    `/api/employees${query ? `?${query}` : ''}`
  );
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object' && 'data' in res) return (res as { data?: ApiEmployee[] }).data ?? [];
  return [];
}

export async function checkEmployeeUniqueApi(params: {
  username?: string;
  real_name?: string;
  exclude_id?: string;
}): Promise<EmployeeUniqueResult> {
  const q = new URLSearchParams();
  if (params.username) q.set('username', params.username);
  if (params.real_name) q.set('real_name', params.real_name);
  if (params.exclude_id) q.set('exclude_id', params.exclude_id);
  const res = await apiClient.get<{ data?: EmployeeUniqueResult }>(`/api/employees/check-unique?${q.toString()}`);
  const data = (res as { data?: EmployeeUniqueResult })?.data ?? (res as unknown as EmployeeUniqueResult);
  return {
    usernameExists: !!data?.usernameExists,
    realNameExists: !!data?.realNameExists,
  };
}

export async function createEmployeeApi(payload: Required<Pick<EmployeeMutationPayload, 'username' | 'real_name' | 'role' | 'password'>> & Pick<EmployeeMutationPayload, 'tenant_id'>): Promise<ApiEmployee> {
  const res = await apiClient.post<ApiEmployee | { data?: ApiEmployee }>('/api/employees', payload);
  const data = (res && typeof res === 'object' && 'data' in res) ? (res as { data?: ApiEmployee }).data : res;
  return data as ApiEmployee;
}

export async function updateEmployeeApi(employeeId: string, payload: EmployeeMutationPayload): Promise<ApiEmployee> {
  const res = await apiClient.patch<ApiEmployee | { data?: ApiEmployee }>(`/api/employees/${encodeURIComponent(employeeId)}`, payload);
  const data = (res && typeof res === 'object' && 'data' in res) ? (res as { data?: ApiEmployee }).data : res;
  return data as ApiEmployee;
}

export async function getEmployeeApi(employeeId: string): Promise<ApiEmployee | null> {
  const res = await apiClient.get<ApiEmployee | { data?: ApiEmployee }>(`/api/employees/${encodeURIComponent(employeeId)}`);
  const data = (res && typeof res === 'object' && 'data' in res) ? (res as { data?: ApiEmployee }).data : res;
  return (data as ApiEmployee | null) ?? null;
}

export async function getEmployeeNameHistoryApi(employeeId: string): Promise<Array<{
  id: string;
  employee_id: string;
  old_name: string;
  new_name: string;
  changed_by: string | null;
  changed_by_name?: string;
  changed_at: string;
  reason: string | null;
}>> {
  const res = await apiClient.get<unknown>(`/api/employees/${encodeURIComponent(employeeId)}/name-history`);
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? raw as any[] : ((raw.data as any[]) ?? []);
}

export async function deleteEmployeeApi(employeeId: string): Promise<boolean> {
  const res = await apiClient.delete<{ success?: boolean }>(`/api/employees/${encodeURIComponent(employeeId)}`);
  return !!(res && typeof res === 'object' && (res as { success?: boolean }).success);
}

export async function toggleEmployeeStatusApi(employeeId: string): Promise<{ status: 'active' | 'disabled' } | null> {
  const res = await apiClient.patch<{ data?: { status: 'active' | 'disabled' } }>(
    `/api/employees/${encodeURIComponent(employeeId)}/status`,
    {}
  );
  return ((res as { data?: { status: 'active' | 'disabled' } })?.data ?? (res as { status: 'active' | 'disabled' })) ?? null;
}

export async function resetEmployeePasswordApi(employeeId: string, newPassword: string): Promise<boolean> {
  const res = await apiClient.post<{ success?: boolean }>(
    `/api/employees/${encodeURIComponent(employeeId)}/reset-password`,
    { new_password: newPassword }
  );
  return !!(res && typeof res === 'object' && (res as { success?: boolean }).success);
}

export async function forceLogoutEmployeeApi(employeeId: string, reason?: string): Promise<boolean> {
  const res = await apiClient.post<{ success?: boolean }>(
    `/api/employees/${encodeURIComponent(employeeId)}/force-logout`,
    { reason }
  );
  return !!(res && typeof res === 'object' && (res as { success?: boolean }).success);
}

export async function listActiveVisibleEmployeesApi(params?: ListEmployeesParams): Promise<Array<{ id: string; real_name: string }>> {
  const q = new URLSearchParams();
  if (params?.tenant_id) q.set('tenant_id', params.tenant_id);
  const res = await apiClient.get<unknown>(`/api/employees/active-visible${q.toString() ? `?${q.toString()}` : ''}`);
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? raw as any[] : ((raw.data as Array<{ id: string; real_name: string }>) ?? []);
}
