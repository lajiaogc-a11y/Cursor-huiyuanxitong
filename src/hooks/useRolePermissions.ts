/**
 * 权限设置 Hook - react-query 缓存，切换秒开
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { loadSharedData } from '@/services/finance/sharedDataService';
import type { SharedDataKey } from '@/services/finance/sharedDataService';

export interface RolePermission {
  id: string;
  role: string;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface CustomTemplate {
  id: string;
  name_zh: string;
  name_en: string;
  description_zh: string;
  description_en: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

const STALE_TIME = 5 * 60 * 1000;

async function fetchRolePermissions(): Promise<RolePermission[]> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('*')
    .order('module_name', { ascending: true });
  if (error) throw error;
  return (data || []) as RolePermission[];
}

export function useRolePermissions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['role-permissions'],
    queryFn: fetchRolePermissions,
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['role-permissions'] });

  return {
    permissions: query.data ?? [],
    loading: query.isLoading,
    refetch,
  };
}

export function useCustomPermissionTemplates() {
  const query = useQuery({
    queryKey: ['custom-permission-templates'],
    queryFn: () => loadSharedData<CustomTemplate[]>('customPermissionTemplates' as SharedDataKey),
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return {
    templates: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
