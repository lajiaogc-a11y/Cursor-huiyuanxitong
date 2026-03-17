/**
 * 活动分配设置 Hook - react-query 缓存，切换秒开
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { getGiftDistributionSettingsAsync, GiftDistributionSettings } from '@/stores/systemSettings';

const STALE_TIME = 5 * 60 * 1000;

async function fetchGiftDistributionData(tenantId?: string | null): Promise<{
  settings: GiftDistributionSettings;
  totalGiftValue: number;
}> {
  const [settingsData, activityData] = await Promise.all([
    getGiftDistributionSettingsAsync(),
    import('@/api/data').then((m) => m.getActivityDataApi(tenantId)),
  ]);
  const gifts = (activityData.gifts || []) as Array<{ gift_value?: number | string | null }>;
  const totalGiftValue = gifts.reduce((sum, g) => sum + (Number(g.gift_value) || 0), 0);
  return { settings: settingsData, totalGiftValue };
}

export function useGiftDistributionSettings() {
  const queryClient = useQueryClient();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;

  const query = useQuery({
    queryKey: ['gift-distribution-settings', effectiveTenantId ?? ''],
    queryFn: () => fetchGiftDistributionData(effectiveTenantId),
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['gift-distribution-settings'] });

  return {
    settings: query.data?.settings ?? { enabled: false, distributionRatio: 100 },
    totalGiftValue: query.data?.totalGiftValue ?? 0,
    loading: query.isLoading,
    refetch,
  };
}
