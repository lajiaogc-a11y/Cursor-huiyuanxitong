import { listEmployeesApi } from '@/api/employees';
import { getEmployeeById, getEmployeeNameById, getEmployeeNameByIdAsync, refreshEmployees } from '@/services/members/nameResolver';

export interface Employee {
  id: string;
  username: string;
  realName: string;
  role: 'admin' | 'manager' | 'staff';
  status: string;
}

export function getEmployeeNameSync(employeeId: string | null): string {
  return getEmployeeNameById(employeeId);
}

export function getEmployeeSync(employeeId: string | null): Employee | null {
  const employee = getEmployeeById(employeeId);
  if (!employee) return null;
  return {
    id: employee.id,
    username: employee.username,
    realName: employee.realName,
    role: employee.role,
    status: employee.status,
  };
}

export async function batchLoadEmployeeNames(employeeIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const id of employeeIds.filter(Boolean)) {
    const name = await getEmployeeNameByIdAsync(id);
    result.set(id, name);
  }
  return result;
}

export async function fetchEmployeesFromDb(tenantId: string | null): Promise<Employee[]> {
  const params = tenantId ? { tenant_id: tenantId } : undefined;
  const data = await listEmployeesApi(params);
  return (data || []).map((emp: any) => ({
    id: emp.id,
    username: emp.username || '',
    realName: emp.real_name || '',
    role: (emp.role || 'staff') as 'admin' | 'manager' | 'staff',
    status: emp.status || 'active',
  }));
}

export async function getEmployeeNameAsync(employeeId: string | null): Promise<string> {
  return getEmployeeNameByIdAsync(employeeId);
}

export async function refreshEmployeesCache(): Promise<void> {
  await refreshEmployees();
}

export async function preloadTenantEmployeesIntoCache(tenantId: string): Promise<void> {
  try {
    await fetchEmployeesFromDb(tenantId);
    await refreshEmployees();
  } catch (e) {
    console.error('[preloadTenantEmployeesIntoCache] Failed:', e);
    throw e;
  }
}
