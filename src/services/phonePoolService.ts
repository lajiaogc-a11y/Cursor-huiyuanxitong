/**
 * Phone Extractor - pool import, extract, return, stats
 */
import { supabase } from "@/integrations/supabase/client";

const CHUNK_SIZE = 5000;

export interface PhoneStats {
  total_available: number;
  total_reserved: number;
  user_today_extracted: number;
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
  id: number;
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
    const { data, error } = await supabase.rpc("phone_bulk_import", {
      p_tenant_id: tenantId,
      lines: chunk,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      totalInserted += row.inserted_count ?? 0;
      totalSkipped += row.skipped_count ?? 0;
    }
    const currentChunk = Math.floor(i / CHUNK_SIZE) + 1;
    const progress = totalChunks > 0 ? Math.round((currentChunk / totalChunks) * 100) : 100;
    onProgress?.(progress, currentChunk, totalChunks);
  }

  return { inserted: totalInserted, skipped: totalSkipped };
}

export async function extractPhones(tenantId: string, count: number): Promise<ExtractedPhone[]> {
  const { data, error } = await supabase.rpc("rpc_extract_phones", {
    p_tenant_id: tenantId,
    p_limit_count: count,
  });
  if (error) {
    if (error.message?.includes("daily_limit_exceeded")) {
      throw new Error("DAILY_LIMIT_EXCEEDED");
    }
    if (error.message?.includes("not_authenticated")) {
      throw new Error("NOT_AUTHENTICATED");
    }
    throw error;
  }
  return (data || []).map((r: { id: number; normalized: string }) => ({
    id: r.id,
    normalized: r.normalized,
  }));
}

export async function returnPhones(phoneIds: number[]): Promise<number[]> {
  if (phoneIds.length === 0) return [];
  const { data, error } = await supabase.rpc("rpc_return_phones", {
    phone_ids: phoneIds,
  });
  if (error) throw error;
  return (data || []).map((r: { returned_id: number }) => r.returned_id);
}

export async function getPhoneStats(tenantId: string): Promise<PhoneStats> {
  const { data, error } = await supabase.rpc("rpc_phone_stats", {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    total_available: row?.total_available ?? 0,
    total_reserved: row?.total_reserved ?? 0,
    user_today_extracted: row?.user_today_extracted ?? 0,
  };
}

export async function clearPhonePool(tenantId: string): Promise<void> {
  const { error } = await supabase.rpc("rpc_clear_phone_pool", {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
}

export async function getExtractSettings(): Promise<ExtractSettings> {
  const { data, error } = await supabase.rpc("rpc_phone_extract_settings");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    per_extract_limit: row?.per_extract_limit ?? 100,
    per_user_daily_limit: row?.per_user_daily_limit ?? 5,
  };
}

export interface ExtractRecord {
  action_type: "extract" | "return";
  operator_name: string;
  action_count: number;
  action_at: string;
}

export async function getExtractRecords(tenantId: string, limit?: number): Promise<ExtractRecord[]> {
  const { data, error } = await supabase.rpc("rpc_phone_extract_records", {
    p_tenant_id: tenantId,
    p_limit: limit ?? 100,
  });
  if (error) throw error;
  return (data || []).map((r: { action_type: string; operator_name: string; action_count: number; action_at: string }) => ({
    action_type: r.action_type as "extract" | "return",
    operator_name: r.operator_name ?? "-",
    action_count: r.action_count ?? 0,
    action_at: r.action_at,
  }));
}

export async function updateExtractSettings(
  perExtractLimit?: number,
  perUserDailyLimit?: number
): Promise<void> {
  const { error } = await supabase.rpc("rpc_update_phone_extract_settings", {
    p_per_extract_limit: perExtractLimit ?? null,
    p_per_user_daily_limit: perUserDailyLimit ?? null,
  });
  if (error) {
    if (error.message?.includes("forbidden_admin_only")) {
      throw new Error("FORBIDDEN_ADMIN_ONLY");
    }
    throw error;
  }
}
