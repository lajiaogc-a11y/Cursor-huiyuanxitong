import { inviteApi } from "@/api/invite";

export type InviteRankingEntry = {
  name: string;
  invite_count: number;
  is_fake: boolean;
};

/** 会员 JWT：合并真实用户 + 系统假用户后的前 5 名 */
export async function fetchInviteRankingTop5(): Promise<InviteRankingEntry[]> {
  const res = (await inviteApi.getRankingTop5()) as { success?: boolean; top5?: InviteRankingEntry[] };
  const raw = res as { top5?: InviteRankingEntry[] };
  const list = Array.isArray(raw.top5) ? raw.top5 : [];
  return list.slice(0, 5);
}
