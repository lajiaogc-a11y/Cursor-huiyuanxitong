/**
 * 号码池 API - 提取、归还、消耗、统计
 * hooks 仅通过此层调用，禁止直接访问 Supabase
 */
import { apiClient } from '@/lib/apiClient';

export interface ExtractedPhone {
  id: number;
  normalized: string;
}

export interface PhoneStats {
  total_available: number;
  total_reserved: number;
  user_today_extracted: number;
  user_today_extract_actions: number;
}

function throwOnError(r: { success?: boolean; error?: { code?: string }; code?: string }): never {
  const code = r.error?.code ?? r.code;
  if (code === 'DAILY_LIMIT_EXCEEDED') throw new Error('DAILY_LIMIT_EXCEEDED');
  if (code === 'NOT_AUTHENTICATED') throw new Error('NOT_AUTHENTICATED');
  if (code === 'FORBIDDEN_TENANT_MISMATCH') throw new Error('FORBIDDEN_TENANT_MISMATCH');
  if (code === 'TENANT_REQUIRED') throw new Error('TENANT_REQUIRED');
  if (code === 'HAS_UNRETURNED_PHONES') throw new Error('HAS_UNRETURNED_PHONES');
  throw new Error(code || 'UNKNOWN');
}

export async function extractPhones(tenantId: string, count: number): Promise<ExtractedPhone[]> {
  const res = await apiClient.post<ExtractedPhone[] | { success?: boolean; error?: { code?: string }; code?: string }>(
    '/api/phone-pool/extract',
    { tenant_id: tenantId, count }
  );
  if (Array.isArray(res)) return res;
  throwOnError(res as { success?: boolean; error?: { code?: string }; code?: string });
}

export async function returnPhones(phoneIds: number[]): Promise<number[]> {
  if (!phoneIds?.length) return [];
  const res = await apiClient.post<number[]>(
    '/api/phone-pool/return',
    { phone_ids: phoneIds }
  );
  return Array.isArray(res) ? res : [];
}

export async function consumePhones(phoneIds: number[]): Promise<number[]> {
  if (!phoneIds?.length) return [];
  const res = await apiClient.post<number[]>(
    '/api/phone-pool/consume',
    { phone_ids: phoneIds }
  );
  return Array.isArray(res) ? res : [];
}

export async function getPhoneStats(tenantId: string): Promise<PhoneStats> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiClient.get<PhoneStats>(`/api/phone-pool/stats${q}`);
  if (res && typeof res === 'object' && typeof (res as PhoneStats).total_available === 'number') {
    return res as PhoneStats;
  }
  return {
    total_available: 0,
    total_reserved: 0,
    user_today_extracted: 0,
    user_today_extract_actions: 0,
  };
}

export async function getMyReservedPhones(tenantId: string, limit?: number): Promise<ExtractedPhone[]> {
  const params = new URLSearchParams();
  params.set('tenant_id', tenantId);
  if (limit != null) params.set('limit', String(limit));
  const res = await apiClient.get<ExtractedPhone[]>(
    `/api/phone-pool/my-reserved?${params.toString()}`
  );
  return Array.isArray(res) ? res : [];
}

export interface ExtractSettings {
  per_extract_limit: number;
  per_user_daily_limit: number;
}

export interface ExtractRecord {
  action_type: 'extract' | 'return';
  operator_name: string;
  action_count: number;
  action_at: string;
}

/** 批量导入（单次请求处理一个 chunk，前端需循环调用） */
export async function bulkImportChunk(
  tenantId: string,
  lines: string[]
): Promise<{ inserted: number; skipped: number }> {
  const res = await apiClient.post<{ success?: boolean; data?: { inserted?: number; skipped?: number } }>(
    '/api/phone-pool/bulk-import',
    { tenant_id: tenantId, lines }
  );
  const r = res as { success?: boolean; data?: { inserted?: number; skipped?: number } };
  if (r.success && r.data) {
    return { inserted: r.data.inserted ?? 0, skipped: r.data.skipped ?? 0 };
  }
  return { inserted: 0, skipped: lines.length };
}

export async function clearPhonePool(tenantId: string): Promise<void> {
  await apiClient.post('/api/phone-pool/clear', { tenant_id: tenantId });
}

export async function getExtractSettings(): Promise<ExtractSettings> {
  const res = await apiClient.get<ExtractSettings>('/api/phone-pool/settings');
  if (res && typeof res === 'object' && typeof (res as ExtractSettings).per_extract_limit === 'number') {
    return res as ExtractSettings;
  }
  return { per_extract_limit: 100, per_user_daily_limit: 5 };
}

export async function getExtractRecords(tenantId: string, limit?: number): Promise<ExtractRecord[]> {
  const params = new URLSearchParams();
  params.set('tenant_id', tenantId);
  if (limit != null) params.set('limit', String(limit));
  const res = await apiClient.get<ExtractRecord[]>(
    `/api/phone-pool/records?${params.toString()}`
  );
  return Array.isArray(res) ? res : [];
}

export async function updateExtractSettings(
  perExtractLimit?: number,
  perUserDailyLimit?: number
): Promise<void> {
  await apiClient.put('/api/phone-pool/settings', {
    per_extract_limit: perExtractLimit ?? null,
    per_user_daily_limit: perUserDailyLimit ?? null,
  });
}
