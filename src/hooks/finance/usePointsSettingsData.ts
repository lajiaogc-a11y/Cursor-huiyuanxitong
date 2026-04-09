/**
 * 积分设置 Hook - react-query 缓存，切换秒开
 */
import { useQuery } from '@tanstack/react-query';
import { getPointsSettingsAsync, PointsSettings } from '@/services/points/pointsSettingsService';
import { getPointsSettings } from '@/services/points/pointsSettingsService';

const STALE_TIME = 5 * 60 * 1000;

async function fetchPointsSettings(): Promise<PointsSettings> {
  try {
    return await getPointsSettingsAsync();
  } catch {
    return getPointsSettings();
  }
}

export function usePointsSettingsData() {
  const query = useQuery({
    queryKey: ['points-settings'],
    queryFn: fetchPointsSettings,
    staleTime: STALE_TIME,
  });

  return {
    settings: query.data ?? null,
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
