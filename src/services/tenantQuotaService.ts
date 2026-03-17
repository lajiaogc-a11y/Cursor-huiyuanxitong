import { supabase } from "@/integrations/supabase/client";
import { fail, ok, type ServiceResult, type ServiceErrorCode } from "@/services/serviceResult";

export type TenantQuotaResource = "employees" | "members" | "daily_orders";

export interface TenantQuotaStatus {
  tenant_id: string;
  max_employees: number | null;
  max_members: number | null;
  max_daily_orders: number | null;
  exceed_strategy?: "BLOCK" | "WARN" | string | null;
  employees_count: number;
  members_count: number;
  daily_orders_count: number;
  employees_reached: boolean;
  members_reached: boolean;
  daily_orders_reached: boolean;
}

export interface TenantQuotaRow {
  tenant_id: string;
  max_employees: number | null;
  max_members: number | null;
  max_daily_orders: number | null;
  exceed_strategy?: "BLOCK" | "WARN" | string | null;
  updated_at: string;
}

export function getQuotaExceededText(message?: string): { zh: string; en: string } | null {
  if (!message?.startsWith("QUOTA_EXCEEDED:")) return null;
  const resource = message.split(":")[1] as TenantQuotaResource | undefined;
  if (resource === "employees") {
    return {
      zh: "员工数量已达到租户上限，请联系平台管理员调整配额",
      en: "Employee quota exceeded for this tenant",
    };
  }
  if (resource === "members") {
    return {
      zh: "会员数量已达到租户上限，请联系平台管理员调整配额",
      en: "Member quota exceeded for this tenant",
    };
  }
  return {
    zh: "今日订单数量已达到租户上限，请明日再试或联系平台管理员调整配额",
    en: "Daily order quota exceeded for this tenant",
  };
}

export function getQuotaSoftExceededText(message?: string): { zh: string; en: string } | null {
  if (!message?.startsWith("QUOTA_SOFT_EXCEEDED:")) return null;
  const resource = message.split(":")[1] as TenantQuotaResource | undefined;
  if (resource === "employees") {
    return {
      zh: "员工数量已超过租户配额上限（当前策略：仅告警）",
      en: "Employee quota exceeded (warn-only strategy)",
    };
  }
  if (resource === "members") {
    return {
      zh: "会员数量已超过租户配额上限（当前策略：仅告警）",
      en: "Member quota exceeded (warn-only strategy)",
    };
  }
  return {
    zh: "今日订单数量已超过租户配额上限（当前策略：仅告警）",
    en: "Daily order quota exceeded (warn-only strategy)",
  };
}

const toQuotaCode = (message?: string): ServiceErrorCode => {
  if (!message) return "UNKNOWN";
  if (message === "NO_PERMISSION") return "NO_PERMISSION";
  if (message === "TENANT_REQUIRED") return "TENANT_REQUIRED";
  if (message.startsWith("QUOTA_EXCEEDED")) return "QUOTA_EXCEEDED";
  return "UNKNOWN";
};

export async function checkMyTenantQuotaResult(
  resource: TenantQuotaResource,
  increment = 1
): Promise<ServiceResult<{ remaining: number; message?: string }>> {
  const { data, error } = await (supabase.rpc as any)("check_my_tenant_quota", {
    p_resource: resource,
    p_increment: increment,
  });
  if (error) return fail("UNKNOWN", error.message, "tenant");

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.success) {
    return fail(toQuotaCode(row?.message), row?.message || "Quota check failed", "tenant");
  }
  return ok({ remaining: Number(row?.remaining ?? 0), message: String(row?.message || "OK") });
}

export async function getTenantQuotaStatusResult(tenantId: string): Promise<ServiceResult<TenantQuotaStatus>> {
  const { data, error } = await (supabase.rpc as any)("get_tenant_quota_status", {
    p_tenant_id: tenantId,
  });
  if (error) return fail("UNKNOWN", error.message, "tenant");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.tenant_id) return fail("TARGET_NOT_FOUND", "Tenant quota status not found", "tenant");
  return ok(row as TenantQuotaStatus);
}

export async function listTenantQuotasResult(): Promise<ServiceResult<TenantQuotaRow[]>> {
  const { data, error } = await (supabase.rpc as any)("list_tenant_quotas");
  if (error) return fail("UNKNOWN", error.message, "tenant");
  return ok((data || []) as TenantQuotaRow[]);
}

export async function setTenantQuotaResult(input: {
  tenantId: string;
  maxEmployees: number | null;
  maxMembers: number | null;
  maxDailyOrders: number | null;
  exceedStrategy?: "BLOCK" | "WARN";
}): Promise<ServiceResult<true>> {
  const { data, error } = await (supabase.rpc as any)("set_tenant_quota", {
    p_tenant_id: input.tenantId,
    p_max_employees: input.maxEmployees,
    p_max_members: input.maxMembers,
    p_max_daily_orders: input.maxDailyOrders,
    p_exceed_strategy: input.exceedStrategy || "BLOCK",
  });
  if (error) return fail("UNKNOWN", error.message, "tenant");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.success) {
    return fail(toQuotaCode(row?.message), row?.message || "Set tenant quota failed", "tenant");
  }
  return ok(true);
}
