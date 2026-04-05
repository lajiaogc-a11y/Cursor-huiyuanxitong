/**
 * Feature Flag Service — connected to real backend RPC.
 */
import { apiPost } from "@/api/client";
import { fail, ok, type ServiceResult } from "@/services/serviceResult";

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
  if (!tenantId) return fail("TENANT_REQUIRED", "Tenant id is required", "TENANT");
  try {
    const data = await apiPost<{ enabled: boolean }>("/api/data/rpc/get_tenant_feature_flag", {
      tenant_id: tenantId,
      flag_key: flagKey,
    });
    return ok(data?.enabled ?? defaultEnabled);
  } catch (e) {
    // M2 fix: fail-closed — API errors should not enable features
    return fail("FLAG_FETCH_FAILED", (e as Error).message || "Failed to fetch feature flag");
  }
}

export async function getTenantFeatureFlagsResult(
  tenantId: string
): Promise<ServiceResult<FeatureFlagRow[]>> {
  if (!tenantId) return fail("TENANT_REQUIRED", "Tenant id is required", "TENANT");
  try {
    const data = await apiPost<FeatureFlagRow[]>("/api/data/rpc/list_tenant_feature_flags", {
      tenant_id: tenantId,
    });
    return ok(Array.isArray(data) ? data : []);
  } catch {
    return ok([]);
  }
}

export async function setTenantFeatureFlagResult(
  tenantId: string,
  flagKey: FeatureFlagKey,
  enabled: boolean
): Promise<ServiceResult<true>> {
  if (!tenantId) return fail("TENANT_REQUIRED", "Tenant id is required", "TENANT");
  try {
    await apiPost("/api/data/rpc/set_tenant_feature_flag", {
      tenant_id: tenantId,
      flag_key: flagKey,
      enabled,
    });
    return ok(true);
  } catch (e) {
    return fail("SET_FLAG_FAILED", (e as Error).message);
  }
}
