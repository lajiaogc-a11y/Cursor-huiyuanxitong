/**
 * 会员积分 API 服务
 * - 员工端（有 JWT 且非会员路径）：通过后端 API 调用
 * - 会员端（无 JWT 或当前在 /member/*）：通过后端 API rpc stub
 */
import { apiGet, apiPost, hasAuthToken, unwrapApiData } from '@/api/client';
import { isMemberRealmPathname } from '@/lib/memberTokenPathMatrix';
import { getSpaPathname } from '@/lib/spaNavigation';
import { MEMBER_POINTS_HTTP_PATHS, MEMBER_PORTAL_RPC_PATHS } from '@/services/memberPortal/routes';
import type { MemberPointsResult, MemberPointsBreakdownResult, MemberSpinQuotaResult } from './memberPointsApiTypes';

export type { MemberPointsResult, MemberPointsBreakdownResult, MemberSpinQuotaResult };

export type MemberLedgerCategory = "all" | "consumption" | "referral" | "lottery";

export type MemberPointsLedgerRow = {
  id: string;
  order_id: string | null;
  order_number: string | null;
  reference_id: string | null;
  earned_at: string;
  points: number;
  balance_before: number;
  balance_after: number;
  type: string;
  description: string | null;
};

export type MemberPointsLedgerListResult = {
  success: boolean;
  rows: MemberPointsLedgerRow[];
  total: number;
  error?: string;
};

/** 非 React Hook：会员域或无员工 JWT 时走会员门户 RPC，避免误用 Hook 命名 */
function shouldUseMemberPortalPointsPath(): boolean {
  if (typeof window === 'undefined') return false;
  return !hasAuthToken() || isMemberRealmPathname(getSpaPathname());
}

/** 获取会员积分 */
export async function getMemberPointsRpc(memberId: string): Promise<MemberPointsResult> {
  try {
    if (!shouldUseMemberPortalPointsPath()) {
      const res = await apiGet<{ success: boolean; data: MemberPointsResult }>(
        MEMBER_POINTS_HTTP_PATHS.member(memberId)
      );
      return res.data ?? { success: false, points: 0 };
    }
    const data = await apiPost<any>(MEMBER_PORTAL_RPC_PATHS.MEMBER_GET_POINTS, { p_member_id: memberId });
    const r = data as { success?: boolean; points?: number; balance?: number; frozen_points?: number; total_points?: number };
    const pts = r?.success ? Number(r.points ?? r.balance ?? 0) : 0;
    const frozen = r?.success ? Number(r.frozen_points ?? 0) : 0;
    return { success: !!r?.success, points: pts, frozen_points: frozen, total_points: pts + frozen };
  } catch (e) {
    console.error('[memberPointsRpcService] getMemberPoints error:', e);
    return { success: false, points: 0, frozen_points: 0, total_points: 0 };
  }
}

