import { apiClient } from "@/lib/apiClient";

/** 避免数字/科学计数法在界面上显示成大量字母 e（如 1e+21） */
function scalarToDisplayString(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (Number.isInteger(raw)) return String(raw);
    const t = String(raw);
    if (!/[eE]/.test(t)) return t;
    const fixed = raw.toFixed(12).replace(/\.?0+$/, "");
    return fixed === "-0" ? "0" : fixed;
  }
  const s = String(raw).trim();
  if (!s || s === "null" || s === "undefined") return "";
  if (/^\d+\.?\d*[eE][+-]?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const fixed = n.toFixed(12).replace(/\.?0+$/, "");
      return fixed === "-0" ? "0" : fixed;
    }
  }
  return s;
}

/** 排除误导入/单列字母 code（如 e）等不应作为「活动类型名称」展示的垃圾值 */
function isJunkActivityTypeLabel(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^[eE]$/.test(t)) return true;
  if (/^\d+\.?\d*[eE][+-]?\d+$/.test(t)) return true;
  return false;
}

function pickActivityTypeLabel(row: Record<string, unknown>): string {
  // 先用人-readable 字段；value（如 activity_1）优先于 code，避免旧表里 code 被填成单列字母时盖住正常 value
  const keys = ["label", "name", "value", "code"] as const;
  for (const key of keys) {
    const s = scalarToDisplayString(row[key]);
    if (s && !isJunkActivityTypeLabel(s)) return s;
  }
  return "";
}

function parseActivityTypeActive(raw: unknown): boolean {
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  if (typeof raw === "string") {
    const low = raw.trim().toLowerCase();
    if (low === "1" || low === "true" || low === "yes") return true;
    if (low === "0" || low === "false" || low === "no") return false;
  }
  return true;
}

export async function getCurrenciesApi(): Promise<
  Array<{
    id: string;
    code: string;
    name_zh: string;
    name_en?: string | null;
    symbol?: string | null;
    badge_color?: string | null;
    sort_order: number;
    is_active: boolean;
  }>
> {
  const res = await apiClient.get<unknown>("/api/data/currencies");
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? (raw as any[]) : ((raw.data as any[]) ?? []);
}

export async function getActivityTypesApi(): Promise<
  Array<{
    id: string;
    value: string;
    label: string;
    is_active: boolean;
    sort_order: number;
  }>
> {
  const res = await apiClient.get<unknown>("/api/data/activity-types");
  const raw = res as Record<string, unknown>;
  const arr = Array.isArray(raw) ? (raw as unknown[]) : ((raw.data as unknown[]) ?? []);
  return (arr || []).map((item) => {
    const row = item as Record<string, unknown>;
    const value =
      scalarToDisplayString(row.value ?? row.code) ||
      scalarToDisplayString(row.id) ||
      "";
    let label = pickActivityTypeLabel(row);
    if (!label) label = value;
    return {
      id: String(row.id ?? ""),
      value,
      label,
      is_active: parseActivityTypeActive(row.is_active),
      sort_order: Number(row.sort_order ?? 0),
    };
  });
}

export async function getCustomerSourcesApi(): Promise<
  Array<{
    id: string;
    name: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>
> {
  const res = await apiClient.get<unknown>("/api/data/customer-sources");
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? (raw as any[]) : ((raw.data as any[]) ?? []);
}

export async function getShiftReceiversApi(): Promise<
  Array<{
    id: string;
    name: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }>
> {
  const res = await apiClient.get<unknown>("/api/data/shift-receivers");
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? (raw as any[]) : ((raw.data as any[]) ?? []);
}

export async function getShiftHandoversApi(tenantId?: string | null): Promise<
  Array<{
    id: string;
    handover_employee_id: string | null;
    handover_employee_name: string;
    receiver_name: string;
    handover_time: string;
    card_merchant_data: unknown;
    payment_provider_data: unknown;
    remark: string | null;
    created_at: string;
  }>
> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  const res = await apiClient.get<unknown>(`/api/data/shift-handovers${q}`);
  const raw = res as Record<string, unknown>;
  return Array.isArray(raw) ? (raw as any[]) : ((raw.data as any[]) ?? []);
}
