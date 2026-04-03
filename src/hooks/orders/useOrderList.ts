// 普通订单查询 Hook - 从 useOrders 提取
import { useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { trackRender } from '@/lib/performanceUtils';
import { fetchOrdersFromDb } from './orderQueries';
import { useOrderRealtime } from './useOrderRealtime';
import type { Order, OrderFilters, UseOrdersOptions } from './types';
import { PAGE_SIZE } from './types';

export function useOrderList(options: UseOrdersOptions & { paused?: boolean } = {}) {
  const { page = 1, pageSize = PAGE_SIZE, filters, paused, listVariant = 'standard', enabled = true } = options;
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);

  useEffect(() => {
    trackRender('useOrders-mount');
  }, []);

  const queryKey = useMemo(() =>
    listVariant === 'meika-fiat'
      ? (['meika-fiat-orders', effectiveTenantId, page, filters] as const)
      : (['orders', effectiveTenantId, page, filters] as const),
    [listVariant, effectiveTenantId, page, filters]);
  useOrderRealtime(listVariant === 'meika-fiat' ? 'meika-fiat-orders' : 'orders');

  const { data, isLoading: loading, isError, error } = useQuery({
    queryKey,
    queryFn: () => fetchOrdersFromDb(effectiveTenantId, page, pageSize, filters, useMyTenantRpc, listVariant),
    enabled,
    refetchInterval: paused || !enabled ? false : 30_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    refetchOnWindowFocus: !paused && enabled,
  });

  const orders = data?.orders ?? [];
  const totalCount = data?.totalCount ?? 0;

  const setOrders = useCallback(
    (updater: (prev: Order[]) => Order[]) => {
      queryClient.setQueryData<{ orders: Order[]; totalCount: number }>(queryKey, (old) => {
        const prev = old?.orders ?? [];
        return { orders: updater(prev), totalCount: old?.totalCount ?? 0 };
      });
    },
    [queryClient, queryKey]
  );

  const fetchOrders = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [listVariant === 'meika-fiat' ? 'meika-fiat-orders' : 'orders'] });
  }, [queryClient, listVariant]);

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
