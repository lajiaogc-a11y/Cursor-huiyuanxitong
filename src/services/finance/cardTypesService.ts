/**
 * 卡类型字典表：读表代理，全量替换走 RPC sync_card_types
 */
import { listCardTypeNamesData } from "@/api/financeTableData";
import { financeApi } from "@/api/finance";

export async function listCardTypeNames(): Promise<string[]> {
  const data = await listCardTypeNamesData()
    .catch((err) => { console.warn('[cardTypesService] listCardTypeNames fetch failed silently:', err); return []; });
  if (!Array.isArray(data)) return [];
  return data.map((row) => String(row?.name ?? "")).filter(Boolean);
}

export async function replaceCardTypes(types: string[]): Promise<void> {
  await financeApi.syncCardTypes(types);
}
