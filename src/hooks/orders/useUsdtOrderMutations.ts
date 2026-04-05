// USDT 订单 Mutations - 从 useUsdtOrders 提取，不修改业务逻辑
import { useCallback } from 'react';
import { notify } from "@/lib/notifyHub";
import {
  reversePointsOnOrderCancel,
  restorePointsOnOrderRestore,
} from '@/services/points/pointsService';
import { formatBeijingTime, calculateOrderPointsAsync, mapUsdtOrderToDbAsync } from './utils';
import type { UsdtOrder, OrderResult } from './types';
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
} from '@/services/orders/orderLifecycleUseCases';

export interface UseUsdtOrderMutationsParams {
  orders: UsdtOrder[];
  setOrders: (updater: (prev: UsdtOrder[]) => UsdtOrder[]) => void;
  fetchOrders: () => void;
  viewingTenantId: string | null | undefined;
  queryClient: { invalidateQueries: (opts: { queryKey: string[] }) => void };
}

export function useUsdtOrderMutations(params: UseUsdtOrderMutationsParams) {
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
      orderData: Omit<UsdtOrder, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'>,
      memberId?: string,
      employeeId?: string
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
        const orderPoints = await calculateOrderPointsAsync(orderData.actualPaidUsdt, 'USDT');
        const dbOrder = await mapUsdtOrderToDbAsync(
          orderData,
          orderPoints,
          memberId,
          employeeId,
          tenantIdForNewOrder,
        );

        const data = await createOrderUseCase(dbOrder as Record<string, unknown>);

        const dbUuid = data.id;
        const memberCode = (data as any).member_code_snapshot || orderData.memberCode;

        const newOrder: UsdtOrder = {
          id: data.order_number || '',
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
          points_status: 'none',
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
              actualPaid: newOrder.actualPaidUsdt,
              demandCurrency: 'USDT',
              foreignRate: newOrder.usdtRate,
              vendor: newOrder.vendor,
              paymentProvider: newOrder.paymentProvider,
              phoneNumber: newOrder.phoneNumber,
              memberCode: newOrder.memberCode,
            },
            orderPoints,
            employeeId,
            createdAt: data.created_at || '',
            queryClient,
          });
          earnedPoints = orchestrated.earnedPoints;
          newOrder.points_status = orchestrated.pointsStatus;
        } catch (sideEffectErr) {
          console.error('USDT order created but side effects failed:', sideEffectErr);
        }
        return { order: newOrder as any, earnedPoints };
      } catch (error) {
        console.error('Failed to add USDT order:', error);
        notify.error(t('创建USDT订单失败', 'Failed to create USDT order'));
        return { order: null, earnedPoints: 0 };
      }
    },
    [isPlatformAdminReadonlyView, queryClient, tenantIdForNewOrder, t]
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
          console.warn(`USDT Order ${dbId} is already cancelled.`);
          return false;
        }

        const beforeState = { ...order };

        if (order.points_status === 'added') {
          const reversed = await reversePointsOnOrderCancel(dbId);
          if (reversed) {
            await updateOrderPointsStatusUseCase(dbId, 'reversed');
          }
        }

        await cancelOrderUseCase(dbId);

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
              demandCurrency: 'USDT',
              foreignRate: order.usdtRate,
              vendor: order.vendor,
              paymentProvider: order.paymentProvider,
              phoneNumber: order.phoneNumber,
              memberCode: order.memberCode,
              actualPaid: order.actualPaidUsdt,
              createdAt: order.createdAt,
            },
            beforeState,
            afterState: { ...order, status: 'cancelled' },
            queryClient,
            fetchOrders,
            isUsdt: true,
            emitCancelledWebhook: false,
          });
        } catch (sideEffectErr) {
          console.error('USDT order cancelled but side effects failed:', sideEffectErr);
          notify.warning(t('订单已取消，但日志/账变等后续操作未完成', 'Order cancelled, but logging/balance side effects incomplete'));
        }
        void queryClient.invalidateQueries({ queryKey: ['meika-fiat-orders'] });
        void queryClient.invalidateQueries({ queryKey: ['meika-usdt-orders'] });
        return true;
      } catch (error) {
        console.error('Failed to cancel USDT order:', error);
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

        if (order.points_status === 'reversed' && order.order_points > 0 && order.memberCode && order.phoneNumber) {
          const restored = await restorePointsOnOrderRestore({
            orderId: dbId,
            orderPhoneNumber: order.phoneNumber,
            memberCode: order.memberCode,
            actualPayment: order.actualPaidUsdt,
            currency: 'USDT',
          });

          if (restored.success) {
            await updateOrderPointsStatusUseCase(dbId, 'added');
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
              demandCurrency: 'USDT',
              foreignRate: order.usdtRate,
              vendor: order.vendor,
              paymentProvider: order.paymentProvider,
              phoneNumber: order.phoneNumber,
              memberCode: order.memberCode,
              actualPaid: order.actualPaidUsdt,
              createdAt: order.createdAt,
            },
            beforeState,
            afterState: { ...order, status: 'completed' },
            queryClient,
            fetchOrders,
            isUsdt: true,
            emitCompletedWebhook: true,
          });
        } catch (sideEffectErr) {
          console.error('USDT order restored but side effects failed:', sideEffectErr);
          notify.warning(t('订单已恢复，但日志/账变等后续操作未完成', 'Order restored, but logging/balance side effects incomplete'));
        }
        void queryClient.invalidateQueries({ queryKey: ['meika-fiat-orders'] });
        void queryClient.invalidateQueries({ queryKey: ['meika-usdt-orders'] });
        return true;
      } catch (error) {
        console.error('Failed to restore USDT order:', error);
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
            console.warn(`USDT Order ${dbId} is already deleted.`);
            return false;
          }
        }

        needsReversal = order.status !== 'cancelled';

        if (needsReversal) {
          const reversed = await reversePointsOnOrderCancel(dbId);
          if (reversed && order.points_status === 'added') {
            await updateOrderPointsStatusUseCase(dbId, 'reversed');
          }
        }

        await softDeleteOrderUseCase(dbId);

        setOrders(prev => prev.filter(o => o.dbId !== dbId));
      } catch (error) {
        console.error('Failed to delete USDT order:', error);
        notify.error(t('删除USDT订单失败', 'Failed to delete USDT order'));
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
            demandCurrency: 'USDT',
            foreignRate: order.usdtRate,
            vendor: order.vendor,
            paymentProvider: order.paymentProvider,
            phoneNumber: order.phoneNumber,
            memberCode: order.memberCode,
            actualPaid: order.actualPaidUsdt,
            createdAt: order.createdAt,
          },
          beforeState: { ...order, dbId },
          afterState: { ...order, dbId, status: 'cancelled', is_deleted: true },
          queryClient,
          fetchOrders,
          isUsdt: true,
          includeCancelBalanceLog: needsReversal,
        });
      } catch (sideErr) {
        console.error('[UsdtOrderMutations] Post-delete side effects failed (order already deleted):', sideErr);
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
    cancelOrder,
    restoreOrder,
    deleteOrder,
  };
}
