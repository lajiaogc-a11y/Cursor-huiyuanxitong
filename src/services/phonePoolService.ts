/**
 * Phone Extractor - pool import, extract, return, stats
 * 数据访问统一通过 @/api/phonePool，禁止直接访问 Supabase
 */
import { fail, getErrorMessage, ok, ServiceResult } from "@/services/serviceResult";
import * as phonePoolApi from "@/api/phonePool";

const CHUNK_SIZE = 5000;

export interface PhoneStats {
  total_available: number;
  total_reserved: number;
  /** 今日净提取号码数（提取 - 归还），归还后减少 */
  user_today_extracted: number;
  /** 今日已用提取次数（用于每日上限判断） */
  user_today_extract_actions: number;
}

export interface ExtractSettings {
  per_extract_limit: number;
  per_user_daily_limit: number;
}

export interface ImportResult {
  inserted_count: number;
  skipped_count: number;
}

export interface ExtractedPhone {
  id: string;
  normalized: string;
}

export type ImportProgressCallback = (progress: number, currentChunk: number, totalChunks: number) => void;

export async function phoneBulkImport(
  tenantId: string,
  lines: string[],
  onProgress?: ImportProgressCallback
): Promise<{ inserted: number; skipped: number }> {
  let totalInserted = 0;
  let totalSkipped = 0;
  const totalChunks = Math.ceil(lines.length / CHUNK_SIZE);

  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunk = lines.slice(i, i + CHUNK_SIZE);
    const result = await phonePoolApi.bulkImportChunk(tenantId, chunk);
    totalInserted += result.inserted;
    totalSkipped += result.skipped;
    const currentChunk = Math.floor(i / CHUNK_SIZE) + 1;
    const progress = totalChunks > 0 ? Math.round((currentChunk / totalChunks) * 100) : 100;
    onProgress?.(progress, currentChunk, totalChunks);
  }

  return { inserted: totalInserted, skipped: totalSkipped };
}

export async function extractPhones(tenantId: string, count: number): Promise<ExtractedPhone[]> {
  return phonePoolApi.extractPhones(tenantId, count);
}

// 读取当前登录用户已保留(未使用)的号码，支持刷新页面后继续归还
export async function getMyReservedPhones(tenantId: string): Promise<ExtractedPhone[]> {
  return phonePoolApi.getMyReservedPhones(tenantId, 500);
}

export async function returnPhones(tenantId: string, phoneIds: string[]): Promise<string[]> {
  return phonePoolApi.returnPhones(tenantId, phoneIds);
}

export async function consumePhones(tenantId: string, phoneIds: string[]): Promise<string[]> {
  return phonePoolApi.consumePhones(tenantId, phoneIds);
}

export async function getPhoneStats(tenantId: string): Promise<PhoneStats> {
  return phonePoolApi.getPhoneStats(tenantId || '');
}

export async function clearPhonePool(tenantId: string): Promise<void> {
  await phonePoolApi.clearPhonePool(tenantId);
}

export async function getExtractSettings(): Promise<ExtractSettings> {
  return phonePoolApi.getExtractSettings();
}

export interface ExtractRecord {
  action_type: "extract" | "return";
  operator_name: string;
  action_count: number;
  action_at: string;
}

export async function getExtractRecords(tenantId: string, limit?: number): Promise<ExtractRecord[]> {
  return phonePoolApi.getExtractRecords(tenantId, limit);
}

export async function updateExtractSettings(
  perExtractLimit?: number,
  perUserDailyLimit?: number
): Promise<void> {
  await phonePoolApi.updateExtractSettings(perExtractLimit, perUserDailyLimit);
}

function mapPhonePoolError(error: unknown) {
  const message = getErrorMessage(error);
  if (message.includes("HAS_UNRETURNED_PHONES") || message.includes("has_unreturned_phones")) {
    return fail("HAS_UNRETURNED_PHONES", "Has unreturned phones", "PHONE_POOL", error);
  }
  if (message.includes("DAILY_LIMIT_EXCEEDED") || message.includes("daily_limit_exceeded")) {
    return fail("DAILY_LIMIT_EXCEEDED", "Daily extract limit reached", "PHONE_POOL", error);
  }
  if (message.includes("NOT_AUTHENTICATED") || message.includes("not_authenticated")) {
    return fail("NOT_AUTHENTICATED", "Not authenticated", "PHONE_POOL", error);
  }
  if (message.includes("FORBIDDEN_TENANT_MISMATCH") || message.includes("forbidden_tenant_mismatch")) {
    return fail("FORBIDDEN_TENANT_MISMATCH", "Tenant mismatch", "PHONE_POOL", error);
  }
  if (message.includes("TENANT_REQUIRED") || message.includes("tenant_required") || message.includes("tenant_id_required")) {
    return fail("TENANT_REQUIRED", "Tenant is required", "PHONE_POOL", error);
  }
  if (message.includes("FORBIDDEN_ADMIN_ONLY") || message.includes("forbidden_admin_only")) {
    return fail("FORBIDDEN_ADMIN_ONLY", "Admin only", "PHONE_POOL", error);
  }
  return fail("UNKNOWN", message || "Phone pool operation failed", "PHONE_POOL", error, true);
}

export async function extractPhonesResult(
  tenantId: string,
  count: number
): Promise<ServiceResult<ExtractedPhone[]>> {
  try {
    const data = await extractPhones(tenantId, count);
    return ok(data);
  } catch (error) {
    return mapPhonePoolError(error);
  }
}

