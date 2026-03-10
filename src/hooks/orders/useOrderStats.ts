import { useQuery } from '@tanstack/react-query';
import { useTenantView } from '@/contexts/TenantViewContext';
import { fetchOrderStats } from './orderQueries';
import type { OrderFilters } from './types';

export function useOrderStats(filters?: OrderFilters) {
  const { viewingTenantId } = useTenantView() || {};

  const { data, isLoading } = useQuery({
    queryKey: ['order-stats', viewingTenantId, filters],
    queryFn: () => fetchOrderStats(viewingTenantId || null, filters),
    staleTime: 15_000,
  });

  return {
    totalProfit: data?.totalProfit ?? 0,
    totalCardValue: data?.totalCardValue ?? 0,
    tradingUsers: data?.tradingUsers ?? 0,
    loading: isLoading,
  };
}
