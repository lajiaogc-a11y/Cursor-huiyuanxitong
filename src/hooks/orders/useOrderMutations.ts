// 普通订单 Mutations - 从 useOrders 提取，不修改业务逻辑
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logOperation } from '@/stores/auditLogStore';
import { normalizeCurrencyCode } from '@/config/currencies';
import {
  createPointsOnOrderCreate,
  reversePointsOnOrderCancel,
  restorePointsOnOrderRestore,
} from '@/services/pointsService';
import { getEmployeeNameById, resolveVendorName, resolveProviderName } from '@/services/nameResolver';
import { logOrderBalanceChange, logOrderCancelBalanceChange, logOrderRestoreBalanceChange } from '@/services/balanceLogService';
import { mapDbOrderToOrder, mapOrderToDbAsync, calculateOrderPointsAsync } from './utils';
import type { Order, OrderResult } from './types';
import { notifyDataMutation } from '@/services/dataRefreshManager';

export interface UseOrderMutationsParams {
  orders: Order[];
  setOrders: (updater: (prev: Order[]) => Order[]) => void;
  fetchOrders: () => void;
  viewingTenantId: string | null | undefined;
  queryClient: { invalidateQueries: (opts: { queryKey: string[] }) => void };
}

export function useOrderMutations(params: UseOrderMutationsParams) {
  const { orders, setOrders, fetchOrders, viewingTenantId, queryClient } = params;

  const addOrder = useCallback(
    async (
      orderData: Omit<Order, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'>,
      memberId?: string,
      employeeId?: string,
      memberCode?: string
    ): Promise<OrderResult> => {
      if (viewingTenantId) {
        toast.error('只读模式，无法新增订单');
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

        let earnedPoints = 0;
        if (currency && orderPoints > 0 && newOrder.memberCode && newOrder.phoneNumber) {
          try {
            const pointsResult = await createPointsOnOrderCreate({
              orderId: dbUuid,
              orderPhoneNumber: newOrder.phoneNumber,
              memberCode: newOrder.memberCode,
              actualPayment: newOrder.actualPaid,
              currency,
              creatorId: employeeId,
            });

            if (pointsResult.success) {
              earnedPoints = orderPoints;
              newOrder.points_status = 'added';

              (async () => {
                try {
                  await supabase
                    .from('orders')
                    .update({ points_status: 'added' })
                    .eq('id', dbUuid);
                } catch (err) {
                  console.error('[useOrders] Points status update failed:', err);
                }
              })();
            }
          } catch (err) {
            console.error('[useOrders] Points creation failed:', err);
          }
        }

        setTimeout(() => {
          logOperation(
            'order_management',
            'create',
            newOrder.id,
            null,
            newOrder,
            `新增订单: ${newOrder.cardType} ¥${newOrder.cardValue}`
          );
        }, 0);

        const vendorName = resolveVendorName(orderData.vendor);
        const providerName = resolveProviderName(orderData.paymentProvider);

        try {
          await logOrderBalanceChange({
            vendorName,
            providerName,
            cardWorth: newOrder.cardWorth,
            paymentValue: newOrder.paymentValue,
            actualPaid: newOrder.actualPaid,
            currency: newOrder.demandCurrency,
            foreignRate: newOrder.foreignRate,
            orderId: dbUuid,
            orderNumber: data.order_number,
            operatorId: employeeId,
            operatorName: employeeId ? getEmployeeNameById(employeeId) : undefined,
          });
        } catch (logErr) {
          console.error('[useOrders] Balance log failed:', logErr);
        }

        import('@/services/webhookService').then(({ triggerOrderCreated }) => {
          triggerOrderCreated({
            id: dbUuid,
            orderNumber: data.order_number,
            phoneNumber: newOrder.phoneNumber,
            memberCode: newOrder.memberCode,
            currency: newOrder.demandCurrency,
            amount: newOrder.cardWorth,
            actualPaid: newOrder.actualPaid,
            cardType: newOrder.cardType,
            createdAt: data.created_at,
          }).catch(err => console.error('[useOrders] Webhook trigger failed:', err));
        });

        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
        notifyDataMutation({ table: 'orders', operation: 'INSERT', source: 'mutation' }).catch(console.error);
        return { order: newOrder, earnedPoints };
      } catch (error) {
        console.error('Failed to add order:', error);
        toast.error('创建订单失败');
        return { order: null, earnedPoints: 0 };
      }
    },
    [viewingTenantId, queryClient]
  );

  const updateOrder = useCallback(
    async (dbId: string, updates: Partial<Order>): Promise<Order | null> => {
      if (viewingTenantId) {
        toast.error('只读模式，无法修改订单');
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
    [viewingTenantId]
  );

  const cancelOrder = useCallback(
    async (dbId: string): Promise<boolean> => {
      if (viewingTenantId) {
        toast.error('只读模式，无法取消订单');
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

        const vendorName = resolveVendorName(order.vendor);
        const providerName = resolveProviderName(order.paymentProvider);

        logOrderCancelBalanceChange({
          vendorName,
          providerName,
          cardWorth: order.cardWorth,
          paymentValue: order.paymentValue,
          currency: order.demandCurrency,
          foreignRate: order.foreignRate,
          orderId: dbId,
          orderNumber: order.id,
          orderCreatedAt: order.createdAt,
        }).catch(logErr => console.error('[useOrders] Balance cancel log failed:', logErr));

        logOperation('order_management', 'cancel', dbId,
          beforeState,
          { ...order, status: 'cancelled' },
          `取消订单: ${order.id}`);

        import('@/services/webhookService').then(({ triggerOrderCancelled }) => {
          triggerOrderCancelled({
            id: dbId,
            orderNumber: order.id,
            phoneNumber: order.phoneNumber,
            memberCode: order.memberCode,
            currency: order.demandCurrency,
            amount: order.cardWorth,
            cancelledAt: new Date().toISOString(),
          }).catch(err => console.error('[useOrders] Webhook trigger failed:', err));
        });

        fetchOrders();
        queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
        notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'mutation' }).catch(console.error);
        return true;
      } catch (error) {
        console.error('Failed to cancel order:', error);
        toast.error('取消订单失败');
        return false;
      }
    },
    [orders, setOrders, fetchOrders, viewingTenantId, queryClient]
  );

  const restoreOrder = useCallback(
    async (dbId: string): Promise<boolean> => {
      if (viewingTenantId) {
        toast.error('只读模式，无法恢复订单');
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

        const vendorName = resolveVendorName(order.vendor);
        const providerName = resolveProviderName(order.paymentProvider);

        logOrderRestoreBalanceChange({
          vendorName,
          providerName,
          cardWorth: order.cardWorth,
          paymentValue: order.paymentValue,
          currency: order.demandCurrency,
          foreignRate: order.foreignRate,
          orderId: dbId,
          orderNumber: order.id,
          orderCreatedAt: order.createdAt,
        }).catch(logErr => console.error('[useOrders] Balance restore log failed:', logErr));

        logOperation('order_management', 'restore', dbId,
          beforeState,
          { ...order, status: 'completed' },
          `恢复订单: ${order.id}`);

        import('@/services/webhookService').then(({ triggerOrderCompleted }) => {
          triggerOrderCompleted({
            id: dbId,
            orderNumber: order.id,
            phoneNumber: order.phoneNumber,
            memberCode: order.memberCode,
            currency: order.demandCurrency,
            amount: order.cardWorth,
            actualPaid: order.actualPaid,
            cardType: order.cardType,
            completedAt: new Date().toISOString(),
          }).catch(err => console.error('[useOrders] Webhook trigger failed:', err));
        });

        fetchOrders();
        queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
        notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'mutation' }).catch(console.error);
        return true;
      } catch (error) {
        console.error('Failed to restore order:', error);
        toast.error('恢复订单失败');
        return false;
      }
    },
    [orders, setOrders, fetchOrders, viewingTenantId, queryClient]
  );

  const deleteOrder = useCallback(
    async (dbId: string): Promise<boolean> => {
      if (viewingTenantId) {
        toast.error('只读模式，无法删除订单');
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

        const vendorName = resolveVendorName(order.vendor);
        const providerName = resolveProviderName(order.paymentProvider);

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

        if (needsReversal) {
          logOrderCancelBalanceChange({
            vendorName,
            providerName,
            cardWorth: order.cardWorth,
            paymentValue: order.paymentValue,
            currency: order.demandCurrency,
            foreignRate: order.foreignRate,
            orderId: dbId,
            orderNumber: order.id,
            orderCreatedAt: order.createdAt,
          }).catch(logErr => console.error('[deleteOrder] Balance log failed:', logErr));
        }

        logOperation(
          'order_management',
          'delete',
          dbId,
          { ...order, dbId },
          { ...order, dbId, status: 'cancelled', is_deleted: true },
          `删除订单: ${order.id} - ${order.cardType} ¥${order.cardValue}`
        );

        fetchOrders();
        queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
        notifyDataMutation({ table: 'orders', operation: 'DELETE', source: 'mutation' }).catch(console.error);
        return true;
      } catch (error) {
        console.error('Failed to delete order:', error);
        toast.error('删除订单失败');
        return false;
      }
    },
    [orders, setOrders, fetchOrders, viewingTenantId, queryClient]
  );

  return {
    addOrder,
    updateOrder,
    cancelOrder,
    restoreOrder,
    deleteOrder,
  };
}
