/**
 * 员工端全局搜索：表代理查询（会员 / 商家卡）
 */
import { dataTableApi } from '@/api/data';

export type GlobalSearchMemberRow = { id: string; phone_number: string; member_code: string };
export type GlobalSearchCardRow = { id: string; name: string; status: string };

export async function searchMembersForGlobalSearch(q: string): Promise<GlobalSearchMemberRow[]> {
  const orParam = encodeURIComponent(`phone_number.ilike.%${q}%,member_code.ilike.%${q}%`);
  const members = await dataTableApi.get<GlobalSearchMemberRow[]>(
    "members",
    `select=id,phone_number,member_code&or=${orParam}&limit=5`,
  );
  return Array.isArray(members) ? members : [];
}

export async function searchCardsForGlobalSearch(q: string): Promise<GlobalSearchCardRow[]> {
  const cards = await dataTableApi.get<GlobalSearchCardRow[]>(
    "cards",
    `select=id,name,status&name=ilike.${encodeURIComponent(`%${q}%`)}&limit=5`,
  );
  return Array.isArray(cards) ? cards : [];
}
