import { supabase } from "@/integrations/supabase/client";
import { fail, getErrorMessage, ok, type ServiceResult } from "@/services/serviceResult";

export const FEATURE_FLAGS = {
  PHONE_EXTRACT: "phone_extract",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

type FeatureFlagRow = {
  flag_key: string;
  enabled: boolean;
  updated_at?: string | null;
};

export async function getTenantFeatureFlagResult(
  tenantId: string,
  flagKey: FeatureFlagKey,
  defaultEnabled = true
): Promise<ServiceResult<boolean>> {
  if (!tenantId) {
    return fail("TENANT_REQUIRED", "Tenant id is required", "TENANT");
  }
  try {
    const { data, error } = await supabase.rpc("get_tenant_feature_flag" as never, {
      p_tenant_id: tenantId,
      p_flag_key: flagKey,
      p_default: defaultEnabled,
    } as never);
    if (error) {
      return fail("UNKNOWN", error.message || "get_tenant_feature_flag failed", "COMMON", error);
    }
    const first = Array.isArray(data) ? data[0] : null;
    return ok(Boolean(first?.enabled ?? defaultEnabled));
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}

export async function getTenantFeatureFlagsResult(
  tenantId: string
): Promise<ServiceResult<FeatureFlagRow[]>> {
  if (!tenantId) {
    return fail("TENANT_REQUIRED", "Tenant id is required", "TENANT");
  }
  try {
    const { data, error } = await supabase.rpc("get_tenant_feature_flags" as never, {
      p_tenant_id: tenantId,
    } as never);
    if (error) {
      return fail("UNKNOWN", error.message || "get_tenant_feature_flags failed", "COMMON", error);
    }
    return ok((Array.isArray(data) ? data : []) as FeatureFlagRow[]);
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}

export async function setTenantFeatureFlagResult(
  tenantId: string,
  flagKey: FeatureFlagKey,
  enabled: boolean
): Promise<ServiceResult<true>> {
  if (!tenantId) {
    return fail("TENANT_REQUIRED", "Tenant id is required", "TENANT");
  }
  try {
    const { data, error } = await supabase.rpc("set_tenant_feature_flag" as never, {
      p_tenant_id: tenantId,
      p_flag_key: flagKey,
      p_enabled: enabled,
    } as never);
    if (error) {
      return fail("UNKNOWN", error.message || "set_tenant_feature_flag failed", "COMMON", error);
    }
    const first = Array.isArray(data) ? data[0] : null;
    if (!first?.success) {
      const message = String(first?.message || "UNKNOWN");
      const code = (["NO_PERMISSION", "INVALID_FLAG_KEY"] as const).includes(message as "NO_PERMISSION" | "INVALID_FLAG_KEY")
        ? (message as "NO_PERMISSION" | "INVALID_FLAG_KEY")
        : "UNKNOWN";
      return fail(code, message, code === "NO_PERMISSION" ? "AUTH" : "COMMON");
    }
    return ok(true);
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}
