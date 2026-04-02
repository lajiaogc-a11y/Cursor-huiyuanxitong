// 统一刷新机制下，订单数据刷新由 dataRefreshManager 全局处理
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export type OrderQueryKey = 'orders' | 'usdt-orders';

export function useOrderRealtime(baseKey: OrderQueryKey) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const isOrders = baseKey === 'orders';
    const handleUserSynced = () => {
      if (isOrders) {
        console.log('[useOrders] User data synced, invalidating cache');
      }
      queryClient.invalidateQueries({ queryKey: [baseKey] });
    };
    if (isOrders) {
      window.addEventListener('userDataSynced', handleUserSynced);
    }

    return () => {
      if (isOrders) {
        window.removeEventListener('userDataSynced', handleUserSynced);
      }
    };
  }, [queryClient, baseKey]);
}
