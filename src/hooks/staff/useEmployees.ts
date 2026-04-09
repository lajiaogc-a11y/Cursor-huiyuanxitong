// ============= Employees Hook - query 驱动 =============
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { STALE_TIME_LIST_MS } from '@/lib/reactQueryPolicy';
import { fetchEmployeesFromDb } from '@/services/employees/employeeHelpers';
import type { Employee } from '@/services/employees/employeeHelpers';

export type { Employee } from '@/services/employees/employeeHelpers';
export {
  getEmployeeNameSync,
  getEmployeeSync,
  batchLoadEmployeeNames,
  fetchEmployeesFromDb,
  getEmployeeNameAsync,
  refreshEmployeesCache,
  preloadTenantEmployeesIntoCache,
} from '@/services/employees/employeeHelpers';

export function useEmployees() {
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantId || null)
    : (viewingTenantId || employee?.tenant_id || null);

  const { data: employees = [], isLoading: loading } = useQuery<Employee[]>({
    queryKey: ['employees', effectiveTenantId],
    queryFn: () => fetchEmployeesFromDb(effectiveTenantId),
    staleTime: STALE_TIME_LIST_MS,
  });

  const getEmployeeName = useCallback((employeeId: string | null): string => {
    if (!employeeId) return '-';
    const emp = employees.find(e => e.id === employeeId);
    return emp?.realName || '-';
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
