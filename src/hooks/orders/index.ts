// 订单 Hooks 统一导出 - 保持 useOrders / useUsdtOrders 对外 API 不变
import { useQueryClient } from '@tanstack/react-query';
import { useOrderList } from './useOrderList';
import { useUsdtOrderList } from './useUsdtOrderList';
import { useOrderStats } from './useOrderStats';
import { useOrderMutations } from './useOrderMutations';
import { useUsdtOrderMutations } from './useUsdtOrderMutations';

export type {
  PointsStatus,
  OrderResult,
  Order,
  UsdtOrder,
  OrderFilters,
  UseOrdersOptions,
  UseUsdtOrdersOptions,
} from './types';
import type { UseOrdersOptions, UseUsdtOrdersOptions } from './types';

export { PAGE_SIZE } from './types';

export function useOrders(options: Parameters<typeof useOrderList>[0] = {}) {
  const list = useOrderList(options);
  const queryClient = useQueryClient();
  const mutations = useOrderMutations({
    orders: list.orders,
    setOrders: list.setOrders,
    fetchOrders: list.fetchOrders,
    viewingTenantId: list.effectiveTenantId ?? list.viewingTenantId,
    queryClient,
  });

  return {
    orders: list.orders,
    totalCount: list.totalCount,
    loading: list.loading,
    isError: list.isError,
    error: list.error,
    addOrder: mutations.addOrder,
    updateOrder: mutations.updateOrder,
    cancelOrder: mutations.cancelOrder,
    restoreOrder: mutations.restoreOrder,
    deleteOrder: mutations.deleteOrder,
    refetch: list.fetchOrders,
  };
}

export { useOrderStats };

export function useUsdtOrders(options: Parameters<typeof useUsdtOrderList>[0] = {}) {
  const list = useUsdtOrderList(options);
  const queryClient = useQueryClient();
  const mutations = useUsdtOrderMutations({
    orders: list.orders,
    setOrders: list.setOrders,
    fetchOrders: list.fetchOrders,
    viewingTenantId: list.effectiveTenantId ?? list.viewingTenantId,
    queryClient,
  });

  return {
    orders: list.orders,
    totalCount: list.totalCount,
    loading: list.loading,
    isError: list.isError,
    error: list.error,
    addOrder: mutations.addOrder,
    cancelOrder: mutations.cancelOrder,
    restoreOrder: mutations.restoreOrder,
    deleteOrder: mutations.deleteOrder,
    refetch: list.fetchOrders,
  };
}

/** 订单管理 · 美卡专区（赛地/奈拉）— 仅汇率计算「美卡专区」台位提交的订单 */
export function useMeikaOrders(options: Omit<UseOrdersOptions, 'listVariant'> & { paused?: boolean } = {}) {
  return useOrders({ ...options, listVariant: 'meika-fiat' });
}

/** 订单管理 · 美卡专区 USDT */
export function useMeikaUsdtOrders(options: Omit<UseUsdtOrdersOptions, 'listVariant'> & { paused?: boolean } = {}) {
  return useUsdtOrders({ ...options, listVariant: 'meika-usdt' });
}
