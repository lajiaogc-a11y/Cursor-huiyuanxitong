/**
 * 积分商城：会员端一律走 RPC；表代理 GET 对会员 JWT 禁止（403）。
 */
export type {
  PointsMallItem,
  PointsMallCategory,
  PointsMallRedemptionOrder,
  RedeemPointsMallItemResult,
  MemberPortalRedemptionRpcRow,
} from "@/services/members/memberPointsMallRpcService";
export {
  listMyPointsMallItems,
  upsertMyPointsMallItems,
  listMemberPointsMallItems,
  listMemberPointsMallCategories,
  listMyPointsMallCategories,
  saveMyPointsMallCategories,
  listMemberPointsMallRedemptionsForPortal,
  redeemPointsMallItem,
  listMyPointsMallRedemptionOrders,
  processMyPointsMallRedemptionOrder,
} from "@/services/members/memberPointsMallRpcService";

import { listMemberPointsMallRedemptionsForPortal } from "@/services/members/memberPointsMallRpcService";

/** 会员端积分商城 — 最近兑换记录（服务端 JOIN 解析名称） */
export type MemberPortalRedemptionRow = import("@/services/members/memberPointsMallRpcService").MemberPortalRedemptionRpcRow;

export async function listMemberRedemptionsForPortal(memberId: string, limit = 10): Promise<MemberPortalRedemptionRow[]> {
  return listMemberPointsMallRedemptionsForPortal(memberId, limit);
}
