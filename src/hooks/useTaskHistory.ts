/**
 * 维护历史 Hook - react-query 缓存，切换秒开
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getTaskProgressList, type TaskProgressOverview } from '@/services/taskService';

const STALE_TIME = 5 * 60 * 1000;

async function fetchTaskHistory(params: {
  tenantId: string | null;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<TaskProgressOverview[]> {
  const { tenantId, employeeId, startDate, endDate } = params;
  if (!tenantId) return [];
  return getTaskProgressList({
    tenantId,
    employeeId: employeeId && employeeId !== 'all' ? employeeId : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });
}

async function fetchTaskEmployees(tenantId: string | null): Promise<{ id: string; real_name: string }[]> {
  if (!tenantId) return [];
  const { data } = await supabase
    .from('employees')
    .select('id, real_name')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('real_name');
  return data || [];
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
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return {
    overviews: query.data ?? [],
    loading: query.isLoading,
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
