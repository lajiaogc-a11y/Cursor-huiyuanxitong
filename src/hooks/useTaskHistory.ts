/**
 * 维护历史 Hook - 优先使用后端 API（绕过 RLS），失败时回退 Supabase
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getTaskProgressListResult, type TaskProgressOverview } from '@/services/taskService';
import { listEmployeesApi } from '@/api/employees';
import { getTaskProgressApi } from '@/api/tasks';

const STALE_TIME = 5 * 60 * 1000;

async function fetchTaskHistory(params: {
  tenantId: string | null;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<TaskProgressOverview[]> {
  const { tenantId, employeeId, startDate, endDate } = params;
  if (!tenantId) return [];
  try {
    const data = await getTaskProgressApi({
      tenant_id: tenantId,
      employee_id: employeeId && employeeId !== 'all' ? employeeId : undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    });
    return data;
  } catch (_) {
    const result = await getTaskProgressListResult({
      tenantId,
      employeeId: employeeId && employeeId !== 'all' ? employeeId : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    if (!result.ok) return [];
    return result.data;
  }
}

async function fetchTaskEmployees(tenantId: string | null): Promise<{ id: string; real_name: string }[]> {
  if (!tenantId) return [];
  try {
    const list = await listEmployeesApi({ tenant_id: tenantId });
    if (list?.length) {
      return list
        .filter((e) => e.status === 'active')
        .map((e) => ({ id: e.id, real_name: e.real_name || '' }))
        .sort((a, b) => (a.real_name || '').localeCompare(b.real_name || ''));
    }
  } catch (_) {}
  const { data } = await supabase
    .from('employees')
    .select('id, real_name')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('real_name');
  return (data || []).map((e: { id: string; real_name: string }) => ({ id: e.id, real_name: e.real_name || '' }));
}

export function useTaskHistory(
  tenantId: string | null,
  filters: { employeeId?: string; startDate?: string; endDate?: string }
) {
  const query = useQuery({
    queryKey: ['task-history', tenantId ?? '', filters.employeeId ?? '', filters.startDate ?? '', filters.endDate ?? ''],
    queryFn: () =>
      fetchTaskHistory({
        tenantId,
        employeeId: filters.employeeId,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    enabled: !!tenantId,
    staleTime: STALE_TIME,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return {
    overviews: query.data ?? [],
    loading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useTaskHistoryEmployees(tenantId: string | null) {
  const query = useQuery({
    queryKey: ['task-history-employees', tenantId ?? ''],
    queryFn: () => fetchTaskEmployees(tenantId),
    enabled: !!tenantId,
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return {
    employees: query.data ?? [],
  };
}
