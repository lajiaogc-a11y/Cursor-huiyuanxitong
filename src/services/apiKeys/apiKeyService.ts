/**
 * 员工端 API Key 表代理与本地生成/哈希（明文 key 仅创建时返回一次）
 */
import { listApiKeysData, listApiRequestLogsData, createApiKeyData, patchApiKeyData, deleteApiKeyData } from "@/api/apiKeyData";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: "active" | "disabled" | "expired";
  permissions: string[];
  ipWhitelist: string[] | null;
  rateLimit: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  totalRequests: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  remark: string | null;
}

export interface ApiRequestLog {
  id: string;
  apiKeyId: string | null;
  keyPrefix: string | null;
  endpoint: string;
  method: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestParams: Record<string, unknown> | null;
  responseStatus: number;
  responseTimeMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export function generateApiKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let key = "fast_";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** MySQL JSON / 字符串化的权限与白名单 */
function parseStringArrayField(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v) as unknown;
      if (Array.isArray(p)) return p.map(String);
    } catch {
      /* ignore */
    }
    return [];
  }
  return [];
}

function parseNullableStringArray(v: unknown): string[] | null {
  if (v == null) return null;
  return parseStringArrayField(v);
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const data = await listApiKeysData();
  return (data || []).map((k) => {
    const row = k as Record<string, unknown>;
    return {
      id: row.id as string,
      name: row.name as string,
      keyPrefix: row.key_prefix as string,
      status: row.status as "active" | "disabled" | "expired",
      permissions: parseStringArrayField(row.permissions),
      ipWhitelist: parseNullableStringArray(row.ip_whitelist),
      rateLimit: row.rate_limit as number,
      expiresAt: row.expires_at as string | null,
      lastUsedAt: row.last_used_at as string | null,
      totalRequests: Number(row.total_requests),
      createdBy: row.created_by as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      remark: row.remark as string | null,
    };
  });
}

export async function listApiRequestLogs(keyId?: string, limit = 100): Promise<ApiRequestLog[]> {
  let q = `select=*&order=created_at.desc&limit=${limit}`;
  if (keyId) {
    q += `&api_key_id=eq.${encodeURIComponent(keyId)}`;
  }
  const data = await listApiRequestLogsData(q);
  return (data || []).map((l) => {
    const row = l as Record<string, unknown>;
    return {
      id: row.id,
      apiKeyId: row.api_key_id,
      keyPrefix: row.key_prefix,
      endpoint: row.endpoint,
      method: row.method,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      requestParams: row.request_params as Record<string, unknown> | null,
      responseStatus: row.response_status,
      responseTimeMs: row.response_time_ms,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    } as ApiRequestLog;
  });
}

export async function createApiKeyRecord(body: Record<string, unknown>): Promise<void> {
  await createApiKeyData(body);
}

export async function patchApiKeyRecord(keyId: string, body: Record<string, unknown>): Promise<void> {
  const data = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(data).length === 0) return;
  await patchApiKeyData(keyId, data);
}

export async function deleteApiKeyRecord(keyId: string): Promise<void> {
  await deleteApiKeyData(keyId);
}
