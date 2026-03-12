/**
 * 海报库 Hook - react-query 缓存，切换秒开
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getTaskPosters, type TaskPoster } from '@/services/taskService';

const STALE_TIME = 5 * 60 * 1000;

async function fetchTaskPosters(tenantId: string | null): Promise<TaskPoster[]> {
  if (!tenantId) return [];
  return getTaskPosters(tenantId);
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

export function useTaskPosters(tenantId: string | null) {
  const queryClient = useQueryClient();

  const postersQuery = useQuery({
    queryKey: ['task-posters', tenantId ?? ''],
    queryFn: () => fetchTaskPosters(tenantId),
    enabled: !!tenantId,
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return {
    employees: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
