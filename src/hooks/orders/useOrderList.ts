// 普通订单查询 Hook - 从 useOrders 提取
import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { trackRender } from '@/lib/performanceUtils';
import { fetchOrdersFromDb } from './orderQueries';
import { useOrderRealtime } from './useOrderRealtime';
import type { Order, OrderFilters, UseOrdersOptions } from './types';
import { PAGE_SIZE } from './types';

export function useOrderList(options: UseOrdersOptions = {}) {
  const { page = 1, pageSize = PAGE_SIZE, filters } = options;
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);

  useEffect(() => {
    trackRender('useOrders-mount');
  }, []);

  const queryKey = ['orders', effectiveTenantId, page, filters] as const;
  useOrderRealtime('orders');

  const { data, isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchOrdersFromDb(effectiveTenantId, page, pageSize, filters, useMyTenantRpc),
    refetchInterval: 30_000,
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
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  }, [queryClient]);

  return {
    orders,
    totalCount,
    loading,
    setOrders,
    fetchOrders,
    viewingTenantId,
    effectiveTenantId,
    queryClient,
  };
}
