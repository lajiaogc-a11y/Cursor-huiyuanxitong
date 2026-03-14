import { supabase } from "@/integrations/supabase/client";
import { logOperation } from "@/stores/auditLogStore";
import { normalizeCurrencyCode } from "@/config/currencies";
import { notifyDataMutation } from "@/services/dataRefreshManager";
import { createPointsOnOrderCreate } from "@/services/pointsService";
import {
  logOrderBalanceChange,
  logOrderCancelBalanceChange,
  logOrderRestoreBalanceChange,
} from "@/services/balanceLogService";
import { getEmployeeNameById, resolveProviderName, resolveVendorName } from "@/services/nameResolver";

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
        await supabase.from("orders").update({ points_status: "added" }).eq("id", dbId);
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

