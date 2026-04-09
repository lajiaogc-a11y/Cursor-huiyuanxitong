import { apiClient } from "@/lib/apiClient";

export async function getSharedDataApi<T>(dataKey: string, tenantId?: string | null): Promise<T | null> {
  try {
    const q = new URLSearchParams();
    q.set("data_key", dataKey);
    if (tenantId) q.set("tenant_id", tenantId);
    const res = await apiClient.get<unknown>(`/api/data/shared-data?${q.toString()}`);
    if (res === null || res === undefined) return null;
    if (typeof res === "object" && res !== null && "data" in res) {
      return ((res as { data?: T | null }).data ?? null) as T | null;
    }
    return res as T | null;
  } catch {
    return null;
  }
}

export async function postSharedDataApi(
  dataKey: string,
  dataValue: unknown,
  tenantId?: string | null,
): Promise<boolean> {
  try {
    const body = { data_key: dataKey, data_value: dataValue };
    if (tenantId) (body as Record<string, unknown>).tenant_id = tenantId;
    const res = await apiClient.post<unknown>("/api/data/shared-data", body);
    if (res && typeof res === "object" && (res as { success?: boolean }).success === true) return true;
    return false;
  } catch {
    return false;
  }
}

export async function getSharedDataBatchApi(keys: string[], tenantId?: string | null): Promise<Record<string, unknown>> {
  if (keys.length === 0) return {};
  try {
    const q = new URLSearchParams();
    q.set("keys", keys.join(","));
    if (tenantId) q.set("tenant_id", tenantId);
    const res = await apiClient.get<unknown>(`/api/data/shared-data/batch?${q.toString()}`);
    const data =
      res && typeof res === "object" && res !== null && "data" in res
        ? (res as { data?: Record<string, unknown> }).data
        : res;
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
