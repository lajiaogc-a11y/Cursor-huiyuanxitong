/**
 * Currencies 表代理 — 币种 CRUD
 */
import { apiPost, apiPatch, apiDelete } from './client';


export type CurrencyRow = {
  id: string;
  code: string;
  name_zh: string;
  name_en?: string | null;
  badge_color?: string | null;
  sort_order: number;
  is_active: boolean;
};

export function insertCurrencyData(row: Omit<CurrencyRow, 'id'> & { id?: string }) {
  return apiPost<CurrencyRow | CurrencyRow[]>('/api/data/table/currencies', { data: row });
}

export function updateCurrencyData(id: string, patch: Partial<CurrencyRow>) {
  return apiPatch(`/api/data/table/currencies?id=eq.${encodeURIComponent(id)}`, { data: patch });
}

export function deleteCurrencyData(id: string) {
  return apiDelete(`/api/data/table/currencies?id=eq.${encodeURIComponent(id)}`);
}
