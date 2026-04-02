import { useQuery } from '@tanstack/react-query';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchOrderStats } from './orderQueries';
import type { OrderFilters } from './types';

export function useOrderStats(filters?: OrderFilters) {
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);

  const { data, isLoading } = useQuery({
    queryKey: ['order-stats', effectiveTenantId, filters],
    queryFn: () => fetchOrderStats(effectiveTenantId, filters, useMyTenantRpc),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    totalProfit: data?.totalProfit ?? 0,
    usdtProfit: data?.usdtProfit ?? 0,
    totalCardValue: data?.totalCardValue ?? 0,
    tradingUsers: data?.tradingUsers ?? 0,
    loading: isLoading,
  };
}
