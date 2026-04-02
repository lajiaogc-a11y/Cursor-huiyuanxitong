/**
 * 币种表 CRUD（/api/data/table/currencies），供设置页使用
 */
import { apiDelete, apiPatch, apiPost } from "@/api/client";

const BASE = "/api/data/table/currencies";

export type CurrencyRow = {
  id: string;
  code: string;
  name_zh: string;
  name_en?: string | null;
  badge_color?: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function insertCurrency(row: Omit<CurrencyRow, "id"> & { id?: string }): Promise<CurrencyRow> {
  const created = await apiPost<CurrencyRow | CurrencyRow[]>(BASE, { data: row });
  return Array.isArray(created) ? created[0] : created;
}

export async function updateCurrency(id: string, patch: Partial<CurrencyRow>): Promise<void> {
  await apiPatch(`${BASE}?id=eq.${encodeURIComponent(id)}`, { data: patch });
}

export async function deleteCurrencyById(id: string): Promise<void> {
  await apiDelete(`${BASE}?id=eq.${encodeURIComponent(id)}`);
}
