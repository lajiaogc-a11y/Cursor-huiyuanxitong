/**
 * 币种表 CRUD（/api/data/table/currencies），供设置页使用
 */
import { dataTableApi } from "@/api/data";

const TABLE = "currencies";

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
  const created = await dataTableApi.post<CurrencyRow | CurrencyRow[]>(TABLE, { data: row });
  return Array.isArray(created) ? created[0] : created;
}

export async function updateCurrency(id: string, patch: Partial<CurrencyRow>): Promise<void> {
  await dataTableApi.patch(TABLE, `id=eq.${encodeURIComponent(id)}`, { data: patch });
}

export async function deleteCurrencyById(id: string): Promise<void> {
  await dataTableApi.del(TABLE, `id=eq.${encodeURIComponent(id)}`);
}
