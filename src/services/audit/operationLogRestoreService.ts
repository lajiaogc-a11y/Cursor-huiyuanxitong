/**
 * 操作日志「恢复」流程用到的 data 表与 restore 端点
 */
import { dataTableApi, dataOpsApi } from "@/api/data";

export type RestoreAuditBody = {
  logId: string;
  objectId: string | null;
  beforeData: unknown;
  objectDescription?: string | null;
  operatorId?: string | null;
  operatorName?: string | null;
};

export async function getMemberRow(id: string): Promise<unknown | null> {
  return dataTableApi
    .get<unknown>("members", `select=*&id=eq.${encodeURIComponent(id)}&single=true`)
    .catch((err) => {
      console.warn("[operationLogRestoreService] getMemberRow failed silently:", err);
      return null;
    });
}

export async function createMemberRow(body: Record<string, unknown>): Promise<void> {
  await dataTableApi.post("members", { data: body });
}

export async function patchMemberRow(id: string, body: Record<string, unknown>): Promise<void> {
  await dataTableApi.patch("members", `id=eq.${encodeURIComponent(id)}`, { data: body });
}

export async function getEmployeeRow(id: string): Promise<unknown | null> {
  return dataTableApi
    .get<unknown>("employees", `select=*&id=eq.${encodeURIComponent(id)}&single=true`)
    .catch((err) => {
      console.warn("[operationLogRestoreService] getEmployeeRow failed silently:", err);
      return null;
    });
}

export async function createEmployeeRow(body: Record<string, unknown>): Promise<void> {
  await dataTableApi.post("employees", { data: body });
}

export async function patchEmployeeRow(id: string, body: Record<string, unknown>): Promise<void> {
  await dataTableApi.patch("employees", `id=eq.${encodeURIComponent(id)}`, { data: body });
}

export async function restoreOrderFromAudit(body: RestoreAuditBody): Promise<void> {
  await dataOpsApi.restoreOrder(body);
}

export async function restoreActivityGiftFromAudit(body: RestoreAuditBody): Promise<void> {
  await dataOpsApi.restoreActivityGift(body);
}

export async function restoreCardFromAudit(body: RestoreAuditBody): Promise<void> {
  await dataOpsApi.restoreCard(body);
}

export async function restoreVendorFromAudit(body: RestoreAuditBody): Promise<void> {
  await dataOpsApi.restoreVendor(body);
}

export async function restorePaymentProviderFromAudit(body: RestoreAuditBody): Promise<void> {
  await dataOpsApi.restorePaymentProvider(body);
}

export async function restoreActivityTypeFromAudit(body: RestoreAuditBody): Promise<void> {
  await dataOpsApi.restoreActivityType(body);
}

export async function restoreCurrencyFromAudit(body: RestoreAuditBody): Promise<void> {
  await dataOpsApi.restoreCurrency(body);
}

export async function restoreCustomerSourceFromAudit(body: RestoreAuditBody): Promise<void> {
  await dataOpsApi.restoreCustomerSource(body);
}

export async function restoreReferralFromAudit(body: RestoreAuditBody): Promise<void> {
  await dataOpsApi.restoreReferral(body);
}
