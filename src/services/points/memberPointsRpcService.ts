/**
 * 会员积分 API 服务
 * - 员工端（有 JWT 且非会员路径）：通过后端 API 调用
 * - 会员端（无 JWT 或当前在 /member/*）：直接 Supabase RPC，避免 401 导致登录后闪退
 */
import { apiGet, hasAuthToken, unwrapApiData } from '@/api/client';
import { supabase } from '@/integrations/supabase/client';
import type { MemberPointsResult, MemberPointsBreakdownResult, MemberSpinQuotaResult } from './memberPointsApiTypes';

export type { MemberPointsResult, MemberPointsBreakdownResult, MemberSpinQuotaResult };

function useSupabaseForMember(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return !hasAuthToken() || path.startsWith('/member');
}

/** 获取会员积分 */
export async function getMemberPointsRpc(memberId: string): Promise<MemberPointsResult> {
  try {
    if (!useSupabaseForMember()) {
      const res = await apiGet<{ success: boolean; data: MemberPointsResult }>(
        `/api/points/member/${encodeURIComponent(memberId)}`
      );
      return res.data ?? { success: false, points: 0 };
    }
    const { data, error } = await supabase.rpc('member_get_points', { p_member_id: memberId });
    if (error) throw error;
    const r = data as { success?: boolean; points?: number };
    return { success: !!r?.success, points: r?.success ? Number(r.points ?? 0) : 0 };
  } catch (e) {
    console.error('[memberPointsRpcService] getMemberPoints error:', e);
    return { success: false, points: 0 };
  }
}

/** 获取会员积分分类明细 */
export async function getMemberPointsBreakdownRpc(
  memberId: string
): Promise<MemberPointsBreakdownResult> {
  try {
    if (!useSupabaseForMember()) {
      const res = await apiGet<MemberPointsBreakdownResult | { success?: boolean; data?: MemberPointsBreakdownResult }>(
        `/api/points/member/${encodeURIComponent(memberId)}/breakdown`
      );
      const d = unwrapApiData<MemberPointsBreakdownResult>(res);
      if (!d?.success) {
        return { success: false, consumption_points: 0, referral_points: 0, total_points: 0 };
      }
      return {
        success: true,
        consumption_points: Number(d.consumption_points ?? 0),
        referral_points: Number(d.referral_points ?? 0),
        total_points: Number(d.total_points ?? 0),
      };
    }
    const { data, error } = await supabase.rpc('member_get_points_breakdown', { p_member_id: memberId });
    if (error) throw error;
    const r = data as { success?: boolean; consumption_points?: number; referral_points?: number; total_points?: number };
    if (!r?.success) {
      return { success: false, consumption_points: 0, referral_points: 0, total_points: 0 };
    }
    return {
      success: true,
      consumption_points: Number(r.consumption_points ?? 0),
      referral_points: Number(r.referral_points ?? 0),
      total_points: Number(r.total_points ?? 0),
    };
  } catch (e) {
    console.error('[memberPointsRpcService] getMemberPointsBreakdown error:', e);
    return { success: false, consumption_points: 0, referral_points: 0, total_points: 0 };
  }
}

/** 获取会员抽奖剩余次数 */
export async function getMemberSpinQuotaRpc(memberId: string): Promise<MemberSpinQuotaResult> {
  try {
    if (!useSupabaseForMember()) {
      const res = await apiGet<MemberSpinQuotaResult | { success?: boolean; data?: MemberSpinQuotaResult }>(
        `/api/points/member/${encodeURIComponent(memberId)}/spin-quota`
      );
      const d = unwrapApiData<MemberSpinQuotaResult>(res);
      return {
        success: !!d?.success,
        remaining: d?.success ? Number(d.remaining ?? 0) : 0,
      };
    }
    const { data, error } = await supabase.rpc('member_get_spin_quota', { p_member_id: memberId });
    if (error) throw error;
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
