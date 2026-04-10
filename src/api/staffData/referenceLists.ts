import { apiClient } from "@/lib/apiClient";
import {
  scalarToDisplayString,
  pickActivityTypeLabel,
  parseActivityTypeActive,
} from "@/lib/referenceListNormalizer";

function extractArrayPayload(res: unknown): unknown[] {
  const raw = res as Record<string, unknown>;
  if (Array.isArray(raw)) return raw;
  const data = raw.data;
  return Array.isArray(data) ? data : [];
}

export type CurrencyListItem = {
  id: string;
  code: string;
  name_zh: string;
  name_en?: string | null;
  symbol?: string | null;
  badge_color?: string | null;
  sort_order: number;
  is_active: boolean;
};

function parseCurrencyRow(row: Record<string, unknown>): CurrencyListItem {
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    name_zh: String(row.name_zh ?? row.name ?? ""),
    name_en: row.name_en != null ? String(row.name_en) : null,
    symbol: row.symbol != null ? String(row.symbol) : null,
    badge_color: row.badge_color != null ? String(row.badge_color) : null,
    sort_order: Number(row.sort_order ?? 0),
    is_active: parseActivityTypeActive(row.is_active),
  };
}

export type CustomerSourceListItem = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function parseCustomerSourceRow(row: Record<string, unknown>): CustomerSourceListItem {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    sort_order: Number(row.sort_order ?? 0),
    is_active: parseActivityTypeActive(row.is_active),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export type ShiftReceiverListItem = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function parseShiftReceiverRow(row: Record<string, unknown>): ShiftReceiverListItem {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export type ShiftHandoverListItem = {
  id: string;
  handover_employee_id: string | null;
  handover_employee_name: string;
  receiver_name: string;
  handover_time: string;
  card_merchant_data: unknown;
  payment_provider_data: unknown;
  remark: string | null;
  created_at: string;
};

function parseShiftHandoverRow(row: Record<string, unknown>): ShiftHandoverListItem {
  return {
    id: String(row.id ?? ""),
    handover_employee_id:
      row.handover_employee_id != null && String(row.handover_employee_id).trim() !== ""
        ? String(row.handover_employee_id)
        : null,
    handover_employee_name: String(row.handover_employee_name ?? ""),
    receiver_name: String(row.receiver_name ?? ""),
    handover_time: String(row.handover_time ?? ""),
    card_merchant_data: row.card_merchant_data ?? null,
    payment_provider_data: row.payment_provider_data ?? null,
    remark: row.remark != null && String(row.remark) !== "" ? String(row.remark) : null,
    created_at: String(row.created_at ?? ""),
  };
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
  return extractArrayPayload(res).map((item) =>
    parseCurrencyRow(item as Record<string, unknown>),
  );
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
  return extractArrayPayload(res).map((item) =>
    parseCustomerSourceRow(item as Record<string, unknown>),
  );
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
  return extractArrayPayload(res).map((item) =>
    parseShiftReceiverRow(item as Record<string, unknown>),
  );
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
  return extractArrayPayload(res).map((item) =>
    parseShiftHandoverRow(item as Record<string, unknown>),
  );
}
