import { supabase } from "@/integrations/supabase/client";
import { logOperation } from "@/stores/auditLogStore";
import { normalizeCurrencyCode } from "@/config/currencies";
import { notifyDataMutation } from "@/services/dataRefreshManager";
import { createPointsOnOrderCreate } from "@/services/pointsService";
import { logOrderBalanceChange } from "@/services/balanceLogService";
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

  queryClient.invalidateQueries({ queryKey: ["orders"] });
  queryClient.invalidateQueries({ queryKey: ["usdt-orders"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard-trend"] });
  queryClient.invalidateQueries({ queryKey: ["profit-compare-current"] });
  queryClient.invalidateQueries({ queryKey: ["profit-compare-previous"] });
  notifyDataMutation({ table: "orders", operation: "INSERT", source: "mutation" }).catch(console.error);

  return { earnedPoints, pointsStatus };
}

