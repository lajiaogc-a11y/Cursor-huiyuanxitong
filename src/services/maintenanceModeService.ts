/**
 * Maintenance Mode Service — connected to real backend RPC.
 */
import { dataRpcApi } from "@/api/data";
import { fail, ok, type ServiceResult } from "@/services/serviceResult";

export type MaintenanceStatus = {
  globalEnabled: boolean;
  globalMessage: string | null;
  globalAllowedRoles?: string[];
  tenantEnabled: boolean;
  tenantMessage: string | null;
  effectiveEnabled: boolean;
  scope: "none" | "global" | "tenant" | "both";
};

export type TenantMaintenanceMode = {
  tenant_id: string;
  enabled: boolean;
  message: string | null;
  updated_at: string | null;
};

export async function getMaintenanceModeStatusResult(
  tenantId?: string | null
): Promise<ServiceResult<MaintenanceStatus>> {
  try {
    const data = await dataRpcApi.call<MaintenanceStatus>("get_maintenance_mode_status", {
      tenant_id: tenantId || undefined,
    });
    if (!data) {
      return ok({
        globalEnabled: false,
        globalMessage: null,
        tenantEnabled: false,
        tenantMessage: null,
        effectiveEnabled: false,
        scope: "none",
      });
    }
    return ok(data);
  } catch {
    return ok({
      globalEnabled: false,
      globalMessage: null,
      tenantEnabled: false,
      tenantMessage: null,
      effectiveEnabled: false,
      scope: "none",
    });
  }
}

export async function setGlobalMaintenanceModeResult(
  enabled: boolean,
  message?: string,
  allowedRoles?: string[]
): Promise<ServiceResult<true>> {
  try {
    await dataRpcApi.call("set_maintenance_mode", {
      scope: "global",
      enabled,
      message: message ?? "",
      allowed_roles: allowedRoles ?? [],
    });
    return ok(true);
  } catch (e) {
    return fail("SET_MAINTENANCE_FAILED", (e as Error).message, "COMMON");
  }
}

export async function setTenantMaintenanceModeResult(
  tenantId: string,
  enabled: boolean,
  message?: string,
  allowedRoles?: string[]
): Promise<ServiceResult<true>> {
  if (!tenantId) return fail("TENANT_REQUIRED", "Tenant id is required", "TENANT");
  try {
    await dataRpcApi.call("set_maintenance_mode", {
      scope: "tenant",
      tenant_id: tenantId,
      enabled,
      message: message ?? "",
      allowed_roles: allowedRoles ?? [],
    });
    return ok(true);
  } catch (e) {
    return fail("SET_MAINTENANCE_FAILED", (e as Error).message, "COMMON");
  }
}

export async function getTenantMaintenanceModesResult(): Promise<ServiceResult<TenantMaintenanceMode[]>> {
  try {
    const data = await dataRpcApi.call<TenantMaintenanceMode[]>("list_tenant_maintenance_modes", {});
    return ok(Array.isArray(data) ? data : []);
  } catch {
    return ok([]);
  }
}
