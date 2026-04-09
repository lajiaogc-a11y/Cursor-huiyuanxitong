/**
 * 员工端全局搜索：表代理查询（会员 / 商家卡）
 */
import {
  searchMembersData,
  searchCardsData,
  type GlobalSearchMemberRow,
  type GlobalSearchCardRow,
} from '@/api/searchData';

export type { GlobalSearchMemberRow, GlobalSearchCardRow } from '@/api/searchData';

export async function searchMembersForGlobalSearch(q: string): Promise<GlobalSearchMemberRow[]> {
  const members = await searchMembersData(q);
  return Array.isArray(members) ? members : [];
}

export async function searchCardsForGlobalSearch(q: string): Promise<GlobalSearchCardRow[]> {
  const cards = await searchCardsData(q);
  return Array.isArray(cards) ? cards : [];
}