/** 获取会员积分分类明细 */
export async function getMemberPointsBreakdownRpc(
  memberId: string
): Promise<MemberPointsBreakdownResult> {
  try {
    if (!shouldUseMemberPortalPointsPath()) {
      const res = await apiGet<MemberPointsBreakdownResult | { success?: boolean; data?: MemberPointsBreakdownResult }>(
        MEMBER_POINTS_HTTP_PATHS.breakdown(memberId)
      );
      const d = unwrapApiData<MemberPointsBreakdownResult>(res);
      if (!d?.success) {
        return {
          success: false,
          consumption_points: 0,
          referral_points: 0,
          lottery_points: 0,
          total_points: 0,
        };
      }
      const total = Number(d.total_points ?? d.balance ?? 0);
      return {
        success: true,
        balance: Number(d.balance ?? total),
        consumption_points: Number(d.consumption_points ?? 0),
        referral_points: Number(d.referral_points ?? 0),
        lottery_points: Number(d.lottery_points ?? 0),
        total_points: total,
        frozen_points: Number(d.frozen_points ?? 0),
        pending_mall_points: Number(d.pending_mall_points ?? 0),
        referral_count: Math.max(0, Math.floor(Number(d.referral_count ?? 0))),
      };
    }
    const data = await apiPost<any>(MEMBER_PORTAL_RPC_PATHS.MEMBER_GET_POINTS_BREAKDOWN, { p_member_id: memberId });
    const r = data as {
      success?: boolean;
      balance?: number;
      consumption_points?: number;
      referral_points?: number;
      lottery_points?: number;
      total_points?: number;
      frozen_points?: number;
      pending_mall_points?: number;
      referral_count?: number;
    };
    if (!r?.success) {
      return {
        success: false,
        consumption_points: 0,
        referral_points: 0,
        lottery_points: 0,
        total_points: 0,
      };
    }
    const total = Number(r.total_points ?? r.balance ?? 0);
    return {
      success: true,
      balance: Number(r.balance ?? total),
      consumption_points: Number(r.consumption_points ?? 0),
      referral_points: Number(r.referral_points ?? 0),
      lottery_points: Number(r.lottery_points ?? 0),
      total_points: total,
      frozen_points: Number(r.frozen_points ?? 0),
      pending_mall_points: Number(r.pending_mall_points ?? 0),
      referral_count: Math.max(0, Math.floor(Number(r.referral_count ?? 0))),
    };
  } catch (e) {
    console.error('[memberPointsRpcService] getMemberPointsBreakdown error:', e);
    return {
      success: false,
      consumption_points: 0,
      referral_points: 0,
      lottery_points: 0,
      total_points: 0,
    };
  }
}

/** 会员端：积分流水（与后台 points_ledger 同步，仅展示订单号/时间/获得积分） */
export async function getMemberPointsLedgerRpc(
  memberId: string,
  category: MemberLedgerCategory,
  limit = 80,
  offset = 0
): Promise<MemberPointsLedgerListResult> {
  try {
    const data = await apiPost<MemberPointsLedgerListResult>(MEMBER_PORTAL_RPC_PATHS.MEMBER_LIST_POINTS_LEDGER, {
      p_member_id: memberId,
      p_category: category,
      p_limit: limit,
      p_offset: offset,
    });
    if (!data?.success) {
      return { success: false, rows: [], total: 0, error: data?.error || "LOAD_FAILED" };
    }
    return {
      success: true,
      rows: Array.isArray(data.rows) ? data.rows : [],
      total: Number(data.total ?? 0),
    };
  } catch (e) {
    console.error("[memberPointsRpcService] getMemberPointsLedgerRpc error:", e);
    return { success: false, rows: [], total: 0, error: "NETWORK" };
  }
}

/** Server-side SUM of today's earned points — no row-count cap */
export async function getMemberTodayEarnedRpc(memberId: string): Promise<number> {
  try {
    const data = await apiPost<{ success?: boolean; earned?: number }>(
      MEMBER_PORTAL_RPC_PATHS.MEMBER_SUM_TODAY_EARNED,
      { p_member_id: memberId },
    );
    return data?.success ? Math.max(0, Number(data.earned ?? 0)) : 0;
  } catch {
    return 0;
  }
}

/** 获取会员抽奖剩余次数 */
export async function getMemberSpinQuotaRpc(memberId: string): Promise<MemberSpinQuotaResult> {
  try {
    if (!shouldUseMemberPortalPointsPath()) {
      const res = await apiGet<MemberSpinQuotaResult | { success?: boolean; data?: MemberSpinQuotaResult }>(
        MEMBER_POINTS_HTTP_PATHS.spinQuota(memberId)
      );
      const d = unwrapApiData<MemberSpinQuotaResult>(res);
      return {
        success: !!d?.success,
        remaining: d?.success ? Number(d.remaining ?? 0) : 0,
      };
    }
    const data = await apiPost<any>(MEMBER_PORTAL_RPC_PATHS.MEMBER_GET_SPIN_QUOTA, { p_member_id: memberId });
    const r = data as { success?: boolean; remaining?: number };
    return {
      success: !!r?.success,
      remaining: r?.success ? Number(r.remaining ?? 0) : 0,
    };
  } catch (e) {
    console.error('[memberPointsRpcService] getMemberSpinQuota error:', e);
    return { success: false, remaining: 0 };
  }
}
