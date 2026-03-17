/**
 * 维护设置 - 进行中任务 Hook - react-query 缓存，切换秒开
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getOpenTasksResult } from '@/services/taskService';
import { listEmployeesApi } from '@/api/employees';

const STALE_TIME = 5 * 60 * 1000;

async function fetchOpenTasks(tenantId: string | null): Promise<{ id: string; title: string; created_at: string; total_items: number }[]> {
  if (!tenantId) return [];
  const result = await getOpenTasksResult(tenantId);
  if (!result.ok) return [];
  return result.data;
}

async function fetchTaskSettingsEmployees(tenantId: string | null): Promise<{ id: string; real_name: string }[]> {
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

export function useOpenTasks(tenantId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['open-tasks', tenantId ?? ''],
    queryFn: () => fetchOpenTasks(tenantId),
    enabled: !!tenantId,
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['open-tasks', tenantId ?? ''] });

  return {
    openTasks: query.data ?? [],
    loading: query.isLoading,
    refetch,
  };
}

export function useTaskSettingsEmployees(tenantId: string | null, enabled = false) {
  const query = useQuery({
    queryKey: ['task-settings-employees', tenantId ?? ''],
    queryFn: () => fetchTaskSettingsEmployees(tenantId),
    enabled: !!tenantId && enabled,
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return {
    employees: query.data ?? [],
  };
}
