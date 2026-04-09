/**
 * 维护设置 - 进行中任务 Hook - react-query 缓存，切换秒开
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveEmployeesByTenant } from '@/services/data/tableQueryService';
import { getOpenTasksResult } from '@/services/taskService';

const STALE_TIME = 30_000;

async function fetchOpenTasks(tenantId: string | null): Promise<{ id: string; title: string; created_at: string; total_items: number }[]> {
  if (!tenantId) return [];
  const result = await getOpenTasksResult(tenantId);
  if (!result.ok) return [];
  return result.data;
}

async function fetchTaskSettingsEmployees(tenantId: string | null): Promise<{ id: string; real_name: string }[]> {
  if (!tenantId) return [];
  const data = await getActiveEmployeesByTenant(tenantId);
  return Array.isArray(data) ? data : [];
}

export function useOpenTasks(tenantId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['open-tasks', tenantId ?? ''],
    queryFn: () => fetchOpenTasks(tenantId),
    enabled: !!tenantId,
    staleTime: STALE_TIME,
    retry: 2,
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
    retry: 2,
  });

  return {
    employees: query.data ?? [],
  };
}
