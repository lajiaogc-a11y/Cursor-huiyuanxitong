import { logOperation } from "@/services/audit/auditLogService";
import { normalizeCurrencyCode } from "@/config/currencies";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import { createPointsOnOrderCreate } from "@/services/points/pointsService";
import {
  logOrderBalanceChange,
  logOrderCancelBalanceChange,
  logOrderRestoreBalanceChange,
} from "@/services/finance/balanceLogService";
import { getEmployeeNameById, resolveProviderName, resolveVendorName } from "@/services/members/nameResolver";

export interface CreateOrderSideEffectsInput {
  dbId: string;
  orderNumber: string;
  order: {
    id: string;
    cardType: string;
    cardValue: number;
    cardWorth: number;
    paymentValue: number;
    actualPaid: number;
    demandCurrency: string;
    foreignRate: number;
    vendor: string;
    paymentProvider: string;
    phoneNumber: string;
    memberCode: string;
  };
  orderPoints: number;
  employeeId?: string;
  createdAt: string;
  queryClient: { invalidateQueries: (opts: { queryKey: string[] }) => void };
}

export interface CreateOrderSideEffectsResult {
  earnedPoints: number;
  pointsStatus: "none" | "added";
}

interface LifecycleOrderContext {
  id: string;
  cardType: string;
  cardValue: number;
  cardWorth: number;
  paymentValue: number;
  demandCurrency: string;
  foreignRate: number;
  vendor: string;
  paymentProvider: string;
  phoneNumber: string;
  memberCode: string;
  actualPaid: number;
  createdAt: string;
}

interface LifecycleSideEffectsInput {
  dbId: string;
  order: LifecycleOrderContext;
  beforeState: unknown;
  afterState: unknown;
  queryClient: { invalidateQueries: (opts: { queryKey: string[] }) => void };
  fetchOrders: () => void;
  isUsdt?: boolean;
  includeCancelBalanceLog?: boolean;
  includeRestoreBalanceLog?: boolean;
  emitCancelledWebhook?: boolean;
  emitCompletedWebhook?: boolean;
}

