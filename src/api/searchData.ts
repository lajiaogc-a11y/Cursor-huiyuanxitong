/**
 * 全局搜索 — members / cards 表代理
 */
import { apiGet } from './client';


export type GlobalSearchMemberRow = { id: string; phone_number: string; member_code: string };
export type GlobalSearchCardRow = { id: string; name: string; status: string };

export function searchMembersData(q: string) {
  const orParam = encodeURIComponent(`phone_number.ilike.%${q}%,member_code.ilike.%${q}%`);
  return apiGet<GlobalSearchMemberRow[]>(`/api/data/table/members?select=id,phone_number,member_code&or=${orParam}&limit=5`);
}

export function searchCardsData(q: string) {
  return apiGet<GlobalSearchCardRow[]>(`/api/data/table/cards?select=id,name,status&name=ilike.${encodeURIComponent(`%${q}%`)}&limit=5`);
}
