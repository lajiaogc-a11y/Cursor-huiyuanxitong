/**
 * 活动数据内容 Hook - react-query 缓存，页面切换秒开
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getMyTenantOrdersFull, getMyTenantUsdtOrdersFull, getTenantOrdersFull, getTenantUsdtOrdersFull } from '@/services/tenantService';
import { loadSharedData } from '@/services/sharedDataService';

const STALE_TIME = 5 * 60 * 1000; // 5 分钟

export interface ActivityDataContentResult {
  orders: any[];
  gifts: any[];
  paymentProviders: any[];
  referrals: any[];
  memberActivities: any[];
  pointsLedgerData: any[];
  pointsAccountsData: any[];
  cachedRates: { nairaRate: number; cediRate: number; usdtRate: number; lastUpdated: string } | null;
}

async function fetchActivityDataContent(
  effectiveTenantId: string | null,
  useMyTenantRpc: boolean
): Promise<ActivityDataContentResult> {
  const [normalOrders, usdtOrders] = effectiveTenantId && !useMyTenantRpc
    ? await Promise.all([getTenantOrdersFull(effectiveTenantId), getTenantUsdtOrdersFull(effectiveTenantId)])
    : await Promise.all([getMyTenantOrdersFull(), getMyTenantUsdtOrdersFull()]);
  const allOrders = [...(normalOrders || []), ...(usdtOrders || [])].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const [ratesData, giftsRes, providersRes, referralsRes, activitiesRes, pointsLedgerRes, pointsAccountsRes] = await Promise.all([
    loadSharedData<{ nairaRate: number; cediRate: number; usdtRate: number; lastUpdated: string }>('calculatorInputRates'),
    supabase.from('activity_gifts').select('*'),
    supabase.from('payment_providers').select('*').eq('status', 'active').order('sort_order', { ascending: true }),
    supabase.from('referral_relations').select('*'),
    supabase.from('member_activity').select('*'),
    supabase.from('points_ledger').select('*').order('created_at', { ascending: false }),
    supabase.from('points_accounts').select('*'),
  ]);

  return {
    orders: allOrders,
    gifts: giftsRes.data || [],
    paymentProviders: providersRes.data || [],
    referrals: referralsRes.data || [],
    memberActivities: activitiesRes.data || [],
    pointsLedgerData: pointsLedgerRes.data || [],
    pointsAccountsData: pointsAccountsRes.data || [],
    cachedRates: ratesData || null,
  };
}

export function useActivityDataContent(effectiveTenantId: string | null, useMyTenantRpc: boolean) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['activity-data-content', effectiveTenantId ?? '', useMyTenantRpc],
    queryFn: () => fetchActivityDataContent(effectiveTenantId, useMyTenantRpc),
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel('activity-data-content-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_gifts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_activity' }, () => {
        queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'points_ledger' }, () => {
        queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
      })
      .subscribe();

    const handleGiftsUpdated = () => queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
    const handlePointsUpdated = () => queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
    window.addEventListener('activity-gifts-updated', handleGiftsUpdated);
    window.addEventListener('points-updated', handlePointsUpdated);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('activity-gifts-updated', handleGiftsUpdated);
      window.removeEventListener('points-updated', handlePointsUpdated);
    };
  }, [queryClient]);

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });

  return {
    orders: data?.orders ?? [],
    gifts: data?.gifts ?? [],
    paymentProviders: data?.paymentProviders ?? [],
    referrals: data?.referrals ?? [],
    memberActivities: data?.memberActivities ?? [],
    pointsLedgerData: data?.pointsLedgerData ?? [],
    pointsAccountsData: data?.pointsAccountsData ?? [],
    cachedRates: data?.cachedRates ?? null,
    isLoading,
    refetch,
  };
}
