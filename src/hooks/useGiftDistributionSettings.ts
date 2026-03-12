/**
 * 活动分配设置 Hook - react-query 缓存，切换秒开
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getGiftDistributionSettingsAsync, GiftDistributionSettings } from '@/stores/systemSettings';

const STALE_TIME = 5 * 60 * 1000;

async function fetchGiftDistributionData(): Promise<{
  settings: GiftDistributionSettings;
  totalGiftValue: number;
}> {
  const [settingsData, giftsRes] = await Promise.all([
    getGiftDistributionSettingsAsync(),
    supabase.from('activity_gifts').select('gift_value'),
  ]);
  const gifts = giftsRes.data || [];
  const totalGiftValue = gifts.reduce((sum, g) => sum + (Number(g.gift_value) || 0), 0);
  return { settings: settingsData, totalGiftValue };
}

export function useGiftDistributionSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['gift-distribution-settings'],
    queryFn: fetchGiftDistributionData,
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
