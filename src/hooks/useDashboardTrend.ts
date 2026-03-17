import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDashboardTrendApi,
} from '@/services/reports/reportsApiService';

export interface DashboardTrendRow {
  date: string;
  orders: number;
  profit: number;
  users: number;
  ngnVolume: number;
  ghsVolume: number;
  usdtVolume: number;
  ngnProfit: number;
  ghsProfit: number;
  usdtProfit: number;
}

export interface DashboardTrendSummary {
  totalOrders: number;
  tradingUsers: number;
  ngnVolume: number;
  ghsVolume: number;
  usdtVolume: number;
  ngnProfit: number;
  ghsProfit: number;
  usdtProfit: number;
}

const emptySummary: DashboardTrendSummary = {
  totalOrders: 0, tradingUsers: 0,
  ngnVolume: 0, ghsVolume: 0, usdtVolume: 0,
  ngnProfit: 0, ghsProfit: 0, usdtProfit: 0,
};

async function fetchTrendData(
  startDate: Date,
  endDate: Date,
  salesPerson: string | null,
  tenantId: string | null
) {
  return getDashboardTrendApi({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    salesPerson,
    tenantId,
  });
}

export function useDashboardTrend(
  startDate: Date | null,
  endDate: Date | null,
  salesPerson: string | null
) {
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['dashboard-trend', startDate?.toISOString(), endDate?.toISOString(), salesPerson, effectiveTenantId],
    queryFn: () => fetchTrendData(startDate!, endDate!, salesPerson, effectiveTenantId),
    enabled: !!startDate && !!endDate,
    staleTime: 60_000, // 1 分钟内不重复请求
    retry: 2,
  });

  return {
    trendData: data?.rows ?? [],
    summary: data?.summary ?? emptySummary,
    loading: isLoading,
    isFetching,
    isError,
    error,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
    },
  };
}
