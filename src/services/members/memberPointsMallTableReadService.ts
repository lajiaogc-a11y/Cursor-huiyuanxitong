/**
 * 会员积分商城 — 表代理只读（仅员工 JWT；会员端请用 RPC member_list_points_mall_redemptions 等）
 */
import { apiGet } from "@/api/client";

export type RedemptionTableRow = {
  id: string;
  prize_id: string;
  mall_item_id: string;
  status: string;
  created_at: string;
  points_used: number;
  quantity: number;
};

export async function listRedemptionsByMember(memberId: string, limit: number): Promise<RedemptionTableRow[]> {
  const q = encodeURIComponent(memberId);
  const rows = await apiGet<RedemptionTableRow[]>(
    `/api/data/table/redemptions?select=id,prize_id,mall_item_id,status,created_at,points_used,quantity&member_id=eq.${q}&mall_item_id=not.is.null&order=created_at.desc&limit=${limit}`,
  );
  return Array.isArray(rows) ? rows : [];
}

export async function fetchPrizeNameMap(prizeIds: string[]): Promise<Map<string, string>> {
  if (prizeIds.length === 0) return new Map();
  const prizes = await apiGet<{ id: string; name: string }[]>(
    `/api/data/table/prizes?select=id,name&id=in.(${prizeIds.join(",")})`,
  );
  return new Map((prizes || []).map((p) => [p.id, p.name]));
}

export async function fetchMallItemTitleMap(mallItemIds: string[]): Promise<Map<string, string>> {
  if (mallItemIds.length === 0) return new Map();
  const items = await apiGet<Array<{ id: string; title?: string; name?: string }>>(
    `/api/data/table/member_points_mall_items?select=id,title,name&id=in.(${mallItemIds.join(",")})`,
  );
  return new Map((items || []).map((i) => [i.id, String(i.title ?? i.name ?? "—")]));
}
