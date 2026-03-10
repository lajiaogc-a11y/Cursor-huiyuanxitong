// ============= Employees Hook - react-query Migration =============
// 提供员工ID到姓名的映射，用于页面显示时实时获取员工姓名
// react-query 缓存确保页面切换时不重复请求

import { useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenantView } from '@/contexts/TenantViewContext';
import { getTenantEmployeesFull } from '@/services/tenantService';

export interface Employee {
  id: string;
  username: string;
  realName: string;
  role: 'admin' | 'manager' | 'staff';
  status: string;
}

// 内存缓存（供同步 API 使用）
let employeesCache: Map<string, Employee> = new Map();
let cacheInitialized = false;

// 初始化缓存
async function initializeCache(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('id, username, real_name, role, status');
    
    if (error) throw error;
    
    (data || []).forEach(emp => {
      employeesCache.set(emp.id, {
        id: emp.id,
        username: emp.username,
        realName: emp.real_name,
        role: emp.role as 'admin' | 'manager' | 'staff',
        status: emp.status,
      });
    });
    
    cacheInitialized = true;
  } catch (error) {
    console.error('[Employees] Failed to initialize cache:', error);
  }
}

// 同步获取员工姓名（从缓存）
export function getEmployeeNameSync(employeeId: string | null): string {
  if (!employeeId) return '-';
  if (!cacheInitialized) {
    initializeCache();
  }
  const employee = employeesCache.get(employeeId);
  return employee?.realName || '-';
}

// 同步获取员工信息（从缓存）
export function getEmployeeSync(employeeId: string | null): Employee | null {
  if (!employeeId) return null;
  if (!cacheInitialized) {
    initializeCache();
  }
  return employeesCache.get(employeeId) || null;
}

// 🔧 批量预加载员工姓名
export async function batchLoadEmployeeNames(employeeIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const idsToFetch: string[] = [];
  
  for (const id of employeeIds) {
    if (!id) continue;
    const cached = employeesCache.get(id);
    if (cached) {
      result.set(id, cached.realName);
    } else {
      idsToFetch.push(id);
    }
  }
  
  if (idsToFetch.length > 0) {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, real_name')
        .in('id', idsToFetch);
      
      if (!error && data) {
        for (const emp of data) {
          result.set(emp.id, emp.real_name);
          if (!employeesCache.has(emp.id)) {
            employeesCache.set(emp.id, {
              id: emp.id,
              username: '',
              realName: emp.real_name,
              role: 'staff',
              status: 'active',
            });
          }
        }
      }
    } catch (error) {
      console.error('[batchLoadEmployeeNames] Failed:', error);
    }
  }
  
  return result;
}

// Standalone fetch function (used by useQuery and prefetch)
export async function fetchEmployeesFromDb(tenantId: string | null): Promise<Employee[]> {
  if (tenantId) {
    const data = await getTenantEmployeesFull(tenantId);
    const empList = (data || []).map((emp: any) => ({
      id: emp.id,
      username: emp.username || '',
      realName: emp.real_name || '',
      role: (emp.role || 'staff') as 'admin' | 'manager' | 'staff',
      status: emp.status || 'active',
    }));
    employeesCache.clear();
    empList.forEach(emp => employeesCache.set(emp.id, emp));
    cacheInitialized = true;
    return empList;
  }

  const { data, error } = await supabase
    .from('employees')
    .select('id, username, real_name, role, status')
    .order('created_at', { ascending: false });

  if (error) throw error;
  
  const empList = (data || []).map(emp => ({
    id: emp.id,
    username: emp.username,
    realName: emp.real_name,
    role: emp.role as 'admin' | 'manager' | 'staff',
    status: emp.status,
  }));
  
  // Sync module-level cache
  employeesCache.clear();
  empList.forEach(emp => employeesCache.set(emp.id, emp));
  cacheInitialized = true;
  
  return empList;
}

// React Hook for employees
export function useEmployees() {
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};
  
  const { data: employees = [], isLoading: loading } = useQuery({
    queryKey: ['employees', viewingTenantId],
    queryFn: () => fetchEmployeesFromDb(viewingTenantId || null),
  });

  // Realtime subscription -> invalidate cache
  useEffect(() => {
    const channel = supabase
      .channel('employees-changes-for-name')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        queryClient.invalidateQueries({ queryKey: ['employees'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
  if (!employeeId) return '-';
  if (employeesCache.has(employeeId)) {
    return employeesCache.get(employeeId)!.realName;
  }
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('real_name')
      .eq('id', employeeId)
      .single();
    if (error) throw error;
    return data?.real_name || '-';
  } catch (error) {
    console.error('Failed to get employee name:', error);
    return '-';
  }
}

// 刷新缓存
export async function refreshEmployeesCache(): Promise<void> {
  cacheInitialized = false;
  await initializeCache();
}

// 平台查看租户模式：预加载指定租户的员工到缓存（供订单等显示销售员姓名）
export async function preloadTenantEmployeesIntoCache(tenantId: string): Promise<void> {
  try {
    const { data, error } = await (supabase.rpc as any)('platform_get_tenant_employees_full', {
      p_tenant_id: tenantId,
    });
    if (error) throw error;
    employeesCache.clear();
    (data || []).forEach((emp: any) => {
      employeesCache.set(emp.id, {
        id: emp.id,
        username: emp.username || '',
        realName: emp.real_name || '',
        role: (emp.role || 'staff') as 'admin' | 'manager' | 'staff',
        status: emp.status || 'active',
      });
    });
    cacheInitialized = true;
  } catch (e) {
    console.error('[preloadTenantEmployeesIntoCache] Failed:', e);
    throw e;
  }
}
