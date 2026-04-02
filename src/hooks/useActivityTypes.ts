// ============= Activity Types Hook - react-query Migration =============
// 活动类型管理 Hook - react-query 缓存确保页面切换不重复请求

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME_LIST_MS } from '@/lib/reactQueryPolicy';
import { apiPost, apiPatch, apiDelete } from '@/api/client';
import { logOperation } from '@/stores/auditLogStore';
import { getActivityTypesApi } from '@/services/staff/dataApi';

function _t(zh: string, en: string): string {
  return (typeof localStorage !== 'undefined' && localStorage.getItem('appLanguage') === 'en') ? en : zh;
}

function unwrapSingleRow<T>(data: unknown): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return data as T;
}

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
    { id: 'default-activity-1', value: 'activity_1', label: _t('活动1', 'Activity 1'), isActive: true, sortOrder: 1 },
    { id: 'default-activity-2', value: 'activity_2', label: _t('活动2', 'Activity 2'), isActive: true, sortOrder: 2 },
  ];
}

export function useActivityTypes() {
  const queryClient = useQueryClient();

  const { data: activityTypes = [], isLoading: loading } = useQuery({
    queryKey: ['activity-types'],
    queryFn: fetchActivityTypesFromDb,
    staleTime: STALE_TIME_LIST_MS,
  });

  const addActivityType = async (value: string, label: string): Promise<boolean> => {
    try {
      const maxOrder = activityTypes.reduce((max, t) => Math.max(max, t.sortOrder), 0);
      
      const inserted = await apiPost<unknown>(`/api/data/table/activity_types`, {
        data: {
          value,
          label,
          name: label,
          code: value,
          is_active: true,
          sort_order: maxOrder + 1,
        },
      });
      const data = unwrapSingleRow<{ id: string }>(inserted);
      if (!data?.id) throw new Error('Insert returned no row');

      logOperation('activity_type', 'create', data.id, null, { value, label, is_active: true }, _t(`新增活动类型: ${label}`, `Add activity type: ${label}`));
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
      if (updates.value !== undefined) { updateData.value = updates.value; updateData.code = updates.value; }
      if (updates.label !== undefined) { updateData.label = updates.label; updateData.name = updates.label; }
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;

      await apiPatch(`/api/data/table/activity_types?id=eq.${encodeURIComponent(id)}`, { data: updateData });
      
      logOperation('activity_type', 'update', id, beforeData, { ...beforeData, ...updates }, _t(`更新活动类型: ${updates.label || beforeData?.label}`, `Update activity type: ${updates.label || beforeData?.label}`));
      
      await queryClient.invalidateQueries({ queryKey: ['activity-types'] });
      return true;
    } catch (error) {
      console.error('Failed to update activity type:', error);
      return false;
    }
  };

  const updateSortOrders = async (items: { id: string; sortOrder: number }[]): Promise<boolean> => {
    try {
      await Promise.all(
        items.map((item) =>
          apiPatch(`/api/data/table/activity_types?id=eq.${encodeURIComponent(item.id)}`, {
            data: { sort_order: item.sortOrder },
          })
        )
      );
      
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
      
      await apiDelete(`/api/data/table/activity_types?id=eq.${encodeURIComponent(id)}`);
      
      if (typeToDelete) {
        logOperation('activity_type', 'delete', id, typeToDelete, null, _t(`删除活动类型: ${typeToDelete.label}`, `Delete activity type: ${typeToDelete.label}`));
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
