/**
 * 员工端全局搜索：表代理查询（会员 / 商家卡）
 */
import { apiGet } from '@/api/client';

export type GlobalSearchMemberRow = { id: string; phone_number: string; member_code: string };
export type GlobalSearchCardRow = { id: string; name: string; status: string };

export async function searchMembersForGlobalSearch(q: string): Promise<GlobalSearchMemberRow[]> {
  const orParam = encodeURIComponent(`phone_number.ilike.%${q}%,member_code.ilike.%${q}%`);
  const members = await apiGet<GlobalSearchMemberRow[]>(
    `/api/data/table/members?select=id,phone_number,member_code&or=${orParam}&limit=5`,
  );
  return Array.isArray(members) ? members : [];
}

export async function searchCardsForGlobalSearch(q: string): Promise<GlobalSearchCardRow[]> {
  const cards = await apiGet<GlobalSearchCardRow[]>(
    `/api/data/table/cards?select=id,name,status&name=ilike.${encodeURIComponent(`%${q}%`)}&limit=5`,
  );
  return Array.isArray(cards) ? cards : [];
}
