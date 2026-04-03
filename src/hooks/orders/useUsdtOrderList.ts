// USDT 订单查询 Hook - 从 useUsdtOrders 提取
import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { trackRender } from '@/lib/performanceUtils';
import { fetchUsdtOrdersFromDb } from './orderQueries';
import { useOrderRealtime } from './useOrderRealtime';
import type { UsdtOrder, OrderFilters, UseUsdtOrdersOptions } from './types';
import { PAGE_SIZE } from './types';

export function useUsdtOrderList(options: UseUsdtOrdersOptions & { paused?: boolean } = {}) {
  const { page = 1, pageSize = PAGE_SIZE, filters, paused } = options;
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);

  useEffect(() => {
    trackRender('useUsdtOrders-mount');
  }, []);

  const queryKey = ['usdt-orders', effectiveTenantId, page, filters] as const;
  useOrderRealtime('usdt-orders');

  const { data, isLoading: loading, isError, error } = useQuery({
    queryKey,
    queryFn: () => fetchUsdtOrdersFromDb(effectiveTenantId, page, pageSize, filters, useMyTenantRpc),
    refetchInterval: paused ? false : 30_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    refetchOnWindowFocus: !paused,
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
    isError,
    error,
    setOrders,
    fetchOrders,
    viewingTenantId,
    effectiveTenantId,
    queryClient,
  };
}
