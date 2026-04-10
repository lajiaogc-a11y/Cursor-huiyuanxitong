/**
 * 订单保存后的通用副作用：余额日志、会员活动同步、积分调整、缓存失效
 *
 * 从 OrderManagement.tsx 抽取，消除 admin/non-admin × normal/usdt 四处重复。
 */
import { normalizeCurrencyCode, type CurrencyCode } from "@/config/currencies";
import { logOrderUpdateBalanceChange, syncMemberActivityOnOrderEdit } from "@/services/finance/balanceLogService";
import { adjustPointsOnOrderEdit } from "@/services/points/pointsService";
import { logOperation } from "@/services/audit/auditLogService";
import { queryClient } from "@/lib/queryClient";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import { logger } from "@/lib/logger";

interface BalanceLogParams {
  vendorName: string;
  providerName: string;
  oldVendorName: string;
  oldProviderName: string;
  oldCardWorth: number;
  oldPaymentValue: number;
  oldCurrency: string;
  oldForeignRate: number;
  newCardWorth: number;
  newPaymentValue: number;
  newCurrency: string;
  newForeignRate: number;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  operatorId?: string;
  operatorName?: string;
}

interface ActivitySyncParams {
  phoneNumber: string;
  oldActualPaid: number;
  oldProfit: number;
  oldCurrency: string;
  newActualPaid: number;
  newProfit: number;
  newCurrency: string;
}

interface PointsSyncParams {
  orderId: string;
  memberCode: string;
  phoneNumber: string;
  oldActualPayment: number;
  oldCurrency: string;
  newActualPayment: number;
  newCurrency: string;
  creatorId?: string;
}

interface AuditParams {
  dbId: string;
  orderId: string;
  originalOrder: unknown;
  updatedSnapshot: unknown;
  t: (zh: string, en: string) => string;
}

function toPointsCurrency(code: string): CurrencyCode {
  return normalizeCurrencyCode(code) ?? "NGN";
}

export async function runBalanceLog(params: BalanceLogParams): Promise<void> {
  await logOrderUpdateBalanceChange(params);
}

export async function runActivitySync(params: ActivitySyncParams): Promise<void> {
  if (!params.phoneNumber) return;
  try {
    await syncMemberActivityOnOrderEdit({
      memberId: '',
      phoneNumber: params.phoneNumber,
      oldActualPaid: params.oldActualPaid,
      oldProfit: params.oldProfit,
      oldCurrency: params.oldCurrency,
      newActualPaid: params.newActualPaid,
      newProfit: params.newProfit,
      newCurrency: params.newCurrency,
    });
  } catch (err) {
    logger.error('[OrderEdit] Member activity sync failed:', err);
  }
}

export async function runPointsSync(params: PointsSyncParams): Promise<void> {
  if (!params.memberCode || !params.phoneNumber) return;
  try {
    await adjustPointsOnOrderEdit({
      orderId: params.orderId,
      memberCode: params.memberCode,
      phoneNumber: params.phoneNumber,
      oldActualPayment: params.oldActualPayment,
      oldCurrency: toPointsCurrency(params.oldCurrency),
      newActualPayment: params.newActualPayment,
      newCurrency: toPointsCurrency(params.newCurrency),
      creatorId: params.creatorId,
    });
  } catch (err) {
    logger.error('[OrderEdit] Points adjustment failed:', err);
  }
}

export function runAuditLog(params: AuditParams): void {
  logOperation(
    'order_management',
    'update',
    params.dbId,
    params.originalOrder,
    params.updatedSnapshot,
    params.t(`修改订单: ${params.orderId}`, `Edit order: ${params.orderId}`),
  );
}

export async function invalidateOrderCaches(): Promise<void> {
  queryClient.invalidateQueries({ queryKey: ["meika-fiat-orders"] });
  queryClient.invalidateQueries({ queryKey: ["meika-usdt-orders"] });
  queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
  queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
  queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
  notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(logger.error);
  notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(logger.error);
  notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(logger.error);
}
