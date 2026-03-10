// USDT 订单查询 Hook - 从 useUsdtOrders 提取
import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantView } from '@/contexts/TenantViewContext';
import { trackRender } from '@/lib/performanceUtils';
import { fetchUsdtOrdersFromDb } from './orderQueries';
import { useOrderRealtime } from './useOrderRealtime';
import type { UsdtOrder, OrderFilters, UseUsdtOrdersOptions } from './types';
import { PAGE_SIZE } from './types';

export function useUsdtOrderList(options: UseUsdtOrdersOptions = {}) {
  const { page = 1, pageSize = PAGE_SIZE, filters } = options;
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};

  useEffect(() => {
    trackRender('useUsdtOrders-mount');
  }, []);

  const queryKey = ['usdt-orders', viewingTenantId, page, filters] as const;
  useOrderRealtime('usdt-orders');

  const { data, isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchUsdtOrdersFromDb(viewingTenantId || null, page, pageSize, filters),
    refetchInterval: 30_000,
  });

  const orders = data?.orders ?? [];
  const totalCount = data?.totalCount ?? 0;

  const setOrders = useCallback(
    (updater: (prev: UsdtOrder[]) => UsdtOrder[]) => {
      queryClient.setQueryData<{ orders: UsdtOrder[]; totalCount: number }>(queryKey, (old) => {
        const prev = old?.orders ?? [];
        return { orders: updater(prev), totalCount: old?.totalCount ?? 0 };
      });
    },
    [queryClient, queryKey]
  );

  const fetchOrders = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['usdt-orders'] });
  }, [queryClient]);

  return {
    orders,
    totalCount,
    loading,
    setOrders,
    fetchOrders,
    viewingTenantId,
    queryClient,
  };
}