function invalidateOrderRelatedQueries(
  queryClient: { invalidateQueries: (opts: { queryKey: string[] }) => void },
  operation: "INSERT" | "UPDATE" | "DELETE"
) {
  queryClient.invalidateQueries({ queryKey: ["orders"] });
  queryClient.invalidateQueries({ queryKey: ["usdt-orders"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard-trend"] });
  queryClient.invalidateQueries({ queryKey: ["profit-compare-current"] });
  queryClient.invalidateQueries({ queryKey: ["profit-compare-previous"] });
  notifyDataMutation({ table: "orders", operation, source: "mutation" }).catch(console.error);
}

export async function runCreateOrderSideEffects(
  input: CreateOrderSideEffectsInput
): Promise<CreateOrderSideEffectsResult> {
  const {
    dbId,
    orderNumber,
    order,
    orderPoints,
    employeeId,
    createdAt,
    queryClient,
  } = input;
  let earnedPoints = 0;
  let pointsStatus: "none" | "added" = "none";

  const pointsCurrency = normalizeCurrencyCode(order.demandCurrency);
  if (pointsCurrency && orderPoints > 0 && order.memberCode && order.phoneNumber) {
    try {
      const pointsResult = await createPointsOnOrderCreate({
        orderId: dbId,
        orderPhoneNumber: order.phoneNumber,
        memberCode: order.memberCode,
        actualPayment: order.actualPaid,
        currency: pointsCurrency,
        creatorId: employeeId,
      });
      if (pointsResult.success) {
        earnedPoints = orderPoints;
        pointsStatus = "added";
        await import('@/services/orders/ordersApiService').then(m => m.updateOrderPointsApi(dbId, { points_status: 'added' }));
      }
    } catch (err) {
      console.error("[OrderSideEffectOrchestrator] Points side effect failed:", err);
    }
  }

  // 审计与余额日志不阻塞主流程
  setTimeout(() => {
    logOperation(
      "order_management",
      "create",
      order.id,
      null,
      { ...order, points_status: pointsStatus },
      `新增订单: ${order.cardType} ¥${order.cardValue}`
    );
  }, 0);

  try {
    await logOrderBalanceChange({
      vendorName: resolveVendorName(order.vendor),
      providerName: resolveProviderName(order.paymentProvider),
      cardWorth: order.cardWorth,
      paymentValue: order.paymentValue,
      actualPaid: order.actualPaid,
      currency: order.demandCurrency,
      foreignRate: order.foreignRate,
      orderId: dbId,
      orderNumber,
      operatorId: employeeId,
      operatorName: employeeId ? getEmployeeNameById(employeeId) : undefined,
    });
  } catch (logErr) {
    console.error("[OrderSideEffectOrchestrator] Balance log failed:", logErr);
  }

  import("@/services/webhookService").then(({ triggerOrderCreated }) => {
    triggerOrderCreated({
      id: dbId,
      orderNumber,
      phoneNumber: order.phoneNumber,
      memberCode: order.memberCode,
      currency: order.demandCurrency,
      amount: order.cardWorth,
      actualPaid: order.actualPaid,
      cardType: order.cardType,
      createdAt,
    }).catch((err) => console.error("[OrderSideEffectOrchestrator] Webhook trigger failed:", err));
  });

  invalidateOrderRelatedQueries(queryClient, "INSERT");
  // 后端 createOrder 已更新 member_activity；显式通知便于活动数据等订阅 member_activity / member-refresh 的视图立即失效缓存
  notifyDataMutation({ table: "member_activity", operation: "UPDATE", source: "mutation" }).catch(console.error);

  return { earnedPoints, pointsStatus };
}

export async function runCancelOrderSideEffects(input: LifecycleSideEffectsInput): Promise<void> {
  const {
    dbId,
    order,
    beforeState,
    afterState,
    queryClient,
    fetchOrders,
    isUsdt = false,
    includeCancelBalanceLog = true,
    emitCancelledWebhook = false,
  } = input;

  if (includeCancelBalanceLog) {
    logOrderCancelBalanceChange({
      vendorName: resolveVendorName(order.vendor),
      providerName: resolveProviderName(order.paymentProvider),
      cardWorth: order.cardWorth,
      paymentValue: order.paymentValue,
      currency: isUsdt ? "USDT" : order.demandCurrency,
      foreignRate: order.foreignRate,
      orderId: dbId,
      orderNumber: order.id,
      orderCreatedAt: order.createdAt,
    }).catch((logErr) => console.error("[OrderSideEffectOrchestrator] Balance cancel log failed:", logErr));
  }

  logOperation(
    "order_management",
    "cancel",
    dbId,
    beforeState,
    afterState,
    `${isUsdt ? "取消USDT订单" : "取消订单"}: ${order.id}`
  );

  if (emitCancelledWebhook) {
    import("@/services/webhookService").then(({ triggerOrderCancelled }) => {
      triggerOrderCancelled({
        id: dbId,
        orderNumber: order.id,
        phoneNumber: order.phoneNumber,
        memberCode: order.memberCode,
        currency: isUsdt ? "USDT" : order.demandCurrency,
        amount: order.cardWorth,
        cancelledAt: new Date().toISOString(),
      }).catch((err) => console.error("[OrderSideEffectOrchestrator] Cancel webhook failed:", err));
    });
  }

  fetchOrders();
  invalidateOrderRelatedQueries(queryClient, "UPDATE");
}

export async function runRestoreOrderSideEffects(input: LifecycleSideEffectsInput): Promise<void> {
  const {
    dbId,
    order,
    beforeState,
    afterState,
    queryClient,
    fetchOrders,
    isUsdt = false,
    includeRestoreBalanceLog = true,
    emitCompletedWebhook = true,
  } = input;

  if (includeRestoreBalanceLog) {
    logOrderRestoreBalanceChange({
      vendorName: resolveVendorName(order.vendor),
      providerName: resolveProviderName(order.paymentProvider),
      cardWorth: order.cardWorth,
      paymentValue: order.paymentValue,
      currency: isUsdt ? "USDT" : order.demandCurrency,
      foreignRate: order.foreignRate,
      orderId: dbId,
      orderNumber: order.id,
      orderCreatedAt: order.createdAt,
    }).catch((logErr) => console.error("[OrderSideEffectOrchestrator] Balance restore log failed:", logErr));
  }

  logOperation(
    "order_management",
    "restore",
    dbId,
    beforeState,
    afterState,
    `${isUsdt ? "恢复USDT订单" : "恢复订单"}: ${order.id}`
  );

  if (emitCompletedWebhook) {
    import("@/services/webhookService").then(({ triggerOrderCompleted }) => {
      triggerOrderCompleted({
        id: dbId,
        orderNumber: order.id,
        phoneNumber: order.phoneNumber,
        memberCode: order.memberCode,
        currency: isUsdt ? "USDT" : order.demandCurrency,
        amount: order.cardWorth,
        actualPaid: order.actualPaid,
        cardType: order.cardType,
        completedAt: new Date().toISOString(),
      }).catch((err) => console.error("[OrderSideEffectOrchestrator] Complete webhook failed:", err));
    });
  }

  fetchOrders();
  invalidateOrderRelatedQueries(queryClient, "UPDATE");
}

/**
 * Headless side-effect runner for batch-import context.
 * Mirrors runCreateOrderSideEffects but without React queryClient,
 * fetchOrders, or UI-specific invalidations. Returns structured warnings.
 */
export interface ImportOrderSideEffectsInput {
  orderId: string;
  orderNumber: string;
  phoneNumber: string;
  memberCode: string;
  currency: string;
  cardValue: number;
  cardWorth: number;
  paymentValue: number;
  actualPaid: number;
  foreignRate: number;
  vendorId: string;
  providerId: string;
  vendorName: string;
  providerName: string;
  cardType: string;
  creatorId?: string;
  creatorName?: string;
  createdAt: string;
  pointsStatus: string;
  skipPoints?: boolean;
}

export interface ImportOrderSideEffectsResult {
  pointsCreated: boolean;
  balanceLogged: boolean;
  webhookFired: boolean;
  warnings: string[];
}

export async function runImportOrderSideEffects(
  input: ImportOrderSideEffectsInput,
): Promise<ImportOrderSideEffectsResult> {
  const result: ImportOrderSideEffectsResult = {
    pointsCreated: false,
    balanceLogged: false,
    webhookFired: false,
    warnings: [],
  };

  // 1. Points (with idempotency: skip if already added)
  if (
    !input.skipPoints &&
    input.pointsStatus !== "added" &&
    input.memberCode &&
    input.phoneNumber &&
    input.actualPaid > 0
  ) {
    const pointsCurrency = normalizeCurrencyCode(input.currency);
    if (pointsCurrency) {
      try {
        const pointsResult = await createPointsOnOrderCreate({
          orderId: input.orderId,
          orderPhoneNumber: input.phoneNumber,
          memberCode: input.memberCode,
          actualPayment: input.actualPaid,
          currency: pointsCurrency,
          creatorId: input.creatorId,
        });
        if (pointsResult.success) {
          result.pointsCreated = true;
          await import("@/services/orders/ordersApiService").then((m) =>
            m.updateOrderPointsApi(input.orderId, { points_status: "added" }),
          );
        }
      } catch (err) {
        result.warnings.push(`积分发放失败 (points grant failed): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 2. Balance log (idempotent via source_id uniqueness / 409 handling in ledger service)
  if (input.vendorName || input.providerName) {
    try {
      await logOrderBalanceChange({
        vendorName: input.vendorName,
        providerName: input.providerName,
        cardWorth: input.cardWorth,
        paymentValue: input.paymentValue,
        actualPaid: input.actualPaid,
        currency: input.currency,
        foreignRate: input.foreignRate,
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        operatorId: input.creatorId,
        operatorName: input.creatorName,
      });
      result.balanceLogged = true;
    } catch (err) {
      result.warnings.push(`余额变动记录失败 (balance log failed): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Webhook (fire-and-forget; import also triggers order.created)
  try {
    const { triggerOrderCreated } = await import("@/services/webhookService");
    await triggerOrderCreated({
      id: input.orderId,
      orderNumber: input.orderNumber,
      phoneNumber: input.phoneNumber,
      memberCode: input.memberCode,
      currency: input.currency,
      amount: input.cardWorth,
      actualPaid: input.actualPaid,
      cardType: input.cardType,
      createdAt: input.createdAt,
    });
    result.webhookFired = true;
  } catch {
    // Webhook failure is non-critical for import
  }

  return result;
}

export async function runDeleteOrderSideEffects(input: LifecycleSideEffectsInput): Promise<void> {
  const {
    dbId,
    order,
    beforeState,
    afterState,
    queryClient,
    fetchOrders,
    isUsdt = false,
    includeCancelBalanceLog = false,
  } = input;

  if (includeCancelBalanceLog) {
    logOrderCancelBalanceChange({
      vendorName: resolveVendorName(order.vendor),
      providerName: resolveProviderName(order.paymentProvider),
      cardWorth: order.cardWorth,
      paymentValue: order.paymentValue,
      currency: isUsdt ? "USDT" : order.demandCurrency,
      foreignRate: order.foreignRate,
      orderId: dbId,
      orderNumber: order.id,
      orderCreatedAt: order.createdAt,
    }).catch((logErr) => console.error("[OrderSideEffectOrchestrator] Delete balance log failed:", logErr));
  }

  logOperation(
    "order_management",
    "delete",
    dbId,
    beforeState,
    afterState,
    `${isUsdt ? "删除USDT订单" : "删除订单"}: ${order.id} - ${order.cardType} ¥${order.cardValue}`
  );

  fetchOrders();
  invalidateOrderRelatedQueries(queryClient, "DELETE");
}

