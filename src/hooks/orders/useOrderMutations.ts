// 普通订单 Mutations - 从 useOrders 提取，不修改业务逻辑
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { normalizeCurrencyCode } from '@/config/currencies';
import {
  reversePointsOnOrderCancel,
  restorePointsOnOrderRestore,
} from '@/services/pointsService';
import { mapDbOrderToOrder, mapOrderToDbAsync, calculateOrderPointsAsync } from './utils';
import type { Order, OrderResult } from './types';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import {
  runCreateOrderSideEffects,
  runCancelOrderSideEffects,
  runRestoreOrderSideEffects,
  runDeleteOrderSideEffects,
} from '@/services/orderSideEffectOrchestrator';

export interface UseOrderMutationsParams {
  orders: Order[];
  setOrders: (updater: (prev: Order[]) => Order[]) => void;
  fetchOrders: () => void;
  viewingTenantId: string | null | undefined;
  queryClient: { invalidateQueries: (opts: { queryKey: string[] }) => void };
}

export function useOrderMutations(params: UseOrderMutationsParams) {
  const { orders, setOrders, fetchOrders, viewingTenantId, queryClient } = params;
  const { employee } = useAuth() || {};
  const { isViewingTenant } = useTenantView() || {};
  const isPlatformAdminReadonlyView = !!(
    employee?.is_platform_super_admin &&
    isViewingTenant &&
    viewingTenantId &&
    viewingTenantId !== employee?.tenant_id
  );

  const addOrder = useCallback(
    async (
      orderData: Omit<Order, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'>,
      memberId?: string,
      employeeId?: string,
      memberCode?: string
    ): Promise<OrderResult> => {
      if (isPlatformAdminReadonlyView) {
        toast.error('平台总管理查看租户时为只读，无法新增订单');
        return { order: null, earnedPoints: 0 };
      }
      try {
        const currency = normalizeCurrencyCode(orderData.demandCurrency);
        const orderPoints = currency ? await calculateOrderPointsAsync(orderData.actualPaid, currency) : 0;
        const dbOrder = await mapOrderToDbAsync(orderData, orderPoints, memberId, employeeId, memberCode);

        const { data, error } = await supabase
          .from('orders')
          .insert(dbOrder)
          .select('*')
          .single();

        if (error) throw error;

        const dbUuid = data.id;
        const newOrder = {
          ...mapDbOrderToOrder(data),
          memberCode: memberCode || (data as any).member_code_snapshot || '',
        };

        const orchestrated = await runCreateOrderSideEffects({
          dbId: dbUuid,
          orderNumber: data.order_number,
          order: {
            id: newOrder.id,
            cardType: newOrder.cardType,
            cardValue: newOrder.cardValue,
            cardWorth: newOrder.cardWorth,
            paymentValue: newOrder.paymentValue,
            actualPaid: newOrder.actualPaid,
            demandCurrency: newOrder.demandCurrency,
            foreignRate: newOrder.foreignRate,
            vendor: newOrder.vendor,
            paymentProvider: newOrder.paymentProvider,
            phoneNumber: newOrder.phoneNumber,
            memberCode: newOrder.memberCode,
          },
          orderPoints,
          employeeId,
          createdAt: data.created_at,
          queryClient,
        });
        const earnedPoints = orchestrated.earnedPoints;
        newOrder.points_status = orchestrated.pointsStatus;
        return { order: newOrder, earnedPoints };
      } catch (error) {
        console.error('Failed to add order:', error);
        toast.error('创建订单失败');
        return { order: null, earnedPoints: 0 };
      }
    },
    [isPlatformAdminReadonlyView, queryClient]
  );

  const updateOrder = useCallback(
    async (dbId: string, updates: Partial<Order>): Promise<Order | null> => {
      if (isPlatformAdminReadonlyView) {
        toast.error('平台总管理查看租户时为只读，无法修改订单');
        return null;
      }
      try {
        const { data, error } = await supabase
          .from('orders')
          .update({
            remark: updates.remark,
            status: updates.status,
          })
          .eq('id', dbId)
          .select()
          .single();

        if (error) throw error;
        return mapDbOrderToOrder(data);
      } catch (error) {
        console.error('Failed to update order:', error);
        toast.error('更新订单失败');
        return null;
      }
    },
    [isPlatformAdminReadonlyView]
  );

  const cancelOrder = useCallback(
    async (dbId: string): Promise<boolean> => {
      if (isPlatformAdminReadonlyView) {
        toast.error('平台总管理查看租户时为只读，无法取消订单');
        return false;
      }
      try {
        const order = orders.find(o => o.dbId === dbId);
        if (!order) return false;

        if (order.status === 'cancelled') {
          console.warn(`Order ${dbId} is already cancelled.`);
          return false;
        }

        const beforeState = { ...order };

        if (order.points_status === 'added') {
          const reversed = await reversePointsOnOrderCancel(dbId);
          if (reversed) {
            await supabase
              .from('orders')
              .update({ points_status: 'reversed' })
              .eq('id', dbId);
          }
        }

        const { error } = await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', dbId);

        if (error) throw error;

        setOrders(prev => prev.map(o => o.dbId === dbId ? { ...o, status: 'cancelled' as const } : o));

        await runCancelOrderSideEffects({
          dbId,
          order: {
            id: order.id,
            cardType: order.cardType,
            cardValue: order.cardValue,
            cardWorth: order.cardWorth,
            paymentValue: order.paymentValue,
            demandCurrency: order.demandCurrency,
            foreignRate: order.foreignRate,
            vendor: order.vendor,
            paymentProvider: order.paymentProvider,
            phoneNumber: order.phoneNumber,
            memberCode: order.memberCode,
            actualPaid: order.actualPaid,
            createdAt: order.createdAt,
          },
          beforeState,
          afterState: { ...order, status: 'cancelled' },
          queryClient,
          fetchOrders,
          emitCancelledWebhook: true,
        });
        return true;
      } catch (error) {
        console.error('Failed to cancel order:', error);
        toast.error('取消订单失败');
        return false;
      }
    },
    [orders, setOrders, fetchOrders, isPlatformAdminReadonlyView, queryClient]
  );

  const restoreOrder = useCallback(
    async (dbId: string): Promise<boolean> => {
      if (isPlatformAdminReadonlyView) {
        toast.error('平台总管理查看租户时为只读，无法恢复订单');
        return false;
      }
      try {
        const order = orders.find(o => o.dbId === dbId);
        if (!order) return false;

        const beforeState = { ...order };

        if (order.points_status === 'reversed' && order.order_points > 0) {
          const currency = normalizeCurrencyCode(order.demandCurrency);
          if (currency && order.memberCode && order.phoneNumber) {
            const restored = await restorePointsOnOrderRestore({
              orderId: dbId,
              orderPhoneNumber: order.phoneNumber,
              memberCode: order.memberCode,
              actualPayment: order.actualPaid,
              currency,
            });

            if (restored.success) {
              await supabase
                .from('orders')
                .update({ points_status: 'added' })
                .eq('id', dbId);
            }
          }
        }

        const { error } = await supabase
          .from('orders')
          .update({ status: 'completed' })
          .eq('id', dbId);

        if (error) throw error;

        setOrders(prev => prev.map(o => o.dbId === dbId ? { ...o, status: 'completed' as const } : o));

        await runRestoreOrderSideEffects({
          dbId,
          order: {
            id: order.id,
            cardType: order.cardType,
            cardValue: order.cardValue,
            cardWorth: order.cardWorth,
            paymentValue: order.paymentValue,
            demandCurrency: order.demandCurrency,
            foreignRate: order.foreignRate,
            vendor: order.vendor,
            paymentProvider: order.paymentProvider,
            phoneNumber: order.phoneNumber,
            memberCode: order.memberCode,
            actualPaid: order.actualPaid,
            createdAt: order.createdAt,
          },
          beforeState,
          afterState: { ...order, status: 'completed' },
          queryClient,
          fetchOrders,
          emitCompletedWebhook: true,
        });
        return true;
      } catch (error) {
        console.error('Failed to restore order:', error);
        toast.error('恢复订单失败');
        return false;
      }
    },
    [orders, setOrders, fetchOrders, isPlatformAdminReadonlyView, queryClient]
  );

  const deleteOrder = useCallback(
    async (dbId: string): Promise<boolean> => {
      if (isPlatformAdminReadonlyView) {
        toast.error('平台总管理查看租户时为只读，无法删除订单');
        return false;
      }
      try {
        const order = orders.find(o => o.dbId === dbId);
        if (!order) return false;

        if (order.status === 'cancelled') {
          const { data: existing } = await supabase
            .from('orders')
            .select('is_deleted')
            .eq('id', dbId)
            .single();

          if (existing?.is_deleted) {
            console.warn(`Order ${dbId} is already deleted.`);
            return false;
          }
        }

        const needsReversal = order.status !== 'cancelled';

        if (needsReversal) {
          const reversed = await reversePointsOnOrderCancel(dbId);
          if (reversed && order.points_status === 'added') {
            await supabase
              .from('orders')
              .update({ points_status: 'reversed' })
              .eq('id', dbId);
          }
        }

        const { error } = await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            is_deleted: true,
            deleted_at: new Date().toISOString()
          })
          .eq('id', dbId);

        if (error) throw error;

        setOrders(prev => prev.filter(o => o.dbId !== dbId));

        await runDeleteOrderSideEffects({
          dbId,
          order: {
            id: order.id,
            cardType: order.cardType,
            cardValue: order.cardValue,
            cardWorth: order.cardWorth,
            paymentValue: order.paymentValue,
            demandCurrency: order.demandCurrency,
            foreignRate: order.foreignRate,
            vendor: order.vendor,
            paymentProvider: order.paymentProvider,
            phoneNumber: order.phoneNumber,
            memberCode: order.memberCode,
            actualPaid: order.actualPaid,
            createdAt: order.createdAt,
          },
          beforeState: { ...order, dbId },
          afterState: { ...order, dbId, status: 'cancelled', is_deleted: true },
          queryClient,
          fetchOrders,
          includeCancelBalanceLog: needsReversal,
        });
        return true;
      } catch (error) {
        console.error('Failed to delete order:', error);
        toast.error('删除订单失败');
        return false;
      }
    },
    [orders, setOrders, fetchOrders, isPlatformAdminReadonlyView, queryClient]
  );

  return {
    addOrder,
    updateOrder,
    cancelOrder,
    restoreOrder,
    deleteOrder,
  };
}
