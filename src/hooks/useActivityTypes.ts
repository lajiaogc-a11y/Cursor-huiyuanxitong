// ============= Activity Types Hook - react-query Migration =============
// 活动类型管理 Hook - react-query 缓存确保页面切换不重复请求

import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logOperation } from '@/stores/auditLogStore';

export interface ActivityType {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
}

// Standalone fetch function
export async function fetchActivityTypesFromDb(): Promise<ActivityType[]> {
  try {
    const { getActivityTypesApi } = await import('@/api/data');
    const data = await getActivityTypesApi();
    if (Array.isArray(data) && data.length > 0) {
      return data.map(item => ({
        id: item.id,
        value: item.value,
        label: item.label,
        isActive: item.is_active,
        sortOrder: item.sort_order,
      }));
    }
  } catch (error) {
    console.error('[useActivityTypes] API fetch failed:', error);
  }

  return [
    { id: 'default-activity-1', value: 'activity_1', label: '活动1', isActive: true, sortOrder: 1 },
    { id: 'default-activity-2', value: 'activity_2', label: '活动2', isActive: true, sortOrder: 2 },
  ];
}

export function useActivityTypes() {
  const queryClient = useQueryClient();

  const { data: activityTypes = [], isLoading: loading } = useQuery({
    queryKey: ['activity-types'],
    queryFn: fetchActivityTypesFromDb,
  });

  // Realtime subscription -> invalidate cache
  useEffect(() => {
    const channel = supabase
      .channel('activity-types-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_types' }, () => {
        queryClient.invalidateQueries({ queryKey: ['activity-types'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const addActivityType = async (value: string, label: string): Promise<boolean> => {
    try {
      const maxOrder = activityTypes.reduce((max, t) => Math.max(max, t.sortOrder), 0);
      
      const { data, error } = await supabase
        .from('activity_types')
        .insert({
          value,
          label,
          is_active: true,
          sort_order: maxOrder + 1,
        })
        .select()
        .single();

      if (error) throw error;

      logOperation('activity_type', 'create', data.id, null, { value, label, is_active: true }, `新增活动类型: ${label}`);
      await queryClient.invalidateQueries({ queryKey: ['activity-types'] });
      return true;
    } catch (error) {
      console.error('Failed to add activity type:', error);
      return false;
    }
  };

  const updateActivityType = async (id: string, updates: Partial<ActivityType>): Promise<boolean> => {
    try {
      const beforeData = activityTypes.find(t => t.id === id);
      
      const updateData: Record<string, any> = {};
      if (updates.value !== undefined) updateData.value = updates.value;
      if (updates.label !== undefined) updateData.label = updates.label;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;

      const { error } = await supabase
        .from('activity_types')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      
      logOperation('activity_type', 'update', id, beforeData, { ...beforeData, ...updates }, `更新活动类型: ${updates.label || beforeData?.label}`);
      
      await queryClient.invalidateQueries({ queryKey: ['activity-types'] });
      return true;
    } catch (error) {
      console.error('Failed to update activity type:', error);
      return false;
    }
  };

  const updateSortOrders = async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    try {
      const updates = items.map(item =>
        supabase
          .from('activity_types')
          .update({ sort_order: item.sortOrder })
          .eq('id', item.id)
      );
      
      const results = await Promise.all(updates);
      const hasError = results.some(r => r.error);
      
      if (hasError) {
        console.error('Some sort order updates failed');
        return false;
      }
      
      await queryClient.invalidateQueries({ queryKey: ['activity-types'] });
      return true;
    } catch (error) {
      console.error('Failed to update sort orders:', error);
      return false;
    }
  };

  const deleteActivityType = async (id: string): Promise<boolean> => {
    try {
      const typeToDelete = activityTypes.find(t => t.id === id);
      
      const { error } = await supabase
        .from('activity_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      if (typeToDelete) {
        logOperation('activity_type', 'delete', id, typeToDelete, null, `删除活动类型: ${typeToDelete.label}`);
      }
      
      await queryClient.invalidateQueries({ queryKey: ['activity-types'] });
      return true;
    } catch (error) {
      console.error('Failed to delete activity type:', error);
      return false;
    }
  };

  const activeTypes = activityTypes.filter(t => t.isActive);

  return {
    activityTypes,
    activeTypes,
    loading,
    addActivityType,
    updateActivityType,
    updateSortOrders,
    deleteActivityType,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['activity-types'] }),
  };
}
