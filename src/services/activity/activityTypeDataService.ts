/**
 * Activity Type Data Service — 活动类型基础数据获取
 *
 * 架构: Context/Hook → Service(此文件) → API(@/api/staffData)
 *
 * 从 hooks/useActivityTypes 中提取的纯数据获取函数，
 * 供 AuthContext prefetch 和 hooks 共用，消除 Context → Hook 的反向依赖。
 */
import { getActivityTypesApi } from '@/api/staffData';
import { pickBilingual } from '@/lib/appLocale';

export interface ActivityType {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
}

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
    console.error('[activityTypeDataService] API fetch failed:', error);
  }

  return [
    { id: 'default-activity-1', value: 'activity_1', label: pickBilingual('活动1', 'Activity 1'), isActive: true, sortOrder: 1 },
    { id: 'default-activity-2', value: 'activity_2', label: pickBilingual('活动2', 'Activity 2'), isActive: true, sortOrder: 2 },
  ];
}
