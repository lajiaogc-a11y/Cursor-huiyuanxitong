/**
 * 操作日志「恢复」流程用到的 data 表与 restore 端点
 */
import { apiGet, apiPatch, apiPost } from "@/api/client";

export type RestoreAuditBody = {
  logId: string;
  objectId: string | null;
  beforeData: unknown;
  objectDescription: string | null;
  operatorId?: string;
  operatorName?: string | null;
};

export async function getMemberRow(id: string): Promise<unknown | null> {
  return apiGet<unknown>(
    `/api/data/table/members?select=*&id=eq.${encodeURIComponent(id)}&single=true`,
  ).catch((err) => { console.warn('[operationLogRestoreService] getMemberRow failed silently:', err); return null; });
}

export async function createMemberRow(body: Record<string, unknown>): Promise<void> {
  await apiPost("/api/data/table/members", { data: body });
}

export async function patchMemberRow(id: string, body: Record<string, unknown>): Promise<void> {
  await apiPatch(`/api/data/table/members?id=eq.${encodeURIComponent(id)}`, { data: body });
}

export async function getEmployeeRow(id: string): Promise<unknown | null> {
  return apiGet<unknown>(
    `/api/data/table/employees?select=*&id=eq.${encodeURIComponent(id)}&single=true`,
  ).catch((err) => { console.warn('[operationLogRestoreService] getEmployeeRow failed silently:', err); return null; });
}

export async function createEmployeeRow(body: Record<string, unknown>): Promise<void> {
  await apiPost("/api/data/table/employees", { data: body });
}

export async function patchEmployeeRow(id: string, body: Record<string, unknown>): Promise<void> {
  await apiPatch(`/api/data/table/employees?id=eq.${encodeURIComponent(id)}`, { data: body });
}

export async function restoreOrderFromAudit(body: RestoreAuditBody): Promise<void> {
  await apiPost("/api/data/restore/order", body);
}

export async function restoreActivityGiftFromAudit(body: RestoreAuditBody): Promise<void> {
  await apiPost("/api/data/restore/activity-gift", body);
}

export async function restoreCardFromAudit(body: RestoreAuditBody): Promise<void> {
  await apiPost("/api/data/restore/card", body);
}

export async function restoreVendorFromAudit(body: RestoreAuditBody): Promise<void> {
  await apiPost("/api/data/restore/vendor", body);
}

export async function restorePaymentProviderFromAudit(body: RestoreAuditBody): Promise<void> {
  await apiPost("/api/data/restore/payment-provider", body);
}

export async function restoreActivityTypeFromAudit(body: RestoreAuditBody): Promise<void> {
  await apiPost("/api/data/restore/activity-type", body);
}

export async function restoreCurrencyFromAudit(body: RestoreAuditBody): Promise<void> {
  await apiPost("/api/data/restore/currency", body);
}

export async function restoreCustomerSourceFromAudit(body: RestoreAuditBody): Promise<void> {
  await apiPost("/api/data/restore/customer-source", body);
}

export async function restoreReferralFromAudit(body: RestoreAuditBody): Promise<void> {
  await apiPost("/api/data/restore/referral", body);
}
