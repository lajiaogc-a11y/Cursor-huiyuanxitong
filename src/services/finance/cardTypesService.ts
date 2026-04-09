/**
 * 卡类型字典表：读表代理，全量替换走 RPC sync_card_types
 */
import { dataTableApi, dataRpcApi } from "@/api/data";

export async function listCardTypeNames(): Promise<string[]> {
  const data = await dataTableApi
    .get<{ name?: string }[]>("card_types", "select=name&order=sort_order.asc")
    .catch((err) => { console.warn('[cardTypesService] listCardTypeNames fetch failed silently:', err); return []; });
  if (!Array.isArray(data)) return [];
  return data.map((row) => String(row?.name ?? "")).filter(Boolean);
}

export async function replaceCardTypes(types: string[]): Promise<void> {
  await dataRpcApi.call("sync_card_types", { types });
}