export async function returnPhonesResult(
  tenantId: string,
  phoneIds: string[]
): Promise<ServiceResult<string[]>> {
  try {
    const data = await returnPhones(tenantId, phoneIds);
    return ok(data);
  } catch (error) {
    return mapPhonePoolError(error);
  }
}

export async function consumePhonesResult(
  tenantId: string,
  phoneIds: string[]
): Promise<ServiceResult<string[]>> {
  try {
    const data = await consumePhones(tenantId, phoneIds);
    return ok(data);
  } catch (error) {
    return mapPhonePoolError(error);
  }
}

export async function getPhoneStatsResult(tenantId: string): Promise<ServiceResult<PhoneStats>> {
  try {
    const data = await getPhoneStats(tenantId);
    return ok(data);
  } catch (error) {
    return mapPhonePoolError(error);
  }
}

export async function getExtractSettingsResult(): Promise<ServiceResult<ExtractSettings>> {
  try {
    const data = await getExtractSettings();
    return ok(data);
  } catch (error) {
    return mapPhonePoolError(error);
  }
}

export async function phoneBulkImportResult(
  tenantId: string,
  lines: string[],
  onProgress?: ImportProgressCallback
): Promise<ServiceResult<{ inserted: number; skipped: number }>> {
  try {
    const data = await phoneBulkImport(tenantId, lines, onProgress);
    return ok(data);
  } catch (error) {
    return mapPhonePoolError(error);
  }
}

export async function clearPhonePoolResult(tenantId: string): Promise<ServiceResult<void>> {
  try {
    await clearPhonePool(tenantId);
    return ok(undefined);
  } catch (error) {
    return mapPhonePoolError(error);
  }
}

export async function updateExtractSettingsResult(
  perExtractLimit?: number,
  perUserDailyLimit?: number
): Promise<ServiceResult<void>> {
  try {
    await updateExtractSettings(perExtractLimit, perUserDailyLimit);
    return ok(undefined);
  } catch (error) {
    return mapPhonePoolError(error);
  }
}

export type PhoneExtractHealthItem = {
  key: string;
  ok: boolean;
  message: string;
};

/**
 * 提取设置自检：直连 API 看返回 success，便于发现未登录、租户、表结构等问题
 */
export async function checkPhoneExtractHealth(tenantId: string): Promise<PhoneExtractHealthItem[]> {
  const items: PhoneExtractHealthItem[] = [];
  const { getBearerTokenStaffThenMember } = await import("@/lib/apiClient");
  const token = getBearerTokenStaffThenMember();
  if (!token) {
    items.push({ key: "staff_token", ok: false, message: "NO_TOKEN" });
  } else {
    items.push({ key: "staff_token", ok: true, message: "OK" });
  }

  if (!tenantId?.trim()) {
    items.push({ key: "tenant", ok: false, message: "NO_TENANT" });
    return items;
  }
  items.push({ key: "tenant", ok: true, message: "OK" });

  const base = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  async function probe(path: string): Promise<{ ok: boolean; message: string }> {
    try {
      const r = await fetch(`${base}${path}`, { headers, cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        code?: string;
        error?: { message?: string; code?: string };
      };
      if (!r.ok) {
        return { ok: false, message: j.message || j.error?.message || `HTTP ${r.status}` };
      }
      if (j.success === false) {
        return {
          ok: false,
          message: j.message || j.error?.message || j.code || j.error?.code || "API_FAIL",
        };
      }
      return { ok: true, message: "OK" };
    } catch (e) {
      return { ok: false, message: getErrorMessage(e) };
    }
  }

  const st = await probe(`/api/phone-pool/stats?tenant_id=${encodeURIComponent(tenantId)}`);
  items.push({ key: "pool_stats", ok: st.ok, message: st.message });

  const se = await probe("/api/phone-pool/settings");
  items.push({ key: "extract_settings_api", ok: se.ok, message: se.message });

  const rec = await probe(
    `/api/phone-pool/records?tenant_id=${encodeURIComponent(tenantId)}&limit=1`
  );
  items.push({ key: "extract_records_api", ok: rec.ok, message: rec.message });

  try {
    const hr = await fetch(`${base}/api/phone-pool/health`, { headers, cache: 'no-store' });
    const hj = (await hr.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { tableExists?: boolean; phoneColumn?: string; missingColumns?: string[] };
    };
    if (!hr.ok || !hj.success) {
      items.push({ key: "phone_pool_table", ok: false, message: `HTTP ${hr.status}` });
    } else if (!hj.data?.tableExists) {
      items.push({ key: "phone_pool_table", ok: false, message: "TABLE_NOT_FOUND" });
    } else if (hj.data.missingColumns && hj.data.missingColumns.length > 0) {
      items.push({
        key: "phone_pool_table",
        ok: false,
        message: `MISSING_COLS: ${hj.data.missingColumns.join(", ")} (phone_col=${hj.data.phoneColumn})`,
      });
    } else {
      items.push({
        key: "phone_pool_table",
        ok: true,
        message: `OK (phone_col=${hj.data.phoneColumn})`,
      });
    }
  } catch (e) {
    items.push({ key: "phone_pool_table", ok: false, message: getErrorMessage(e) });
  }

  return items;
}
