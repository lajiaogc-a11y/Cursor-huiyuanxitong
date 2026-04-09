/**
 * Maintenance Mode Service — connected to real backend RPC.
 */
import { maintenanceApi } from "@/api/systemConfig";
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
    const data = await maintenanceApi.getStatus(tenantId) as MaintenanceStatus | null;
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
    await maintenanceApi.setMode({
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
    await maintenanceApi.setMode({
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
    const data = await maintenanceApi.listTenantModes() as TenantMaintenanceMode[];
    return ok(Array.isArray(data) ? data : []);
  } catch {
    return ok([]);
  }
}
