// USDT 订单 Mutations - 从 useUsdtOrders 提取，不修改业务逻辑
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logOperation } from '@/stores/auditLogStore';
import {
  createPointsOnOrderCreate,
  reversePointsOnOrderCancel,
  restorePointsOnOrderRestore,
} from '@/services/pointsService';
import { getEmployeeNameById, getVendorId, getProviderId, getCardIdByName, resolveVendorName, resolveProviderName } from '@/services/nameResolver';
import { logOrderBalanceChange, logOrderCancelBalanceChange, logOrderRestoreBalanceChange } from '@/services/balanceLogService';
import { formatBeijingTime, calculateOrderPointsAsync, generateUniqueOrderNumber } from './utils';
import type { UsdtOrder, OrderResult } from './types';

export interface UseUsdtOrderMutationsParams {
  orders: UsdtOrder[];
  setOrders: (updater: (prev: UsdtOrder[]) => UsdtOrder[]) => void;
  fetchOrders: () => void;
  viewingTenantId: string | null | undefined;
  queryClient: { invalidateQueries: (opts: { queryKey: string[] }) => void };
}

export function useUsdtOrderMutations(params: UseUsdtOrderMutationsParams) {
  const { orders, setOrders, fetchOrders, viewingTenantId, queryClient } = params;

  const addOrder = useCallback(
    async (
      orderData: Omit<UsdtOrder, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'>,
      memberId?: string,
      employeeId?: string
    ): Promise<OrderResult> => {
      if (viewingTenantId) {
        toast.error('只读模式，无法新增订单');
        return { order: null, earnedPoints: 0 };
      }
      try {
        const orderPoints = await calculateOrderPointsAsync(orderData.actualPaidUsdt, 'USDT');

        const vendorUuid = getVendorId(orderData.vendor) || orderData.vendor || null;
        const providerUuid = getProviderId(orderData.paymentProvider) || orderData.paymentProvider || null;
        const cardTypeUuid = getCardIdByName(orderData.cardType) || orderData.cardType || null;

        const orderNumber = await generateUniqueOrderNumber();

        const dbOrder = {
          order_number: orderNumber,
          order_type: cardTypeUuid,
          card_value: orderData.cardValue,
          exchange_rate: orderData.cardRate,
          foreign_rate: Number((orderData.usdtRate || 0).toFixed(4)),
          amount: orderData.cardWorth,
          actual_payment: orderData.actualPaidUsdt,
          fee: orderData.feeUsdt,
          payment_value: orderData.paymentValue,
          vendor_id: providerUuid,
          card_merchant_id: vendorUuid,
          profit_usdt: orderData.profit,
          profit_rate: orderData.profitRate,
          phone_number: orderData.phoneNumber,
          currency: 'USDT',
          creator_id: employeeId || null,
          sales_user_id: employeeId || null,
          member_id: memberId || null,
          member_code_snapshot: orderData.memberCode || null,
          remark: orderData.remark,
          status: 'completed',
          order_points: orderPoints,
          points_status: 'none',
          data_version: 2,
        };

        const { data, error } = await supabase
          .from('orders')
          .insert(dbOrder)
          .select('*')
          .single();

        if (error) throw error;

        const dbUuid = data.id;
        const memberCode = (data as any).member_code_snapshot || orderData.memberCode;

        let earnedPoints = 0;
        if (orderPoints > 0 && memberCode && orderData.phoneNumber) {
          try {
            const pointsResult = await createPointsOnOrderCreate({
              orderId: dbUuid,
              orderPhoneNumber: orderData.phoneNumber,
              memberCode: memberCode,
              actualPayment: orderData.actualPaidUsdt,
              currency: 'USDT',
              creatorId: employeeId,
            });

            if (pointsResult.success) {
              earnedPoints = orderPoints;

              (async () => {
                try {
                  await supabase
                    .from('orders')
                    .update({ points_status: 'added' })
                    .eq('id', dbUuid);
                } catch (err) {
                  console.error('[useUsdtOrders] Points status update failed:', err);
                }
              })();
            }
          } catch (err) {
            console.error('[useUsdtOrders] Points creation failed:', err);
          }
        }

        const newOrder: UsdtOrder = {
          id: data.order_number,
          dbId: dbUuid,
          createdAt: formatBeijingTime(data.created_at),
          cardType: orderData.cardType,
          cardValue: orderData.cardValue,
          cardRate: orderData.cardRate,
          cardWorth: orderData.cardWorth,
          usdtRate: orderData.usdtRate,
          totalValueUsdt: orderData.totalValueUsdt,
          actualPaidUsdt: orderData.actualPaidUsdt,
          feeUsdt: orderData.feeUsdt,
          paymentValue: orderData.paymentValue,
          profit: orderData.profit,
          profitRate: orderData.profitRate,
          vendor: orderData.vendor,
          paymentProvider: orderData.paymentProvider,
          phoneNumber: orderData.phoneNumber,
          memberCode: memberCode,
          demandCurrency: 'USDT',
          salesPerson: orderData.salesPerson,
          remark: orderData.remark,
          status: 'completed',
          order_points: orderPoints,
          points_status: earnedPoints > 0 ? 'added' : 'none',
        };

        const vendorName = resolveVendorName(orderData.vendor);
        const providerName = resolveProviderName(orderData.paymentProvider);

        try {
          await logOrderBalanceChange({
            vendorName,
            providerName,
            cardWorth: newOrder.cardWorth,
            paymentValue: newOrder.paymentValue,
            actualPaid: newOrder.actualPaidUsdt,
            currency: 'USDT',
            foreignRate: newOrder.usdtRate,
            orderId: dbUuid,
            orderNumber: data.order_number,
            operatorId: employeeId,
            operatorName: employeeId ? getEmployeeNameById(employeeId) : undefined,
          });
        } catch (logErr) {
          console.error('[useUsdtOrders] Balance log failed:', logErr);
        }

        queryClient.invalidateQueries({ queryKey: ['usdt-orders'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
        window.dispatchEvent(new CustomEvent('report-cache-invalidate'));
        window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
        return { order: newOrder as any, earnedPoints };
      } catch (error) {
        console.error('Failed to add USDT order:', error);
        toast.error('创建USDT订单失败');
        return { order: null, earnedPoints: 0 };
      }
    },
    [viewingTenantId, queryClient]
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
          console.warn(`USDT Order ${dbId} is already cancelled.`);
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
          currency: 'USDT',
          foreignRate: order.usdtRate,
          orderId: dbId,
          orderNumber: order.id,
          orderCreatedAt: order.createdAt,
        }).catch(logErr => console.error('[useUsdtOrders] Balance cancel log failed:', logErr));

        logOperation('order_management', 'cancel', dbId,
          beforeState,
          { ...order, status: 'cancelled' },
          `取消USDT订单: ${order.id}`);

        fetchOrders();
        queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
        window.dispatchEvent(new CustomEvent('report-cache-invalidate'));
        window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
        return true;
      } catch (error) {
        console.error('Failed to cancel USDT order:', error);
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

        if (order.points_status === 'reversed' && order.order_points > 0 && order.memberCode && order.phoneNumber) {
          const restored = await restorePointsOnOrderRestore({
            orderId: dbId,
            orderPhoneNumber: order.phoneNumber,
            memberCode: order.memberCode,
            actualPayment: order.actualPaidUsdt,
            currency: 'USDT',
          });

          if (restored.success) {
            await supabase
              .from('orders')
              .update({ points_status: 'added' })
              .eq('id', dbId);
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
          currency: 'USDT',
          foreignRate: order.usdtRate,
          orderId: dbId,
          orderNumber: order.id,
          orderCreatedAt: order.createdAt,
        }).catch(logErr => console.error('[useUsdtOrders] Balance restore log failed:', logErr));

        logOperation('order_management', 'restore', dbId,
          beforeState,
          { ...order, status: 'completed' },
          `恢复USDT订单: ${order.id}`);

        import('@/services/webhookService').then(({ triggerOrderCompleted }) => {
          triggerOrderCompleted({
            id: dbId,
            orderNumber: order.id,
            phoneNumber: order.phoneNumber,
            memberCode: order.memberCode,
            currency: 'USDT',
            amount: order.cardWorth,
            actualPaid: order.actualPaidUsdt,
            cardType: order.cardType,
            completedAt: new Date().toISOString(),
          }).catch(err => console.error('[useOrders] Webhook trigger failed:', err));
        });

        fetchOrders();
        queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
        window.dispatchEvent(new CustomEvent('report-cache-invalidate'));
        window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
        return true;
      } catch (error) {
        console.error('Failed to restore USDT order:', error);
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
            console.warn(`USDT Order ${dbId} is already deleted.`);
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

        if (needsReversal) {
          const vendorName = resolveVendorName(order.vendor);
          const providerName = resolveProviderName(order.paymentProvider);

          try {
            await logOrderCancelBalanceChange({
              vendorName,
              providerName,
              cardWorth: order.cardWorth,
              paymentValue: order.paymentValue,
              currency: 'USDT',
              foreignRate: order.usdtRate,
              orderId: dbId,
              orderNumber: order.id,
              orderCreatedAt: order.createdAt,
            });
          } catch (logErr) {
            console.error('[deleteUsdtOrder] Balance log failed:', logErr);
          }
        }

        logOperation(
          'order_management',
          'delete',
          dbId,
          { ...order, dbId },
          { ...order, dbId, status: 'cancelled', is_deleted: true },
          `删除USDT订单: ${order.id} - ${order.cardType} ¥${order.cardValue}`
        );

        window.dispatchEvent(new CustomEvent('points-updated'));

        setOrders(prev => prev.filter(o => o.dbId !== dbId));
        fetchOrders();
        queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
        window.dispatchEvent(new CustomEvent('report-cache-invalidate'));
        window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
        return true;
      } catch (error) {
        console.error('Failed to delete USDT order:', error);
        toast.error('删除USDT订单失败');
        return false;
      }
    },
    [orders, setOrders, fetchOrders, viewingTenantId, queryClient]
  );

  return {
    addOrder,
    cancelOrder,
    restoreOrder,
    deleteOrder,
  };
}
