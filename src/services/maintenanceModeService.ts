import { supabase } from "@/integrations/supabase/client";
import { fail, getErrorMessage, ok, type ServiceResult } from "@/services/serviceResult";

export type MaintenanceStatus = {
  globalEnabled: boolean;
  globalMessage: string | null;
  tenantEnabled: boolean;
  tenantMessage: string | null;
  effectiveEnabled: boolean;
  scope: "none" | "global" | "tenant";
};

export type TenantMaintenanceMode = {
  tenant_id: string;
  enabled: boolean;
  message: string | null;
  updated_at: string | null;
};

type RpcBoolResult = { success?: boolean; message?: string };

export async function getMaintenanceModeStatusResult(
  tenantId?: string | null
): Promise<ServiceResult<MaintenanceStatus>> {
  try {
    const { data, error } = await supabase.rpc("get_maintenance_mode_status" as never, {
      p_tenant_id: tenantId ?? null,
    } as never);
    if (error) {
      return fail("UNKNOWN", error.message || "get_maintenance_mode_status failed", "COMMON", error);
    }
    const row = Array.isArray(data) ? data[0] : data;
    return ok({
      globalEnabled: Boolean(row?.global_enabled),
      globalMessage: row?.global_message ?? null,
      tenantEnabled: Boolean(row?.tenant_enabled),
      tenantMessage: row?.tenant_message ?? null,
      effectiveEnabled: Boolean(row?.effective_enabled),
      scope: (row?.scope || "none") as "none" | "global" | "tenant",
    });
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}

export async function setGlobalMaintenanceModeResult(
  enabled: boolean,
  message?: string
): Promise<ServiceResult<true>> {
  try {
    const { data, error } = await supabase.rpc("set_global_maintenance_mode" as never, {
      p_enabled: enabled,
      p_message: message ?? null,
    } as never);
    if (error) {
      return fail("UNKNOWN", error.message || "set_global_maintenance_mode failed", "COMMON", error);
    }
    const row = (Array.isArray(data) ? data[0] : data) as RpcBoolResult | null;
    if (!row?.success) {
      const code = row?.message === "NO_PERMISSION" ? "NO_PERMISSION" : "UNKNOWN";
      return fail(code, row?.message || "UNKNOWN", code === "NO_PERMISSION" ? "AUTH" : "COMMON");
    }
    return ok(true);
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}

export async function setTenantMaintenanceModeResult(
  tenantId: string,
  enabled: boolean,
  message?: string
): Promise<ServiceResult<true>> {
  if (!tenantId) {
    return fail("TENANT_REQUIRED", "Tenant id is required", "TENANT");
  }
  try {
    const { data, error } = await supabase.rpc("set_tenant_maintenance_mode" as never, {
      p_tenant_id: tenantId,
      p_enabled: enabled,
      p_message: message ?? null,
    } as never);
    if (error) {
      return fail("UNKNOWN", error.message || "set_tenant_maintenance_mode failed", "COMMON", error);
    }
    const row = (Array.isArray(data) ? data[0] : data) as RpcBoolResult | null;
    if (!row?.success) {
      const code = row?.message === "NO_PERMISSION" ? "NO_PERMISSION" : "UNKNOWN";
      return fail(code, row?.message || "UNKNOWN", code === "NO_PERMISSION" ? "AUTH" : "COMMON");
    }
    return ok(true);
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}

export async function getTenantMaintenanceModesResult(): Promise<ServiceResult<TenantMaintenanceMode[]>> {
  try {
    const { data, error } = await supabase.rpc("get_tenant_maintenance_modes" as never);
    if (error) {
      return fail("UNKNOWN", error.message || "get_tenant_maintenance_modes failed", "COMMON", error);
    }
    return ok((Array.isArray(data) ? data : []) as TenantMaintenanceMode[]);
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}
