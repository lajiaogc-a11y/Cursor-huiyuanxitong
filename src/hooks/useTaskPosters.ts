/**
 * 海报库 Hook - react-query 缓存，切换秒开
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/api/client';
import { getTaskPostersResult, type TaskPoster } from '@/services/taskService';

const STALE_TIME = 30_000;

async function fetchTaskPosters(tenantId: string | null): Promise<TaskPoster[]> {
  if (!tenantId) return [];
  const result = await getTaskPostersResult(tenantId);
  if (!result.ok) return [];
  return result.data;
}

async function fetchTaskEmployees(tenantId: string | null): Promise<{ id: string; real_name: string }[]> {
  if (!tenantId) return [];
  const data = await apiGet<{ id: string; real_name: string }[]>(
    `/api/data/table/employees?select=id,real_name&tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.active&order=real_name.asc`
  );
  return Array.isArray(data) ? data : [];
}

export function useTaskPosters(tenantId: string | null) {
  const queryClient = useQueryClient();

  const postersQuery = useQuery({
    queryKey: ['task-posters', tenantId ?? ''],
    queryFn: () => fetchTaskPosters(tenantId),
    enabled: !!tenantId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['task-posters', tenantId ?? ''] });

  return {
    posters: postersQuery.data ?? [],
    loading: postersQuery.isLoading,
    refetch,
  };
}

export function useTaskPostersEmployees(tenantId: string | null, enabled = false) {
  const query = useQuery({
    queryKey: ['task-posters-employees', tenantId ?? ''],
    queryFn: () => fetchTaskEmployees(tenantId),
    enabled: !!tenantId && enabled,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });

  return {
    employees: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
