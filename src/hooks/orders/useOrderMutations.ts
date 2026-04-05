// 普通订单 Mutations - 从 useOrders 提取，不修改业务逻辑
import { useCallback } from 'react';
import { notify } from "@/lib/notifyHub";
import { normalizeCurrencyCode } from '@/config/currencies';
import {
  restorePointsOnOrderRestore,
} from '@/services/points/pointsService';
import { mapDbOrderToOrder, mapOrderToDbAsync, calculateOrderPointsAsync, formatBeijingTime } from './utils';
import type { Order, OrderResult } from './types';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import {
  runCreateOrderSideEffects,
  runCancelOrderSideEffects,
  runRestoreOrderSideEffects,
  runDeleteOrderSideEffects,
} from '@/services/orders/orderSideEffectOrchestrator';
import { checkMyTenantQuotaResult, getQuotaExceededText, getQuotaSoftExceededText } from '@/services/tenantQuotaService';
import { canMutateOrderInCurrentView } from '@/lib/order/canMutateOrder';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  cancelOrderUseCase,
  createOrderUseCase,
  getOrderDeleteStateUseCase,
  restoreOrderUseCase,
  softDeleteOrderUseCase,
  updateOrderPointsStatusUseCase,
  updateOrderUseCase,
} from '@/services/orders/orderLifecycleUseCases';

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
  const tenantIdForNewOrder = viewingTenantId || employee?.tenant_id || null;
  const { t } = useLanguage();
  const isPlatformAdminReadonlyView = !canMutateOrderInCurrentView({
    isPlatformSuperAdmin: employee?.is_platform_super_admin,
    isViewingTenant,
    viewingTenantId,
    ownTenantId: employee?.tenant_id,
  });

  const addOrder = useCallback(
    async (
      orderData: Omit<Order, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'>,
      memberId?: string,
      employeeId?: string,
      memberCode?: string,
      opts?: { meikaZone?: boolean },
    ): Promise<OrderResult> => {
      if (isPlatformAdminReadonlyView) {
        notify.error(t('平台总管理查看租户时为只读，无法新增订单', 'Read-only in admin view, cannot create order'));
        return { order: null, earnedPoints: 0 };
      }
      try {
        const quotaResult = await checkMyTenantQuotaResult("daily_orders");
        if (!quotaResult.ok) {
          const quotaText = getQuotaExceededText(quotaResult.error.message);
          notify.error(quotaText?.zh || t('今日订单数量已达到租户配额上限', 'Daily order quota exceeded'));
          return { order: null, earnedPoints: 0 };
        }
        const softQuotaText = getQuotaSoftExceededText(quotaResult.data?.message);
        if (softQuotaText) {
          notify.warning(softQuotaText.zh);
        }
        const currency = normalizeCurrencyCode(orderData.demandCurrency);
        const orderPoints = currency ? await calculateOrderPointsAsync(orderData.actualPaid, currency) : 0;
        const dbOrder = await mapOrderToDbAsync(orderData, orderPoints, memberId, employeeId, memberCode, tenantIdForNewOrder);
        const payload: Record<string, unknown> = { ...dbOrder };
        if (opts?.meikaZone) payload.meika_zone = true;

        const data = await createOrderUseCase(payload);

        const dbUuid = data.id;
        const newOrder = {
          ...mapDbOrderToOrder(data),
          memberCode: memberCode || (data as any).member_code_snapshot || '',
        };

        let earnedPoints = 0;
        try {
          const orchestrated = await runCreateOrderSideEffects({
            dbId: dbUuid,
            orderNumber: data.order_number || '',
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
            createdAt: formatBeijingTime(data.created_at) || (data.created_at as string) || '',
            queryClient,
          });
          earnedPoints = orchestrated.earnedPoints;
          newOrder.points_status = orchestrated.pointsStatus;
        } catch (sideEffectErr) {
          console.error('Order created but side effects failed:', sideEffectErr);
        }
        if (opts?.meikaZone) {
          void queryClient.invalidateQueries({ queryKey: ['meika-fiat-orders'] });
          void queryClient.invalidateQueries({ queryKey: ['meika-usdt-orders'] });
        }
        return { order: newOrder, earnedPoints };
      } catch (error) {
        console.error('Failed to add order:', error);
        notify.error(t('创建订单失败', 'Failed to create order'));
        return { order: null, earnedPoints: 0 };
      }
    },
    [isPlatformAdminReadonlyView, queryClient, tenantIdForNewOrder, t]
  );

  const updateOrder = useCallback(
    async (dbId: string, updates: Partial<Order>): Promise<Order | null> => {
      if (isPlatformAdminReadonlyView) {
        notify.error(t('平台总管理查看租户时为只读，无法修改订单', 'Read-only in admin view, cannot modify order'));
        return null;
      }
      try {
        const data = await updateOrderUseCase(dbId, {
          remark: updates.remark,
          status: updates.status,
        });
        return mapDbOrderToOrder(data);
      } catch (error) {
        console.error('Failed to update order:', error);
        notify.error(t('更新订单失败', 'Failed to update order'));
        return null;
      }
    },
    [isPlatformAdminReadonlyView, t]
  );

  const cancelOrder = useCallback(
    async (dbId: string): Promise<boolean> => {
      if (isPlatformAdminReadonlyView) {
        notify.error(t('平台总管理查看租户时为只读，无法取消订单', 'Read-only in admin view, cannot cancel order'));
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

        await cancelOrderUseCase(dbId);

        // C1 fix: table proxy handles reverseActivityDataForOrder on status change;
        // only update points_status flag here to avoid double-reversal.
        if (order.points_status === 'added') {
          await updateOrderPointsStatusUseCase(dbId, 'reversed');
        }

        setOrders(prev => prev.map(o => o.dbId === dbId ? { ...o, status: 'cancelled' as const } : o));

        try {
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
        } catch (sideEffectErr) {
          console.error('Order cancelled but side effects failed:', sideEffectErr);
          notify.warning(t('订单已取消，但日志/账变等后续操作未完成', 'Order cancelled, but logging/balance side effects incomplete'));
        }
        void queryClient.invalidateQueries({ queryKey: ['meika-fiat-orders'] });
        void queryClient.invalidateQueries({ queryKey: ['meika-usdt-orders'] });
        return true;
      } catch (error) {
        console.error('Failed to cancel order:', error);
        notify.error(t('取消订单失败', 'Failed to cancel order'));
        return false;
      }
    },
    [orders, setOrders, fetchOrders, isPlatformAdminReadonlyView, queryClient, t]
  );

  const restoreOrder = useCallback(
    async (dbId: string): Promise<boolean> => {
      if (isPlatformAdminReadonlyView) {
        notify.error(t('平台总管理查看租户时为只读，无法恢复订单', 'Read-only in admin view, cannot restore order'));
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
              await updateOrderPointsStatusUseCase(dbId, 'added');
            }
          }
        }

        await restoreOrderUseCase(dbId);

        setOrders(prev => prev.map(o => o.dbId === dbId ? { ...o, status: 'completed' as const } : o));

        try {
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
        } catch (sideEffectErr) {
          console.error('Order restored but side effects failed:', sideEffectErr);
          notify.warning(t('订单已恢复，但日志/账变等后续操作未完成', 'Order restored, but logging/balance side effects incomplete'));
        }
        void queryClient.invalidateQueries({ queryKey: ['meika-fiat-orders'] });
        void queryClient.invalidateQueries({ queryKey: ['meika-usdt-orders'] });
        return true;
      } catch (error) {
        console.error('Failed to restore order:', error);
        notify.error(t('恢复订单失败', 'Failed to restore order'));
        return false;
      }
    },
    [orders, setOrders, fetchOrders, isPlatformAdminReadonlyView, queryClient, t]
  );

  const deleteOrder = useCallback(
    async (dbId: string): Promise<boolean> => {
      if (isPlatformAdminReadonlyView) {
        notify.error(t('平台总管理查看租户时为只读，无法删除订单', 'Read-only in admin view, cannot delete order'));
        return false;
      }
      const order = orders.find(o => o.dbId === dbId);
      if (!order) return false;

      let needsReversal = false;
      try {
        if (order.status === 'cancelled') {
          const existing = await getOrderDeleteStateUseCase(dbId);

          if (existing?.is_deleted) {
            console.warn(`Order ${dbId} is already deleted.`);
            return false;
          }
        }

        needsReversal = order.status !== 'cancelled';

        await softDeleteOrderUseCase(dbId);

        // C1 fix: table proxy handles reverseActivityDataForOrder on status change;
        // only update points_status flag here to avoid double-reversal.
        if (needsReversal && order.points_status === 'added') {
          await updateOrderPointsStatusUseCase(dbId, 'reversed');
        }

        setOrders(prev => prev.filter(o => o.dbId !== dbId));
      } catch (error) {
        console.error('Failed to delete order:', error);
        notify.error(t('删除订单失败', 'Failed to delete order'));
        return false;
      }

      try {
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
      } catch (sideErr) {
        console.error('[OrderMutations] Post-delete side effects failed (order already deleted):', sideErr);
        notify.warning(t('订单已删除，但日志/账变等后续操作未完成', 'Order deleted, but logging/balance side effects incomplete'));
      }
      void queryClient.invalidateQueries({ queryKey: ['meika-fiat-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['meika-usdt-orders'] });
      return true;
    },
    [orders, setOrders, fetchOrders, isPlatformAdminReadonlyView, queryClient, t]
  );

  return {
    addOrder,
    updateOrder,
    cancelOrder,
    restoreOrder,
    deleteOrder,
  };
}
