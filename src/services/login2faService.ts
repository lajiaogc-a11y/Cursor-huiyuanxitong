import { supabase } from "@/integrations/supabase/client";
import { fail, getErrorMessage, ok, type ServiceResult } from "@/services/serviceResult";

export type TenantEmployee2faStatus = {
  employee_id: string;
  enabled: boolean;
  updated_at: string;
};

export async function verifyEmployeeLogin2faResult(
  username: string,
  code?: string
): Promise<ServiceResult<{ required: boolean }>> {
  try {
    const { data, error } = await supabase.rpc("verify_employee_login_2fa" as never, {
      p_username: username,
      p_code: code ?? null,
    } as never);
    if (error) {
      return fail("UNKNOWN", error.message || "verify_employee_login_2fa failed", "COMMON", error);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) {
      const msg = String(row?.message || "UNKNOWN");
      const mapped =
        msg === "TWO_FACTOR_REQUIRED" || msg === "WRONG_2FA_CODE" || msg === "TWO_FACTOR_NOT_CONFIGURED"
          ? msg
          : "UNKNOWN";
      return fail("UNKNOWN", mapped, "AUTH");
    }
    return ok({ required: Boolean(row?.required) });
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}

export async function setEmployeeLogin2faResult(
  employeeId: string,
  enabled: boolean,
  code?: string
): Promise<ServiceResult<true>> {
  try {
    const { data, error } = await supabase.rpc("set_employee_login_2fa" as never, {
      p_employee_id: employeeId,
      p_enabled: enabled,
      p_code: code ?? null,
    } as never);
    if (error) {
      return fail("UNKNOWN", error.message || "set_employee_login_2fa failed", "COMMON", error);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) {
      const msg = String(row?.message || "UNKNOWN");
      const codeMap =
        msg === "NO_PERMISSION"
          ? "NO_PERMISSION"
          : msg === "TARGET_NOT_FOUND"
            ? "TARGET_NOT_FOUND"
            : msg === "INVALID_2FA_CODE_FORMAT" || msg === "TWO_FACTOR_CODE_REQUIRED"
              ? "INVALID_PASSWORD"
              : "UNKNOWN";
      return fail(codeMap, msg, codeMap === "NO_PERMISSION" ? "AUTH" : "COMMON");
    }
    return ok(true);
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}

export async function listTenantEmployeeLogin2faResult(
  tenantId: string
): Promise<ServiceResult<TenantEmployee2faStatus[]>> {
  try {
    const { data, error } = await supabase.rpc("list_tenant_employee_login_2fa" as never, {
      p_tenant_id: tenantId,
    } as never);
    if (error) {
      return fail("UNKNOWN", error.message || "list_tenant_employee_login_2fa failed", "COMMON", error);
    }
    return ok((Array.isArray(data) ? data : []) as TenantEmployee2faStatus[]);
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}
