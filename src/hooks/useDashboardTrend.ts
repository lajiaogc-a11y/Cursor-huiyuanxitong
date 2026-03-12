import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { getTenantDashboardTrend, getMyTenantDashboardTrend } from '@/services/tenantService';

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
  tenantId: string | null,
  useMyTenantRpc?: boolean
) {
  if (tenantId) {
    const { rows, summary } = useMyTenantRpc
      ? await getMyTenantDashboardTrend(startDate, endDate, salesPerson)
      : await getTenantDashboardTrend(tenantId, startDate, endDate, salesPerson);
    return { rows: rows as DashboardTrendRow[], summary };
  }

  const { data, error } = await supabase.rpc('get_dashboard_trend_data', {
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
    p_sales_person: salesPerson || null,
  });

  if (error) {
    console.error('[useDashboardTrend] RPC error:', error);
    throw error;
  }

  if (!data || !Array.isArray(data)) return { rows: [], summary: emptySummary };

  const allRows = data.map((row: any) => {
    const dayDate = row.day_date;
    const d = dayDate ? new Date(dayDate) : null;
    return {
      date: d ? `${d.getMonth() + 1}/${d.getDate()}` : '',
      orders: Number(row.order_count) || 0,
      profit: parseFloat((Number(row.profit) || 0).toFixed(2)),
      users: Number(row.trading_users) || 0,
      ngnVolume: Number(row.ngn_volume) || 0,
      ghsVolume: Number(row.ghs_volume) || 0,
      usdtVolume: Number(row.usdt_volume) || 0,
      ngnProfit: Number(row.ngn_profit) || 0,
      ghsProfit: Number(row.ghs_profit) || 0,
      usdtProfit: Number(row.usdt_profit) || 0,
      _isSummary: !dayDate,
    };
  }) as (DashboardTrendRow & { _isSummary?: boolean })[];

  const summaryRow = allRows.find((r: any) => r._isSummary);
  const rows = allRows.filter((r: any) => !r._isSummary);

  const summary = summaryRow
    ? {
        totalOrders: summaryRow.orders,
        tradingUsers: summaryRow.users,
        ngnVolume: summaryRow.ngnVolume,
        ghsVolume: summaryRow.ghsVolume,
        usdtVolume: summaryRow.usdtVolume,
        ngnProfit: summaryRow.ngnProfit,
        ghsProfit: summaryRow.ghsProfit,
        usdtProfit: summaryRow.usdtProfit,
      }
    : (() => {
        const reduced = rows.reduce((acc, r) => ({
          ...acc,
          totalOrders: acc.totalOrders + r.orders,
          ngnVolume: acc.ngnVolume + r.ngnVolume,
          ghsVolume: acc.ghsVolume + r.ghsVolume,
          usdtVolume: acc.usdtVolume + r.usdtVolume,
          ngnProfit: acc.ngnProfit + r.ngnProfit,
          ghsProfit: acc.ghsProfit + r.ghsProfit,
          usdtProfit: acc.usdtProfit + r.usdtProfit,
        }), { ...emptySummary });
        return {
          ...reduced,
          tradingUsers: 0,
        };
      })();

  return { rows, summary };
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
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['dashboard-trend', startDate?.toISOString(), endDate?.toISOString(), salesPerson, effectiveTenantId],
    queryFn: () => fetchTrendData(startDate!, endDate!, salesPerson, effectiveTenantId, useMyTenantRpc),
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
