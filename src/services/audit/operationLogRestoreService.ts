/**
 * 操作日志「恢复」流程用到的 data 表与 restore 端点
 */
import {
  restoreOrder,
  restoreActivityGift,
  restoreCard,
  restoreVendor,
  restorePaymentProvider,
  restoreActivityType,
  restoreCurrency,
  restoreCustomerSource,
  restoreReferral,
  getMemberRowData,
  createMemberRowData,
  patchMemberRowData,
} from "@/api/restoreOps";
import { getEmployeeRowById, createEmployeeRowData, patchEmployeeRowData } from "@/api/employeeData";

export type RestoreAuditBody = {
  logId: string;
  objectId: string | null;
  beforeData: unknown;
  objectDescription?: string | null;
  operatorId?: string | null;
  operatorName?: string | null;
};

export async function getMemberRow(id: string): Promise<unknown | null> {
  return getMemberRowData(id).catch((err) => {
    console.warn("[operationLogRestoreService] getMemberRow failed silently:", err);
    return null;
  });
}

export async function createMemberRow(body: Record<string, unknown>): Promise<void> {
  await createMemberRowData(body);
}

export async function patchMemberRow(id: string, body: Record<string, unknown>): Promise<void> {
  await patchMemberRowData(id, body);
}

export async function getEmployeeRow(id: string): Promise<unknown | null> {
  return getEmployeeRowById(id).catch((err) => {
    console.warn("[operationLogRestoreService] getEmployeeRow failed silently:", err);
    return null;
  });
}

export async function createEmployeeRow(body: Record<string, unknown>): Promise<void> {
  await createEmployeeRowData(body);
}

export async function patchEmployeeRow(id: string, body: Record<string, unknown>): Promise<void> {
  await patchEmployeeRowData(id, body);
}

export async function restoreOrderFromAudit(body: RestoreAuditBody): Promise<void> {
  await restoreOrder(body);
}

export async function restoreActivityGiftFromAudit(body: RestoreAuditBody): Promise<void> {
  await restoreActivityGift(body);
}

export async function restoreCardFromAudit(body: RestoreAuditBody): Promise<void> {
  await restoreCard(body);
}

export async function restoreVendorFromAudit(body: RestoreAuditBody): Promise<void> {
  await restoreVendor(body);
}

export async function restorePaymentProviderFromAudit(body: RestoreAuditBody): Promise<void> {
  await restorePaymentProvider(body);
}

export async function restoreActivityTypeFromAudit(body: RestoreAuditBody): Promise<void> {
  await restoreActivityType(body);
}

export async function restoreCurrencyFromAudit(body: RestoreAuditBody): Promise<void> {
  await restoreCurrency(body);
}

export async function restoreCustomerSourceFromAudit(body: RestoreAuditBody): Promise<void> {
  await restoreCustomerSource(body);
}

export async function restoreReferralFromAudit(body: RestoreAuditBody): Promise<void> {
  await restoreReferral(body);
}
