/**
 * 活动数据内容 Hook - react-query 缓存，页面切换秒开
 * 通过后端 API 获取，租户员工仅能查看本租户数据
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMyTenantOrdersFullResult,
  getMyTenantUsdtOrdersFullResult,
  getTenantOrdersFullResult,
  getTenantUsdtOrdersFullResult,
} from '@/services/tenantService';
import {
  loadSharedData,
  resolveUsdtRateForActivityGift,
  type CalculatorInputRates,
} from '@/services/finance/sharedDataService';
import { getActivityDataApi } from '@/services/staff/dataApi';
import { listPaymentProvidersApi } from '@/services/shared/entityLookupService';

const STALE_TIME = 2 * 60 * 1000;

export interface ActivityDataContentResult {
  orders: any[];
  gifts: any[];
  paymentProviders: any[];
  referrals: any[];
  memberActivities: any[];
  pointsLedgerData: any[];
  pointsAccountsData: any[];
  cachedRates: {
    nairaRate: number;
    cediRate: number;
    usdtRate: number;
    usdtSellRate?: number;
    lastUpdated: string;
  } | null;
}

async function fetchActivityDataContent(
  effectiveTenantId: string | null,
  useMyTenantRpc: boolean
): Promise<ActivityDataContentResult> {
  const [ordersPair, activityDataRes, ratesData, providersRes] = await Promise.all([
    effectiveTenantId && !useMyTenantRpc
      ? Promise.all([getTenantOrdersFullResult(effectiveTenantId), getTenantUsdtOrdersFullResult(effectiveTenantId)])
      : Promise.all([getMyTenantOrdersFullResult(), getMyTenantUsdtOrdersFullResult()]),
    getActivityDataApi(effectiveTenantId ?? undefined),
    loadSharedData<CalculatorInputRates>('calculatorInputRates'),
    listPaymentProvidersApi('active'),
  ]);
  const [normalOrdersRes, usdtOrdersRes] = ordersPair;
  const normalOrders = normalOrdersRes.ok ? normalOrdersRes.data : [];
  const usdtOrders = usdtOrdersRes.ok ? usdtOrdersRes.data : [];
  const allOrders = [...(normalOrders || []), ...(usdtOrders || [])].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const cachedRates = ratesData
    ? {
        nairaRate: ratesData.nairaRate,
        cediRate: ratesData.cediRate,
        lastUpdated: ratesData.lastUpdated,
        usdtSellRate: ratesData.usdtSellRate,
        // 活动数据里 USDT 统一用卖价优先（与汇率页采集一致）
        usdtRate: resolveUsdtRateForActivityGift(ratesData),
      }
    : null;

  return {
    orders: allOrders,
    gifts: activityDataRes.gifts || [],
    paymentProviders: providersRes || [],
    referrals: activityDataRes.referrals || [],
    memberActivities: activityDataRes.memberActivities || [],
    pointsLedgerData: activityDataRes.pointsLedgerData || [],
    pointsAccountsData: activityDataRes.pointsAccountsData || [],
    cachedRates,
  };
}

export function useActivityDataContent(effectiveTenantId: string | null, useMyTenantRpc: boolean) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch: refetchQuery } = useQuery({
    queryKey: ['activity-data-content', effectiveTenantId ?? '', useMyTenantRpc],
    queryFn: () => fetchActivityDataContent(effectiveTenantId, useMyTenantRpc),
    staleTime: STALE_TIME,
  });

  useEffect(() => {
    const handleGiftsUpdated = () => queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
    const handlePointsUpdated = () => queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
    const onDataRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      const table = detail?.table;
      if (
        table === 'orders' ||
        table === 'activity_gifts' ||
        table === 'member_activity' ||
        table === 'points_ledger' ||
        table === 'points_accounts' ||
        table === 'payment_providers'
      ) {
        queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
      }
    };
    window.addEventListener('activity-gifts-updated', handleGiftsUpdated);
    window.addEventListener('points-updated', handlePointsUpdated);
    window.addEventListener('data-refresh', onDataRefresh as EventListener);

    return () => {
      window.removeEventListener('activity-gifts-updated', handleGiftsUpdated);
      window.removeEventListener('points-updated', handlePointsUpdated);
      window.removeEventListener('data-refresh', onDataRefresh as EventListener);
    };
  }, [queryClient]);

  const refetch = () => refetchQuery();

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
