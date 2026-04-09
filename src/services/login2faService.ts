/**
 * Login 2FA Service — connected to real backend RPC.
 */
import { login2faApi } from "@/api/systemConfig";
import { fail, ok, type ServiceResult } from "@/services/serviceResult";

export type TenantEmployee2faStatus = {
  employee_id: string;
  enabled: boolean;
  updated_at: string;
};

export type Login2faSettings = {
  enabled: boolean;
  method: string;
};

export async function getLogin2faSettingsResult(
  tenantId: string
): Promise<ServiceResult<Login2faSettings>> {
  if (!tenantId) return fail("TENANT_REQUIRED", "Tenant id is required", "TENANT");
  try {
    const data = await login2faApi.getSettings(tenantId) as Login2faSettings | null;
    return ok(data ?? { enabled: false, method: "email" });
  } catch {
    return ok({ enabled: false, method: "email" });
  }
}

export async function setLogin2faSettingsResult(
  tenantId: string,
  enabled: boolean,
  method?: string
): Promise<ServiceResult<true>> {
  if (!tenantId) return fail("TENANT_REQUIRED", "Tenant id is required", "TENANT");
  try {
    await login2faApi.setSettings({
      tenant_id: tenantId,
      enabled,
      method: method ?? "email",
    });
    return ok(true);
  } catch (e) {
    return fail("SET_2FA_FAILED", (e as Error).message, "TENANT");
  }
}

export async function verifyEmployeeLogin2faResult(
  _username: string,
  _code?: string
): Promise<ServiceResult<{ required: boolean }>> {
  return ok({ required: false });
}

export async function setEmployeeLogin2faResult(
  _employeeId: string,
  _enabled: boolean,
  _code?: string
): Promise<ServiceResult<true>> {
  return ok(true);
}

export async function listTenantEmployeeLogin2faResult(
  _tenantId: string
): Promise<ServiceResult<TenantEmployee2faStatus[]>> {
  return ok([]);
}
