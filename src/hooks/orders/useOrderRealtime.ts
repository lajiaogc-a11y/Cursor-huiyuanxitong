// Supabase 实时订阅与 smartInvalidate - 从 useOrders 提取
import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isUserTyping } from '@/lib/performanceUtils';

export type OrderQueryKey = 'orders' | 'usdt-orders';

export function useOrderRealtime(baseKey: OrderQueryKey) {
  const queryClient = useQueryClient();
  const pendingRefreshRef = useRef(false);
  const refreshCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dataVersionRef = useRef<string>('');

  const smartInvalidate = useCallback(() => {
    if (isUserTyping()) {
      pendingRefreshRef.current = true;
      if (!refreshCheckIntervalRef.current) {
        refreshCheckIntervalRef.current = setInterval(() => {
          if (!isUserTyping() && pendingRefreshRef.current) {
            pendingRefreshRef.current = false;
            queryClient.invalidateQueries({ queryKey: [baseKey] });
            if (refreshCheckIntervalRef.current) {
              clearInterval(refreshCheckIntervalRef.current);
              refreshCheckIntervalRef.current = null;
            }
          }
        }, 300);
      }
    } else {
      queryClient.invalidateQueries({ queryKey: [baseKey] });
    }
  }, [queryClient, baseKey]);

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

    const channelName = isOrders ? 'orders-changes' : 'usdt-orders-changes';
    const ordersChannel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (isOrders) {
          const recordId = (payload.new as any)?.id || (payload.old as any)?.id;
          const changeKey = `${payload.eventType}-${recordId}`;
          if (dataVersionRef.current !== changeKey) {
            dataVersionRef.current = changeKey;
            smartInvalidate();
          }
        } else {
          smartInvalidate();
        }
      })
      .subscribe();

    const employeesChannelName = isOrders ? 'orders-employees-sync' : 'usdt-orders-employees-sync';
    const employeesChannel = supabase
      .channel(employeesChannelName)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'employees' }, () => {
        import('@/services/nameResolver').then(({ refreshEmployees }) => {
          refreshEmployees().then(() => {
            smartInvalidate();
          });
        });
      })
      .subscribe();

    return () => {
      if (isOrders) {
        window.removeEventListener('userDataSynced', handleUserSynced);
      }
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(employeesChannel);
      if (refreshCheckIntervalRef.current) {
        clearInterval(refreshCheckIntervalRef.current);
      }
    };
  }, [queryClient, baseKey, smartInvalidate]);
}
