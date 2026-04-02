// ============= Employees Hook - query 驱动 =============
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { listEmployeesApi } from '@/api/employees';
import { STALE_TIME_LIST_MS } from '@/lib/reactQueryPolicy';
import { getEmployeeById, getEmployeeNameById, getEmployeeNameByIdAsync, refreshEmployees } from '@/services/members/nameResolver';

export interface Employee {
  id: string;
  username: string;
  realName: string;
  role: 'admin' | 'manager' | 'staff';
  status: string;
}

// 同步姓名解析：统一走 NameResolver，避免 hooks + 内存缓存 + query 三轨并存
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

// Standalone fetch function - 通过后端 API 获取，租户员工可正确看到本租户数据
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

// React Hook for employees
export function useEmployees() {
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  // 平台总管理：viewingTenantId 或 null；租户员工：viewingTenantId || employee.tenant_id，避免 useEffect 未执行时看不到数据
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantId || null)
    : (viewingTenantId || employee?.tenant_id || null);

  const { data: employees = [], isLoading: loading } = useQuery({
    queryKey: ['employees', effectiveTenantId],
    queryFn: () => fetchEmployeesFromDb(effectiveTenantId),
    staleTime: STALE_TIME_LIST_MS,
  });

  const getEmployeeName = useCallback((employeeId: string | null): string => {
    if (!employeeId) return '-';
    const employee = employees.find(e => e.id === employeeId);
    return employee?.realName || '-';
  }, [employees]);

  const getEmployeeById = useCallback((employeeId: string | null): Employee | null => {
    if (!employeeId) return null;
    return employees.find(e => e.id === employeeId) || null;
  }, [employees]);

  const employeeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach(emp => {
      map[emp.id] = emp.realName;
    });
    return map;
  }, [employees]);

  return {
    employees,
    loading,
    getEmployeeName,
    getEmployeeById,
    employeeNameMap,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  };
}

// 异步获取员工姓名
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
