/**
 * 会员门户 — 积分余额、明细、积分商城列表与兑换记录（页面只调此处）
 */
import { safeCall } from "@/lib/serviceErrorHandler";
import {
  listMemberPointsMallItems,
  listMemberPointsMallCategories,
  listMemberRedemptionsForPortal,
  redeemPointsMallItem,
  type MemberPortalRedemptionRow,
  type PointsMallItem,
  type PointsMallCategory,
} from "@/services/members/memberPointsMallService";

export {
  getMemberPointsRpc,
  getMemberPointsBreakdownRpc,
} from "@/services/points/memberPointsRpcService";

export {
  listMemberPointsMallItems,
  listMemberPointsMallCategories,
  listMemberRedemptionsForPortal,
  redeemPointsMallItem,
  type MemberPortalRedemptionRow,
  type PointsMallItem,
  type PointsMallCategory,
};

export async function loadMemberPointsMallCatalog(memberId: string) {
  return safeCall(
    () => listMemberPointsMallItems(memberId),
    [],
    "loadMemberPointsMallCatalog",
  );
}

export async function loadMemberPointsMallCategories(memberId: string) {
  return safeCall(
    () => listMemberPointsMallCategories(memberId),
    [],
    "loadMemberPointsMallCategories",
  );
}

export async function loadMemberRedemptionsForPortalPage(memberId: string, limit = 20) {
  return safeCall(
    () => listMemberRedemptionsForPortal(memberId, limit),
    [],
    "loadMemberRedemptionsForPortalPage",
  );
}
