/**
 * 币种表 CRUD（/api/data/table/currencies），供设置页使用
 */
import { insertCurrencyData, updateCurrencyData, deleteCurrencyData } from "@/api/currencyData";
import type { CurrencyRow } from "@/api/currencyData";

export async function insertCurrency(row: Omit<CurrencyRow, "id"> & { id?: string }): Promise<CurrencyRow> {
  const created = await insertCurrencyData(row);
  return Array.isArray(created) ? created[0] : created;
}

export async function updateCurrency(id: string, patch: Partial<CurrencyRow>): Promise<void> {
  await updateCurrencyData(id, patch);
}

export async function deleteCurrencyById(id: string): Promise<void> {
  await deleteCurrencyData(id);
}
